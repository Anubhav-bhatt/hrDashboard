/**
 * Standard Mode dashboard suite: routes, section order, data fidelity, the
 * shared next-action helper, empty/error/scoped states, responsive layout,
 * touch targets, keyboard use, and both themes.
 *
 * Every number on screen is compared with the /dashboard/overview and
 * /jobs/summary responses the page itself received, so the suite works against
 * any dataset.
 *
 * Usage: node dashboard.mjs
 * Environment: E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD, E2E_BROWSER, E2E_HEADED,
 *              E2E_SCREENSHOT_DIR (optional full-page captures per width/theme)
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CHANNEL = process.env.E2E_BROWSER || 'msedge';
const WIDTHS = [360, 390, 430, 768, 1024, 1440, 1920];
const SECTION_ORDER = ['Recruitment snapshot', 'Recommended next step', 'Needs attention', 'Hiring roles', 'Hiring pipeline', 'Match quality', 'Recent candidates'];
const THEME_KEY = 'hr-dashboard-theme';

if (!EMAIL || !PASSWORD) {
  console.error('E2E_EMAIL and E2E_PASSWORD must be set to a recruiter account.');
  process.exit(1);
}

const browser = await chromium.launch({
  ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }),
  headless: process.env.E2E_HEADED !== '1'
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleIssues = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleIssues.push(message.text().slice(0, 200));
});
page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 200)));

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? `  ::  ${detail}` : ''}`);
  }
};
const section = (title) => console.log(`\n=== ${title} ===`);
const SNAPSHOT = 'section[aria-labelledby="dashboard-snapshot-heading"]';
const hrefOf = (locator) => locator.evaluate((el) => new URL(el.href).pathname + new URL(el.href).search);
const isApi = (fragment) => (r) => r.url().includes(fragment) && r.request().method() === 'GET';

/** Navigates and resolves with the two payloads the page rendered. */
const openDashboard = async (path = '/') => {
  const overviewResponse = page.waitForResponse(isApi('/dashboard/overview'));
  const jobsResponse = page.waitForResponse(isApi('/jobs/summary'));
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  const [overview, jobs] = await Promise.all([overviewResponse, jobsResponse].map(async (r) => (await (await r).json()).data));
  await page.locator(`${SNAPSHOT}, [role="alert"], h3:has-text("No hiring activity yet")`).first().waitFor({ state: 'visible', timeout: 20000 });
  return { overview, jobs };
};

try {
  section('Sign in');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
  check(true, 'recruiter signed in');

  /* ------------------------------------------------------------ routes --- */
  section('Routes');
  const { overview: data, jobs } = await openDashboard('/');
  check(await page.locator(SNAPSHOT).isVisible(), '/ renders the dashboard');
  const rootHeadings = await page.locator('main h2').allInnerTexts();
  await openDashboard('/dashboard');
  check(page.url().endsWith('/dashboard'), '/dashboard stays on its own URL', page.url());
  check(JSON.stringify(await page.locator('main h2').allInnerTexts()) === JSON.stringify(rootHeadings), 'alias and root render identical sections');
  const current = page.locator('a[aria-current="page"]', { hasText: 'Dashboard' });
  check((await current.count()) >= 1, 'Dashboard navigation item is current on the alias');
  await openDashboard('/');

  /* ----------------------------------------------------------- structure --- */
  section('Structure');
  const threshold = data.strongMatchThreshold;
  check((await page.locator('main h1').count()) === 1, 'exactly one h1');
  const headings = (await page.locator('main h2').allInnerTexts()).map((h) => h.trim()).filter((h) => h !== 'Continue where you left off');
  check(JSON.stringify(headings) === JSON.stringify(SECTION_ORDER), 'sections appear in the specified order', headings.join(' > '));
  const bodyText = await page.locator('main').innerText();
  check(!/\bNaN\b|\bundefined\b|\bnull\b/.test(bodyText), 'no NaN, undefined or null on screen');
  check(!/analytics|recent hires|average/i.test(bodyText), 'no collapsed analytics, hires feed or average-score widget');
  check((await page.locator('main table').count()) === 0, 'no tables on the dashboard');
  const headerCreate = page.locator('main header').first().locator('a[href="/jobs/new"]');
  check((await headerCreate.count()) === 1 && !(await headerCreate.getAttribute('class')).includes('btn-primary'), 'header offers Create job as a secondary action');
  check((await page.locator('main .btn-primary').count()) === 1, 'the recommended step is the only primary CTA');
  check((await page.locator('main a a, main a button, main button a, main button button').count()) === 0, 'no nested interactive elements');
  const unlabeled = await page.evaluate(() => Array.from(document.querySelectorAll('main a, main button'))
    .filter((el) => el.offsetParent !== null && !(el.getAttribute('aria-label') || el.innerText).trim()).length);
  check(unlabeled === 0, 'every visible link and button has an accessible name');

  /* ------------------------------------------------------------- KPIs --- */
  section('Recruitment snapshot');
  const kpis = [
    ['Open jobs', data.metrics.openJobs, '/jobs'],
    ['Active candidates', data.metrics.totalCandidates, '/candidates?sort=score_desc'],
    ['Strong matches', data.metrics.strongMatch, `/candidates?minScore=${data.strongMatchThreshold}&sort=score_desc`],
    ['Shortlisted', data.metrics.shortlisted, '/candidates?hrStatus=SHORTLISTED&sort=score_desc']
  ];
  check((await page.locator('main header').first().innerText()).includes(`${data.metrics.pendingReview} awaiting review`), 'header summary states the review backlog');
  check((await page.locator(`${SNAPSHOT} a`).count()) === 4, 'exactly four KPI cards');
  for (const [label, value, href] of kpis) {
    const card = page.locator(`${SNAPSHOT} a[aria-label="${label}: ${value}"]`);
    check((await card.count()) === 1, `${label} shows ${value}`);
    if (await card.count()) check(decodeURIComponent(await hrefOf(card)) === href, `${label} links to ${href}`);
  }
  check(data.metrics.openJobs === jobs.length, 'Open jobs agrees with the open-role list');
  const metricSize = await page.locator(`${SNAPSHOT} .text-metric`).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check(metricSize >= 24 && metricSize <= 30, `KPI metric size is 24–30px (${metricSize}px)`);

  /* ------------------------------------------- shared next-action helper --- */
  // Expected decisions come from the app's own helper (served by the dev server), so the
  // suite checks that every section uses it rather than re-implementing its rules.
  const queue = await page.evaluate(async ({ jobs: j, threshold: t }) => {
    const { deriveAttentionItems } = await import('/src/components/dashboard/NeedsAttention.jsx');
    return deriveAttentionItems(j, t).map((item) => ({ id: item.job.id, title: item.job.title, to: item.to, fact: item.fact }));
  }, { jobs, threshold });
  check(queue.length > 0, 'the shared deriveAttentionItems helper produces a queue for this data');

  section('Recommended next step');
  const recommendedSection = page.locator('section[aria-labelledby="dashboard-recommended-heading"]');
  const recommendedLinks = recommendedSection.locator('a');
  check((await recommendedLinks.count()) === 1, 'one dominant CTA');
  if (queue[0]) {
    const rec = queue[0];
    const text = await recommendedSection.innerText();
    check(text.includes(rec.title) && text.includes(rec.fact), 'recommendation is the head of the shared queue');
    check(await hrefOf(recommendedLinks.first()) === rec.to, 'CTA uses the helper destination', rec.to);
    await recommendedLinks.first().click();
    await page.waitForURL((url) => url.pathname + url.search === rec.to, { timeout: 15000 });
    check(true, `CTA navigates to ${rec.to}`);
    await page.locator('main h1, main h2').first().waitFor({ state: 'visible', timeout: 20000 });
    check(!/page not found/i.test(await page.locator('main').innerText()), 'CTA destination is a real page');
    await openDashboard('/');
  }

  section('Needs attention');
  const attentionItems = page.locator('section[aria-labelledby="dashboard-attention-heading"] li');
  const attentionCount = await attentionItems.count();
  const expectedAttention = queue.slice(1, 4);
  check(attentionCount === expectedAttention.length && attentionCount <= 3, `shows ${attentionCount} item(s), capped at 3`);
  for (let i = 0; i < attentionCount; i++) {
    const item = expectedAttention[i];
    check((await attentionItems.nth(i).innerText()).includes(item.title), `item ${i + 1} names ${item.title}`);
    check(await hrefOf(attentionItems.nth(i).locator('a')) === item.to, `item ${i + 1} links to its next action`);
  }
  if (attentionCount) {
    await attentionItems.first().locator('a').click();
    await page.waitForURL((url) => url.pathname + url.search === expectedAttention[0].to, { timeout: 15000 });
    check(true, 'attention action navigates');
    await openDashboard('/');
  }

  section('Hiring roles');
  const roleItems = page.locator('section[aria-labelledby="dashboard-roles-heading"] li');
  check((await roleItems.count()) === Math.min(jobs.length, 5), `shows ${await roleItems.count()} role(s), at most 5`);
  const nextActions = await page.evaluate(async ({ jobs: j, threshold: t }) => {
    const { deriveNextAction } = await import('/src/components/dashboard/NeedsAttention.jsx');
    return j.slice(0, 5).map((job) => deriveNextAction(job, t)?.to || null);
  }, { jobs, threshold });
  for (let i = 0; i < (await roleItems.count()); i++) {
    const job = jobs[i];
    const row = roleItems.nth(i);
    const rowText = await row.innerText();
    check(rowText.includes(job.title) && rowText.includes(`${job.pendingReviewCount} awaiting review`), `row ${i + 1} summarises ${job.title}`);
    check(await hrefOf(row.locator(`a[aria-label="Open job: ${job.title}"]`)) === `/jobs/${job.id}`, `row ${i + 1} opens the job`);
    if (nextActions[i]) check(await hrefOf(row.locator('a').nth(1)) === nextActions[i], `row ${i + 1} action matches the shared helper`);
  }
  const viewAll = page.locator('section[aria-labelledby="dashboard-roles-heading"] a', { hasText: 'View all jobs' });
  check((await viewAll.count()) === 1 && await hrefOf(viewAll) === '/jobs', 'View all jobs links to /jobs');

  /* ----------------------------------------------- pipeline and quality --- */
  section('Pipeline and match quality');
  for (const stage of data.pipeline) {
    const link = page.locator(`section[aria-labelledby="dashboard-pipeline-heading"] a[aria-label="${stage.label}: ${stage.count} candidates"]`);
    check((await link.count()) === 1 && decodeURIComponent(await hrefOf(link)) === `/candidates?hrStatus=${stage.key}&sort=score_desc`, `${stage.label} (${stage.count}) links to its filter`);
  }
  const qualityText = await page.locator('section[aria-labelledby="dashboard-quality-heading"]').innerText();
  check(qualityText.includes(`${threshold}%`), `match quality states the shared ${threshold}% threshold`);
  for (const band of data.scoreBands) {
    check((await page.locator(`section[aria-labelledby="dashboard-quality-heading"] a[aria-label="${band.label}: ${band.count} candidates"]`).count()) === 1, `${band.label} band shows ${band.count}`);
  }

  section('Recent candidates');
  const recentLinks = page.locator('section[aria-labelledby="dashboard-recent-heading"] li a');
  check((await recentLinks.count()) === Math.min(data.recentCandidates.length, 5), 'up to five recent candidates');
  if (data.recentCandidates.length) {
    check(await hrefOf(recentLinks.first()) === `/candidates/${data.recentCandidates[0]._id || data.recentCandidates[0].id}`, 'rows link to the candidate profile');
  }

  /* ------------------------------------------------------- job scope --- */
  if (jobs.length > 1) {
    section('Role scope');
    const target = jobs.find((job) => job.candidateCount > 0) || jobs[0];
    const scoped = page.waitForResponse((r) => r.url().includes('/dashboard/overview') && r.url().includes(target.id));
    await page.selectOption('#dashboard-scope', target.id);
    const scopedData = (await (await scoped).json()).data;
    await page.getByText(`Filtered to ${target.title}`).waitFor({ state: 'visible', timeout: 15000 });
    check(page.url().includes(`jobId=${target.id}`), 'scope is mirrored into the URL');
    check((await page.locator(`${SNAPSHOT} a[aria-label="Candidates: ${scopedData.metrics.totalCandidates}"]`).count()) === 1, 'scoped snapshot shows the role totals');
    check((await page.locator('section[aria-labelledby="dashboard-attention-heading"]').count()) === 0, 'workspace-wide queue is hidden while scoped');
    await page.getByRole('button', { name: /show all roles/i }).click();
    await page.waitForURL((url) => !url.search.includes('jobId'), { timeout: 15000 });
    check(true, 'Show all roles clears the scope');
    await openDashboard('/');
  }

  /* ------------------------------------------------------- responsive --- */
  for (const theme of ['light', 'dark']) {
    section(`Responsive — ${theme} theme`);
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, theme]);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await openDashboard('/');
      check(await page.evaluate((t) => document.documentElement.classList.contains('dark') === (t === 'dark'), theme), `${width}px — ${theme} theme applied`);
      const layout = await page.evaluate((mobile) => {
        const main = document.querySelector('main');
        const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        const outside = Array.from(main.querySelectorAll('*')).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > document.documentElement.clientWidth + 1;
        }).length;
        const kpiLinks = Array.from(document.querySelectorAll('section[aria-labelledby="dashboard-snapshot-heading"] a'));
        const columns = new Set(kpiLinks.map((el) => Math.round(el.getBoundingClientRect().left))).size;
        const smallTargets = Array.from(main.querySelectorAll('.dashboard a, .dashboard button, .dashboard select'))
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.height < 44 || (mobile && r.width < 44))
          .map(({ el, r }) => `${(el.getAttribute('aria-label') || el.innerText || el.id).trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        const visibleRows = (id) => Array.from(document.querySelectorAll(`section[aria-labelledby="${id}"] li`)).filter((li) => li.offsetParent !== null).length;
        const collisions = Array.from(main.querySelectorAll('.dashboard li, .dashboard header, .dashboard-stat')).filter((row) => {
          const kids = Array.from(row.children).map((c) => c.getBoundingClientRect()).filter((r) => r.width && r.height);
          return kids.some((a, i) => kids.slice(i + 1).some((b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
        }).length;
        // WCAG contrast of muted copy against its panel, in whichever theme is active.
        const lum = (rgb) => {
          const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const muted = document.querySelector('.dashboard-panel .text-slate-600');
        const panel = document.querySelector('.dashboard-panel');
        const [l1, l2] = [lum(getComputedStyle(muted).color), lum(getComputedStyle(panel).backgroundColor)].sort((a, b) => b - a);
        return {
          overflow, outside, columns, smallTargets, collisions,
          recentVisible: visibleRows('dashboard-recent-heading'),
          rolesVisible: visibleRows('dashboard-roles-heading'),
          contrast: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100,
          height: document.documentElement.scrollHeight
        };
      }, width < 768);
      check(!layout.overflow && layout.outside === 0, `${width}px — no horizontal overflow`, `${layout.outside} element(s) past the edge`);
      check(layout.collisions === 0, `${width}px — no overlapping text blocks`);
      check(layout.smallTargets.length === 0, `${width}px — dashboard targets meet 44px`, layout.smallTargets.slice(0, 5).join(', '));
      check(layout.columns === (width < 768 ? 2 : 4), `${width}px — KPI grid uses ${width < 768 ? 2 : 4} columns`, `${layout.columns}`);
      check(layout.recentVisible === Math.min(data.recentCandidates.length, width < 640 ? 3 : 5), `${width}px — recent candidate rows`, `${layout.recentVisible}`);
      check(layout.rolesVisible === Math.min(jobs.length, width < 640 ? 3 : 5), `${width}px — hiring role rows`, `${layout.rolesVisible}`);
      check(layout.contrast >= 4.5, `${width}px — muted text contrast ${layout.contrast}:1`);
      console.log(`  (info) ${theme} ${width}px page height ${layout.height}px`);
      if (process.env.E2E_SCREENSHOT_DIR) {
        await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/feature-dashboard-${theme}-${width}.png`, fullPage: true });
      }
    }
  }
  await page.evaluate((key) => localStorage.removeItem(key), THEME_KEY);
  await page.setViewportSize({ width: 1440, height: 900 });

  /* ------------------------------------------------------------ keyboard --- */
  section('Keyboard');
  await openDashboard('/');
  const firstCard = page.locator(`${SNAPSHOT} a`).nth(1);
  await firstCard.focus();
  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return style.boxShadow !== 'none' || style.outlineStyle !== 'none';
  });
  check(ring, 'focused KPI card shows a visible focus indicator');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/candidates**', { timeout: 15000 });
  check(true, 'Enter activates a KPI card');

  /* ------------------------------------------------------- empty / error --- */
  section('Empty and error states');
  await page.route('**/jobs/summary**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }));
  await openDashboard('/');
  const emptyText = await page.locator('main').innerText();
  check(/No hiring activity yet/.test(emptyText) && /Create your first role/.test(emptyText), 'no open roles shows the empty state');
  check((await page.locator(SNAPSHOT).count()) === 0, 'no zero KPI cards or empty panels');
  const create = page.locator('main a', { hasText: 'Create Job' });
  check((await create.count()) === 1 && await hrefOf(create) === '/jobs/new', 'empty state links to Create Job');
  await page.unroute('**/jobs/summary**');

  await page.route('**/dashboard/overview**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false}' }));
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('[role="alert"]').first().waitFor({ state: 'visible', timeout: 20000 });
  check(/Unable to load your dashboard/.test(await page.locator('main').innerText()), 'a failed load shows the error state with retry');
  await page.unroute('**/dashboard/overview**');

  /* ------------------------------------------------------- quality gates --- */
  section('Quality gates');
  const unexpected = consoleIssues.filter((m) => !/401|500|Failed to load resource/.test(m));
  check(pageErrors.length === 0, 'zero uncaught exceptions', pageErrors.join(' | '));
  check(unexpected.length === 0, 'zero unexpected console errors', unexpected.join(' | '));
} catch (error) {
  failed++;
  console.error(`\n  SUITE ERROR: ${error.message}`);
  if (process.env.E2E_DEBUG) console.error(error.stack);
} finally {
  console.log('\n---------------------------------------------');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}
