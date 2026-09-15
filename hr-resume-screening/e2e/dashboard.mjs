/**
 * Dashboard suite: routes, section order, data fidelity, workflow links,
 * empty/error states, responsive layout, touch targets and theme readiness.
 *
 * Every number on screen is compared with the overview response the page
 * itself received, so the suite works against any dataset.
 *
 * Usage:
 *   node dashboard.mjs
 *
 * Environment: E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD, E2E_BROWSER, E2E_HEADED
 * (same as scenarios.mjs).
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CHANNEL = process.env.E2E_BROWSER || 'msedge';
const WIDTHS = [360, 390, 430, 768, 1024, 1440, 1920];
const SECTION_ORDER = ['Recruitment snapshot', 'Recommended next step', 'Needs attention', 'Hiring roles', 'Hiring pipeline', 'Match quality', 'Recent candidates'];

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
const SNAPSHOT = 'a[aria-label^="Candidates:"]';

/** Navigates and resolves with the overview payload the page rendered. */
const openDashboard = async (path = '/') => {
  const response = page.waitForResponse((r) => r.url().includes('/analytics/overview') && r.request().method() === 'GET');
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  const body = await (await response).json();
  await page.locator('#snapshot-title, [role="alert"], h3:has-text("No hiring activity yet")').first().waitFor({ state: 'visible', timeout: 20000 });
  return body.data;
};

const hrefOf = (locator) => locator.evaluate((el) => new URL(el.href).pathname + new URL(el.href).search);

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
  const data = await openDashboard('/');
  check(await page.locator(SNAPSHOT).isVisible(), '/ renders the dashboard');
  const rootHeadings = await page.locator('main h2').allInnerTexts();

  const aliasData = await openDashboard('/dashboard');
  check(page.url().endsWith('/dashboard'), '/dashboard stays on its own URL (no redirect loop)', page.url());
  check(await page.locator(SNAPSHOT).isVisible(), '/dashboard renders the same dashboard');
  check(JSON.stringify(await page.locator('main h2').allInnerTexts()) === JSON.stringify(rootHeadings), 'alias and root render identical sections');
  check(aliasData.metrics.totalJobs === data.metrics.totalJobs, 'alias uses the same overview endpoint');
  const activeNav = page.locator('nav[aria-label="Main navigation"] a[aria-current="page"]');
  check((await activeNav.count()) >= 1 && /dashboard/i.test(await activeNav.first().innerText()), 'Dashboard nav item is marked current on the alias');

  await openDashboard('/');

  /* ----------------------------------------------------------- structure --- */
  section('Structure');
  check((await page.locator('main h1').count()) === 1, 'exactly one h1');
  const headings = (await page.locator('main h2').allInnerTexts()).map((h) => h.trim());
  check(JSON.stringify(headings) === JSON.stringify(SECTION_ORDER), 'sections appear in the specified order', headings.join(' > '));
  const bodyText = await page.locator('main').innerText();
  check(!/\bNaN\b|\bundefined\b|\bnull\b/.test(bodyText), 'no NaN, undefined or null on screen');
  check(!/open jobs|closed jobs|active candidates|\bhires?\b/i.test(bodyText), 'no unsupported lifecycle copy');
  check((await page.locator('main table').count()) === 0, 'no tables on the dashboard');
  check(!/Create Job/.test(await page.locator('main header').innerText()), 'header does not repeat the sidebar Create Job CTA');
  const nested = await page.evaluate(() => document.querySelectorAll('main a a, main a button, main button a, main button button').length);
  check(nested === 0, 'no nested interactive elements');
  const unlabeled = await page.evaluate(() => Array.from(document.querySelectorAll('main a, main button'))
    .filter((el) => !(el.getAttribute('aria-label') || el.innerText).trim()).length);
  check(unlabeled === 0, 'every link and button has an accessible name');

  /* ------------------------------------------------------------- KPIs --- */
  section('Recruitment snapshot');
  const kpis = [
    ['Jobs', data.metrics.totalJobs, '/jobs'],
    ['Candidates', data.metrics.totalCandidates, '/candidates'],
    ['Awaiting review', data.metrics.pendingReview, '/candidates?hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc'],
    ['Shortlisted', data.metrics.shortlisted, '/candidates?hrStatus=SHORTLISTED&sort=score_desc']
  ];
  const kpiCards = page.locator('section[aria-labelledby="snapshot-title"] a');
  check((await kpiCards.count()) === 4, 'exactly four KPI cards');
  for (const [label, value, href] of kpis) {
    const card = page.locator(`a[aria-label="${label}: ${value}"]`);
    check((await card.count()) === 1, `${label} shows ${value}`);
    if (await card.count()) check(decodeURIComponent(await hrefOf(card)) === href, `${label} links to ${href}`);
  }
  const metricSize = await page.locator('section[aria-labelledby="snapshot-title"] .text-metric').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  check(metricSize >= 24 && metricSize <= 30, `KPI metric size is 24–30px (${metricSize}px)`);

  /* --------------------------------------------------- recommended action --- */
  section('Recommended action');
  const recommendedSection = page.locator('section[aria-labelledby="recommended-title"]');
  const recommendedLinks = recommendedSection.locator('a');
  const rec = data.recommendedAction;
  check(Boolean(rec), 'overview returns a recommendation when jobs exist');
  check((await recommendedLinks.count()) === 1, 'one dominant CTA');
  if (rec) {
    check((await recommendedSection.innerText()).includes(rec.title), 'recommendation names the role');
    check((await recommendedSection.innerText()).includes(rec.nextAction.description), 'recommendation explains why');
    check(await hrefOf(recommendedLinks.first()) === rec.nextAction.destination, 'CTA uses the shared destination', rec.nextAction.destination);
    await recommendedLinks.first().click();
    await page.waitForURL((url) => url.pathname + url.search === rec.nextAction.destination, { timeout: 15000 });
    check(true, `CTA navigates to ${rec.nextAction.destination}`);
    await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 20000 });
    check(!/page not found/i.test(await page.locator('main').innerText()), 'CTA destination is a real page');
    await openDashboard('/');
  }

  /* ---------------------------------------------------------- attention --- */
  section('Needs attention');
  const attentionItems = page.locator('section[aria-labelledby="attention-title"] li');
  const attentionCount = await attentionItems.count();
  check(attentionCount <= 3 && attentionCount === Math.min(data.needsAttention.length, 3), `shows ${attentionCount} item(s), capped at 3`);
  for (let i = 0; i < attentionCount; i++) {
    const item = data.needsAttention[i];
    const link = attentionItems.nth(i).locator('a');
    check((await attentionItems.nth(i).innerText()).includes(item.title), `item ${i + 1} names ${item.title}`);
    check(await hrefOf(link) === item.nextAction.destination, `item ${i + 1} links to its next action`);
    check(item.id !== rec?.id, `item ${i + 1} does not repeat the recommendation`);
  }
  if (attentionCount) {
    const target = data.needsAttention[0].nextAction.destination;
    await attentionItems.first().locator('a').click();
    await page.waitForURL((url) => url.pathname + url.search === target, { timeout: 15000 });
    check(true, 'attention action navigates');
    await openDashboard('/');
  }

  /* ------------------------------------------------------- hiring roles --- */
  section('Hiring roles');
  const roleItems = page.locator('section[aria-labelledby="roles-title"] li');
  check((await roleItems.count()) === Math.min(data.hiringRoles.length, 5), `shows ${await roleItems.count()} role(s), at most 5`);
  for (let i = 0; i < (await roleItems.count()); i++) {
    const role = data.hiringRoles[i];
    const row = roleItems.nth(i);
    const rowText = await row.innerText();
    check(rowText.includes(role.title) && rowText.includes(`${role.candidatesCount} candidate`) && rowText.includes(`${role.pendingReview} awaiting review`), `row ${i + 1} summarises ${role.title}`);
    check(await hrefOf(row.locator(`a[aria-label="Open job: ${role.title}"]`)) === `/jobs/${role.id}`, `row ${i + 1} opens the job`);
    check(await hrefOf(row.locator('a').nth(1)) === role.nextAction.destination, `row ${i + 1} action matches the shared helper`);
  }
  const viewAll = page.locator('section[aria-labelledby="roles-title"] a:has-text("View all jobs")');
  check((await viewAll.count()) === 1 && await hrefOf(viewAll) === '/jobs', 'View all jobs links to /jobs');
  if ((await roleItems.count()) > 0) {
    await roleItems.first().locator('a').first().click();
    await page.waitForURL(`**/jobs/${data.hiringRoles[0].id}`, { timeout: 15000 });
    check(true, 'opening a role navigates to its job page');
    await openDashboard('/');
  }

  /* ----------------------------------------------- pipeline and quality --- */
  section('Pipeline and match quality');
  for (const stage of data.pipeline) {
    const link = page.locator(`section[aria-labelledby="pipeline-title"] a[aria-label="${stage.label}: ${stage.count} candidates"]`);
    check((await link.count()) === 1 && decodeURIComponent(await hrefOf(link)) === `/candidates?hrStatus=${stage.key}&sort=score_desc`, `${stage.label} (${stage.count}) links to its filter`);
  }
  const qualityText = await page.locator('section[aria-labelledby="quality-title"]').innerText();
  check(qualityText.includes(`${data.strongMatchThreshold}%`), `match quality states the shared ${data.strongMatchThreshold}% threshold`);
  check(!/average/i.test(await page.locator('main').innerText()), 'no duplicate average-score widget');

  if (data.metrics.totalJobs) {
    await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' });
    // Job cards load after the page title, so wait for the stats themselves.
    await page.getByText(/%\+ match|Strong matches/).first().waitFor({ state: 'visible', timeout: 20000 });
    const jobsText = await page.locator('main').innerText();
    check(!/90%\+ match/.test(jobsText), 'job cards no longer use a conflicting 90% threshold');
    check(jobsText.includes(`${data.strongMatchThreshold}%+ match`), 'job cards use the shared threshold');
  }
  await openDashboard('/');

  /* --------------------------------------------------- recent candidates --- */
  section('Recent candidates');
  const recentLinks = page.locator('section[aria-labelledby="recent-title"] li a');
  check((await recentLinks.count()) === Math.min(data.recentCandidates.length, 5), 'up to five recent candidates on desktop');
  if (data.recentCandidates.length) {
    check(await hrefOf(recentLinks.first()) === `/candidates/${data.recentCandidates[0]._id}`, 'rows link to the candidate profile');
  }

  /* ------------------------------------------------------- responsive --- */
  section('Responsive');
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await openDashboard('/');
    const layout = await page.evaluate((mobile) => {
      const main = document.querySelector('main');
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      const outside = Array.from(main.querySelectorAll('*')).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > document.documentElement.clientWidth + 1;
      }).length;
      const kpiLinks = Array.from(document.querySelectorAll('section[aria-labelledby="snapshot-title"] a'));
      const columns = new Set(kpiLinks.map((el) => Math.round(el.getBoundingClientRect().left))).size;
      const smallTargets = Array.from(main.querySelectorAll('a, button'))
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.height < 44 || (mobile && r.width < 44))
        .map(({ el, r }) => `${(el.getAttribute('aria-label') || el.innerText).trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      const visibleRows = (id) => Array.from(document.querySelectorAll(`section[aria-labelledby="${id}"] li`)).filter((li) => li.offsetParent !== null).length;
      const recentVisible = visibleRows('recent-title');
      const rolesVisible = visibleRows('roles-title');
      // Text collision: sibling text blocks within a row must not overlap.
      const collisions = Array.from(main.querySelectorAll('li, header, .dashboard-stat')).filter((row) => {
        const kids = Array.from(row.children).map((c) => c.getBoundingClientRect()).filter((r) => r.width && r.height);
        return kids.some((a, i) => kids.slice(i + 1).some((b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
      }).length;
      return { overflow, outside, columns, smallTargets, recentVisible, rolesVisible, collisions, height: document.documentElement.scrollHeight };
    }, width < 768);
    check(!layout.overflow && layout.outside === 0, `${width}px — no horizontal overflow`, `${layout.outside} element(s) past the edge`);
    check(layout.collisions === 0, `${width}px — no overlapping text blocks`);
    check(layout.smallTargets.length === 0, `${width}px — interactive targets meet 44px`, layout.smallTargets.slice(0, 5).join(', '));
    const expectedColumns = width < 768 ? 2 : 4;
    check(layout.columns === expectedColumns, `${width}px — KPI grid uses ${expectedColumns} columns`, `${layout.columns}`);
    const expectedRecent = Math.min(data.recentCandidates.length, width < 640 ? 3 : 5);
    check(layout.recentVisible === expectedRecent, `${width}px — ${expectedRecent} recent candidate row(s)`, `${layout.recentVisible}`);
    const expectedRoles = Math.min(data.hiringRoles.length, width < 640 ? 3 : 5);
    check(layout.rolesVisible === expectedRoles, `${width}px — ${expectedRoles} hiring role row(s)`, `${layout.rolesVisible}`);
    console.log(`  (info) ${width}px page height ${layout.height}px`);
    if (process.env.E2E_SCREENSHOT_DIR) {
      await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/dashboard-${width}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  /* ------------------------------------------------------------ keyboard --- */
  section('Keyboard');
  await openDashboard('/');
  await page.locator(SNAPSHOT).focus();
  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return style.boxShadow !== 'none' || style.outlineStyle !== 'none';
  });
  check(ring, 'focused KPI card shows a visible focus indicator');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/candidates', { timeout: 15000 });
  check(true, 'Enter activates a KPI card');

  /* --------------------------------------------------------------- theme --- */
  section('Theme readiness');
  await openDashboard('/');
  const themed = await page.evaluate(() => {
    const panel = document.querySelector('.dashboard-panel');
    const stat = document.querySelector('.dashboard-stat');
    const heading = document.querySelector('.dashboard h2');
    document.documentElement.style.setProperty('--surface', '15 23 42');
    document.documentElement.style.setProperty('--text-primary', '241 245 249');
    const result = {
      panel: getComputedStyle(panel).backgroundColor,
      stat: getComputedStyle(stat).backgroundColor,
      heading: getComputedStyle(heading).color
    };
    document.documentElement.style.removeProperty('--surface');
    document.documentElement.style.removeProperty('--text-primary');
    return result;
  });
  check(themed.panel === 'rgb(15, 23, 42)' && themed.stat === 'rgb(15, 23, 42)', 'panels and KPI cards follow the --surface token');
  check(themed.heading === 'rgb(241, 245, 249)', 'headings follow the --text-primary token');

  await page.emulateMedia({ colorScheme: 'dark' });
  await openDashboard('/');
  check(await page.locator(SNAPSHOT).isVisible(), 'prefers-color-scheme: dark renders without breaking (app has no dark theme)');
  await page.emulateMedia({ colorScheme: 'light' });

  /* ------------------------------------------------------- empty / error --- */
  section('Empty and error states');
  await page.route('**/analytics/overview', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: {
      metrics: { totalCandidates: 0, totalJobs: 0, shortlisted: 0, pendingReview: 0 },
      pipeline: [], scoreBands: [], strongMatchThreshold: 80, recommendedAction: null,
      needsAttention: [], hiringRoles: [], recentCandidates: [], generatedAt: new Date().toISOString()
    } })
  }));
  await openDashboard('/');
  const emptyText = await page.locator('main').innerText();
  check(/No hiring activity yet/.test(emptyText) && /Create your first role/.test(emptyText), 'no jobs shows the empty state');
  check((await page.locator('main h2').count()) === 0 && !/Recruitment snapshot/i.test(emptyText), 'no zero KPI cards or empty panels');
  const create = page.locator('main a:has-text("Create Job")');
  check((await create.count()) === 1 && await hrefOf(create) === '/jobs/new', 'empty state links to Create Job');
  check(!/across 0 hiring roles/.test(emptyText), 'header does not print a zero summary');
  await page.unroute('**/analytics/overview');

  await page.route('**/analytics/overview', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false}' }));
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('[role="alert"]').waitFor({ state: 'visible', timeout: 20000 });
  check(/Unable to load your dashboard/.test(await page.locator('main').innerText()), 'a failed load shows the error state with retry');
  await page.unroute('**/analytics/overview');

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
