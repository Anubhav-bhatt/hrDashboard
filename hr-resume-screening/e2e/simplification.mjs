/**
 * UX simplification — browser suite.
 *
 * Verifies that reducing what is visible did not remove what is available:
 * primary navigation is four destinations, the job page is three tabs, candidate
 * import is one flow, the candidate list opens with minimal controls, and every
 * advanced capability is still reachable one click deeper. Also checks the
 * preserved deep links, both themes and the responsive widths.
 *
 * Usage:
 *   node simplification.mjs
 *
 * Environment: same as scenarios.mjs (E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD…)
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API = process.env.E2E_API_URL || 'http://localhost:5000';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CHANNEL = process.env.E2E_BROWSER || 'msedge';

if (!EMAIL || !PASSWORD) {
  console.error('E2E_EMAIL and E2E_PASSWORD must be set to a recruiter account.');
  process.exit(1);
}

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

/* Pick a real job with candidates, so the tabs have something to show. */
let cookie = '';
const api = async (path) => {
  const res = await fetch(`${API}/api${path}`, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const login = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD })
});
cookie = login.headers.get('set-cookie').split(';')[0];

const jobsRes = await api('/jobs?status=OPEN&sort=candidates&limit=5');
const busiest = (jobsRes.body?.data || []).find((j) => j.candidateCount > 0) || jobsRes.body?.data?.[0];
if (!busiest) {
  console.error('No jobs available to exercise the job page.');
  process.exit(1);
}

const browser = await chromium.launch({
  ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }),
  headless: process.env.E2E_HEADED !== '1'
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const pageErrors = [];
const consoleIssues = [];
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') consoleIssues.push(m.text().slice(0, 200));
});

const text = () => page.locator('body').innerText();

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

  /* --------------------------------------------------- Test 60: navigation */
  section('Test 60 — primary navigation');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('nav[aria-label="Main navigation"]').first().waitFor({ state: 'visible', timeout: 20000 });

  const navLinks = page.locator('nav[aria-label="Main navigation"] a');
  check((await navLinks.count()) === 4, 'the sidebar has exactly four destinations', `got ${await navLinks.count()}`);
  const labels = (await navLinks.allInnerTexts()).map((t) => t.trim().toLowerCase());
  check(
    JSON.stringify(labels) === JSON.stringify(['dashboard', 'jobs', 'candidates', 'settings']),
    'they are Dashboard, Jobs, Candidates, Settings',
    labels.join(', ')
  );
  for (const gone of ['/jobs/new', '/jobs/closed']) {
    check(
      (await page.locator(`nav[aria-label="Main navigation"] a[href="${gone}"]`).count()) === 0,
      `${gone} is not a permanent sidebar destination`
    );
  }

  /* ----------------------------------------------- Test 11: dashboard focus */
  section('Tests 11-15 — dashboard focus');
  const dash = await text();
  check(/needs your attention/i.test(dash), 'Needs your attention is present');
  check(/recent hires/i.test(dash), 'Recent hires is present');
  check(/analytics/i.test(dash), 'Analytics is offered as a disclosure');

  const analyticsPanel = page.locator('#dashboard-analytics');
  check(await analyticsPanel.isHidden(), 'analytics is collapsed by default');
  const toggle = page.locator('button[aria-controls="dashboard-analytics"]');
  check((await toggle.getAttribute('aria-expanded')) === 'false', 'the disclosure reports its collapsed state');
  await toggle.click();
  await page.waitForTimeout(600);
  check(await analyticsPanel.isVisible(), 'expanding Analytics reveals it');
  check((await toggle.getAttribute('aria-expanded')) === 'true', 'and updates aria-expanded');
  const analyticsText = await text();
  check(/hiring pipeline/i.test(analyticsText), 'the pipeline is preserved inside Analytics');
  check(/score distribution|match score/i.test(analyticsText), 'score distribution is preserved');
  check(/top candidates/i.test(analyticsText), 'top candidates is preserved');

  // The attention cards must be built from real job state, not invented.
  const attentionActions = page.locator('a', { hasText: /review shortlist|review candidates|add candidates|score candidates/i });
  check((await attentionActions.count()) > 0, 'attention cards offer a concrete next action');

  /* ------------------------------------------- Tests 61: jobs experience */
  section('Test 61 — Jobs holds Active, Closed, Create and Search');
  await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' });
  await page.locator('#job-search').waitFor({ state: 'visible', timeout: 20000 });
  check((await page.locator('#job-search').count()) === 1, 'the jobs page has one search field');
  check((await page.locator('[aria-label="Filter jobs by status"] button').count()) === 2, 'Active and Closed tabs exist');
  check((await page.locator('a[href="/jobs/new"]').count()) >= 1, 'Create job is available from the page header');
  check((await page.locator('select[aria-label="Sort jobs"]').count()) === 1, 'sorting is available');

  /* --------------------------------- Tests 16-22, 62: job details tabs */
  section('Tests 16-22 & 62 — job details is three tabs');
  await page.goto(`${BASE}/jobs/${busiest.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[role=tablist]').first().waitFor({ state: 'visible', timeout: 20000 });

  const jobTabs = page.locator('[role=tablist]').first().locator('[role=tab]');
  check((await jobTabs.count()) === 3, 'exactly three tabs', `got ${await jobTabs.count()}`);
  const tabLabels = (await jobTabs.allInnerTexts()).map((t) => t.trim().toLowerCase());
  check(
    tabLabels.join('|') === 'overview|candidates|job criteria',
    'they are Overview, Candidates, Job criteria',
    tabLabels.join(', ')
  );

  // The JD is not dumped onto the page; it opens on request.
  const jobBody = await text();
  check(/job description/i.test(jobBody), 'the job description is referenced');
  const jdToggle = page.locator('button', { hasText: /^view jd$/i });
  if ((await jdToggle.count()) > 0) {
    check(true, 'the JD is behind a View JD action');
    await jdToggle.first().click();
    await page.waitForTimeout(500);
    check(/hide jd/i.test(await text()), 'opening the JD reveals it and offers to hide it again');
    await page.locator('button', { hasText: /^hide jd$/i }).first().click();
    await page.waitForTimeout(300);
  } else {
    check(false, 'the JD is behind a View JD action', 'no View JD control found');
  }

  // Candidates tab embeds the same browser used by the dedicated route.
  await jobTabs.nth(1).click();
  await page.waitForTimeout(2000);
  check(page.url().includes('tab=candidates'), 'the active tab is reflected in the URL', page.url());
  check((await page.locator('#candidate-search, input[type=search]').count()) > 0, 'the Candidates tab lists candidates');

  // Job criteria: summary first, full editing behind Edit.
  await jobTabs.nth(2).click();
  await page.waitForTimeout(1200);
  check(page.url().includes('tab=criteria'), 'the criteria tab is reflected in the URL');
  const criteriaBody = await text();
  check(/screening criteria/i.test(criteriaBody), 'the criteria summary renders');
  const editCriteria = page.locator('button', { hasText: /edit criteria|^edit$/i }).first();
  check((await editCriteria.count()) > 0, 'an Edit action is offered');
  await editCriteria.click();
  await page.waitForTimeout(900);
  const editing = await text();
  check(/required skills/i.test(editing), 'edit mode exposes required skills');
  check(/preferred skills/i.test(editing), 'and preferred skills');
  check(/salary/i.test(editing), 'and salary criteria — nothing was removed');
  check(/experience/i.test(editing), 'and experience criteria');

  /* -------------------------------- Tests 63-66: unified Add candidates */
  section('Tests 63-66 — one Add candidates flow');
  await page.goto(`${BASE}/jobs/${busiest.id}/import`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const importBody = await text();
  check(/add candidates/i.test(importBody), 'the screen is titled Add candidates');
  check(/upload resumes/i.test(importBody), 'Upload resumes is one choice');
  check(/outlook/i.test(importBody), 'Import from Outlook is the other choice');
  check(/drag resumes here/i.test(importBody), 'a single drop zone is offered');
  check((await page.locator('button', { hasText: /choose files/i }).count()) === 1, 'one Choose files control');
  check((await page.locator('button', { hasText: /select folder/i }).count()) === 1, 'one Select folder control');
  check(!/single candidate upload/i.test(importBody), 'the separate single-upload card is gone');
  check(!/bulk.*folder candidate import/i.test(importBody), 'the separate bulk card is gone');

  // The file inputs behind the zone still accept one file, many files and a folder.
  check((await page.locator('#resume-files-input').getAttribute('multiple')) !== null, 'the file input accepts multiple files');
  check(
    (await page.locator('#resume-folder-input').getAttribute('webkitdirectory')) !== null,
    'the folder input still selects a directory'
  );

  // Outlook import remains reachable from the same screen.
  await page.locator('button', { hasText: /outlook mailbox/i }).first().click();
  await page.waitForTimeout(1200);
  check(/outlook/i.test(await text()), 'the Outlook import flow is still available');

  /* ---------------------------- Tests 67-68: candidate list simplification */
  section('Tests 67-70 — candidate list and profile');
  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' });
  await page.locator('a[aria-label^="Open profile for"]').first().waitFor({ state: 'visible', timeout: 25000 });

  // Toolbar holds search, sort and a Filters button — not every filter.
  for (const gone of ['#filter-score', '#filter-experience', '#filter-location', '#filter-skill']) {
    check((await page.locator(gone).count()) === 0, `${gone} is no longer inline in the toolbar`);
  }
  check((await page.locator('select[aria-label="Sort candidates"]').count()) === 1, 'sort stays in the toolbar');

  const presets = page.locator('[aria-label="Filter candidates"] button');
  const presetLabels = (await presets.allInnerTexts()).map((t) => t.trim().toLowerCase());
  for (const expected of ['all', 'best matches', 'shortlisted', 'needs review', 'selected']) {
    check(
      presetLabels.some((label) => label.startsWith(expected)),
      `the ${expected} preset is offered`,
      presetLabels.join(' | ')
    );
  }

  // Best matches must reuse the shared threshold rather than invent one.
  const summary = await api('/candidates?limit=1');
  const threshold = summary.body?.facets?.strongMatchThreshold;
  check(threshold === 80, 'the API reports the shared strong-match threshold', String(threshold));
  await presets.nth(1).click();
  await page.waitForTimeout(1600);
  check(page.url().includes(`minScore=${threshold}`), 'Best matches applies the shared threshold', page.url());

  // Advanced filters are preserved behind the drawer.
  await page.locator('button[aria-controls="candidate-filters"]').click();
  await page.locator('#candidate-filters').waitFor({ state: 'visible', timeout: 15000 });
  // Field labels are rendered uppercase by CSS, so compare case-insensitively.
  const drawer = (await page.locator('#candidate-filters').innerText()).toLowerCase();
  for (const label of ['match score', 'experience', 'location', 'skill', 'qualification']) {
    check(drawer.includes(label), `the ${label} filter is preserved in the drawer`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  /* ------------------------------------- Test 70: score breakdown hidden */
  section('Test 70 — score breakdown is hidden but reachable');
  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' });
  await page.locator('a[aria-label^="Open profile for"]').first().waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('a[aria-label^="Open profile for"]').first().click();
  await page.waitForURL('**/candidates/**', { timeout: 20000 });
  await page.waitForTimeout(2500);

  const profile = await text();
  check(!/required skills\s*\d+\s*\/\s*40/i.test(profile), 'the weighted maths is not shown by default');
  const whyButton = page.locator('button[aria-controls="score-breakdown"]');
  if ((await whyButton.count()) > 0) {
    check(true, 'a "Why this score?" disclosure is offered');
    check((await whyButton.getAttribute('aria-expanded')) === 'false', 'it starts collapsed');
    await whyButton.click();
    await page.waitForTimeout(600);
    const opened = await text();
    check(/required skills/i.test(opened) && /\/\s*40/.test(opened), 'expanding reveals the component scores');
  } else {
    // A candidate with no score has no breakdown to show; that is correct.
    check(/not scored|no analysis/i.test(profile), 'an unscored candidate shows no breakdown', profile.slice(0, 120));
  }

  // Every profile tab is still present.
  const profileTabs = page.locator('[role=tablist]').first().locator('[role=tab]');
  const profileTabLabels = (await profileTabs.allInnerTexts()).map((t) => t.trim().toLowerCase());
  for (const expected of ['overview', 'experience', 'skills', 'resume', 'activity']) {
    check(profileTabLabels.some((l) => l.includes(expected)), `the ${expected} tab is preserved`, profileTabLabels.join(', '));
  }

  /* ----------------------------------------------------- Test 73: settings */
  section('Test 73 — Settings holds Account, Appearance and Outlook');
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const settings = await text();
  check(/account/i.test(settings), 'Account is present');
  check(/appearance/i.test(settings), 'Appearance is present');
  check(/integrations/i.test(settings), 'Integrations is present');
  check(/microsoft outlook/i.test(settings), 'the Outlook connection lives here');
  check(settings.includes(EMAIL), 'the signed-in account is shown');
  check((await page.getByRole('radiogroup', { name: /colour theme/i }).count()) === 1, 'the theme control is here');
  check((await page.locator('button', { hasText: /sign out/i }).count()) >= 1, 'Sign out is available');

  /* ------------------------------------------------- Test 56: deep links */
  section('Test 56 — preserved deep links');
  const deepLinks = [
    ['/dashboard', /needs your attention|recruitment dashboard/i],
    ['/jobs', /jobs/i],
    ['/jobs/new', /create|job title|job description/i],
    ['/jobs/closed', /closed/i],
    [`/jobs/${busiest.id}`, /overview/i],
    [`/jobs/${busiest.id}/candidates`, /candidates/i],
    [`/jobs/${busiest.id}/import`, /add candidates/i],
    ['/candidates', /candidates/i],
    ['/settings', /settings/i]
  ];
  for (const [path, expected] of deepLinks) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const ok = expected.test(await text()) && !/page not found/i.test(await text());
    check(ok, `${path} still resolves`);
  }

  /* --------------------------------------------------- Test 74: dark mode */
  section('Test 74 — dark mode across the simplified screens');
  await page.evaluate(() => {
    window.localStorage.setItem('hr-dashboard-theme', 'dark');
    document.documentElement.classList.add('dark');
  });
  for (const path of ['/', '/jobs', `/jobs/${busiest.id}`, '/candidates', '/settings']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1300);
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const rgb = bg.match(/\d+/g).map(Number);
    check(isDark && rgb[0] < 60 && rgb[1] < 60 && rgb[2] < 70, `${path} renders dark`, bg);
  }
  await page.evaluate(() => {
    window.localStorage.setItem('hr-dashboard-theme', 'light');
    document.documentElement.classList.remove('dark');
  });

  /* -------------------------------------------------- Test 75: responsive */
  section('Test 75 — responsive widths');
  for (const width of [1440, 1280, 1024, 768, 430, 390, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/jobs', `/jobs/${busiest.id}`, '/candidates', '/settings']) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      check(overflow <= 1, `no horizontal overflow at ${width}px on ${path}`, `overflow ${overflow}px`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  /* ----------------------------------------------------- Test 76: console */
  section('Test 76 — runtime health');
  const unexpected = consoleIssues.filter((e) => !e.includes('Failed to load resource'));
  check(pageErrors.length === 0, 'zero uncaught exceptions', pageErrors.slice(0, 3).join(' | '));
  check(unexpected.length === 0, 'zero console errors', unexpected.slice(0, 3).join(' | '));
} catch (error) {
  failed++;
  console.log(`\n  SUITE ERROR: ${error.message}`);
  console.log(error.stack);
} finally {
  await browser.close();
  console.log('\n----------------------------------------------------------------');
  console.log(`  UX simplification E2E: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------------------\n');
  process.exit(failed > 0 ? 1 : 0);
}
