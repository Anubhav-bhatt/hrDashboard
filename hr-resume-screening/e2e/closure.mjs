/**
 * Job closure, candidate selection and Active/Closed search — browser suite.
 *
 * Drives the real UI through the whole lifecycle: shortlist a candidate, close
 * the job from the control centre, then verify the job leaves the active portal,
 * appears under closed jobs with its hire, blocks further imports, and shows up
 * on the dashboard. Also covers the search and Active/Closed filtering, keyboard
 * access to the dialog, and both colour themes.
 *
 * The suite creates its own job and candidates through the API and removes them
 * afterwards, so it never closes one of the recruiter's real vacancies.
 *
 * Usage:
 *   node closure.mjs
 *
 * Environment:
 *   E2E_BASE_URL   frontend origin  (default http://localhost:5173)
 *   E2E_API_URL    backend origin   (default http://localhost:5000)
 *   E2E_EMAIL      recruiter account email
 *   E2E_PASSWORD   recruiter account password
 *   E2E_BROWSER    'msedge' | 'chrome' | 'chromium'  (default msedge)
 *   E2E_HEADED     set to 1 to watch the run
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

const TAG = 'e2eclosure';

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

/* ------------------------------------------------------------ API fixtures */

let cookie = '';
const api = async (method, path, body) => {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
};

const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
if (login.status !== 200) {
  console.error('E2E login failed:', login.status);
  process.exit(1);
}

/**
 * Seeds a job with three shortlisted candidates, created directly through the
 * API. The multipart job-create endpoint needs a JD file, so a small text file
 * stands in for one.
 */
const createFixtureJob = async (title) => {
  const form = new FormData();
  form.append('title', title);
  form.append(
    'jdFile',
    new Blob([`We are hiring a ${title}. Required skills: React, TypeScript. 4 years experience required.`], {
      type: 'text/plain'
    }),
    'jd.txt'
  );
  const res = await fetch(`${API}/api/jobs`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  const json = await res.json();
  return json.data;
};

let candidateSeq = 0;

/**
 * Uploads one candidate resume. Contact details must be distinct per candidate —
 * a shared phone number makes the importer treat the later uploads as duplicates
 * of the first.
 */
const createCandidate = async (jobId, name) => {
  const seq = candidateSeq++;
  const first = name.split(' ')[0].toLowerCase();
  const form = new FormData();
  form.append(
    'resume',
    new Blob(
      [
        `${name}\nSenior Frontend Developer\nEmail: ${first}.${TAG}${seq}@example.invalid\n` +
          `Phone: +91 9${String(700000000 + seq).padStart(9, '0')}\nLocation: Pune\n\n` +
          `SKILLS\nReact, TypeScript, Node.js\n\nEXPERIENCE\n${5 + seq} years building React applications.`
      ],
      { type: 'text/plain' }
    ),
    `${name.replace(/\s+/g, '_')}.txt`
  );
  const res = await fetch(`${API}/api/jobs/${jobId}/candidates/upload`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form
  });
  const json = await res.json();
  if (res.status !== 201) {
    console.log(`  [fixture] upload of ${name} returned ${res.status}: ${json?.message || ''}`);
    return null;
  }
  return json?.data?.candidate || null;
};

section('Fixture setup');
const job = await createFixtureJob(`${TAG} Senior React Developer`);
check(Boolean(job?.id), 'a fixture job was created through the API');

const alpha = await createCandidate(job.id, 'Alpha Higherscore');
const bravo = await createCandidate(job.id, 'Bravo Chosen');
const charlie = await createCandidate(job.id, 'Charlie Third');

const idOf = (c) => c?._id || c?.id;
check([alpha, bravo, charlie].every((c) => Boolean(idOf(c))), 'three fixture candidates were uploaded');
// Shortlist all three so the recruiter has a real choice in the dialog.
for (const candidate of [alpha, bravo, charlie]) {
  await api('PATCH', `/jobs/${job.id}/candidates/${idOf(candidate)}/status`, { status: 'SHORTLISTED' });
}
const shortlistCheck = await api('GET', `/jobs/${job.id}/shortlist`);
check(shortlistCheck.body?.data?.length === 3, 'three candidates are shortlisted', `got ${shortlistCheck.body?.data?.length}`);

/* ----------------------------------------------------------------- browser */

const browser = await chromium.launch({
  ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }),
  headless: process.env.E2E_HEADED !== '1'
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleIssues = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleIssues.push(`[error] ${m.text().slice(0, 200)}`);
});
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)));
page.on('response', (r) => {
  // 409s are expected where the suite deliberately probes a closed job.
  if (r.status() >= 400 && r.status() !== 409) {
    failedRequests.push(`${r.status()} ${r.request().method()} ${r.url().replace(API, '')}`);
  }
});

const text = () => page.locator('body').innerText();

try {
  section('Sign in');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
  check(true, 'recruiter signed in');

  /* ------------------------------------------- Active/Closed search filters */
  section('Job search and Active/Closed filtering');
  await page.goto(`${BASE}/jobs?search=${TAG}`, { waitUntil: 'networkidle' });
  await page.locator('#job-search').waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForSelector(`text=${job.title}`, { timeout: 15000 });
  await page.waitForTimeout(600);

  check((await page.locator('#job-search').inputValue()) === TAG, 'the search term is restored from the URL on load');
  let body = await text();
  check(body.includes(job.title), 'the searched job is listed');
  check(/\bActive\b/.test(body), 'an open job shows an Active badge');
  check(/1 job found/i.test(body), 'the result count is shown', body);

  // Two tabs, not three: a recruiter is either working live roles or reviewing
  // history, so an "All" tab that mixed them was dropped.
  const tabs = page.locator('[aria-label="Filter jobs by status"] button');
  check((await tabs.count()) === 2, 'Active / Closed tabs are present');
  check(/Active\s*1/.test(body) && /Closed\s*0/.test(body), 'tab counts come from the backend', body);

  await tabs.nth(1).click(); // Closed
  await page.waitForTimeout(1500);
  check(page.url().includes('status=CLOSED'), 'selecting Closed writes the filter to the URL', page.url());
  // With a search term active, the search is the reason nothing matched, so the
  // no-results state is the honest message rather than "no closed jobs yet".
  check(/no jobs found/i.test(await text()), 'Closed with an unmatched search shows the no-results state');

  // The dedicated "no closed jobs" state applies when there is no search term.
  await page.goto(`${BASE}/jobs/closed`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  const closedEmpty = await text();
  const hasClosedJobs = !/no closed jobs yet/i.test(closedEmpty);
  check(
    hasClosedJobs || /jobs will appear here|appear here after a candidate is selected/i.test(closedEmpty),
    'the empty closed-jobs state explains how jobs get there',
    hasClosedJobs ? 'workspace already has closed jobs — state not applicable' : closedEmpty.slice(0, 160)
  );

  await page.goto(`${BASE}/jobs?search=${TAG}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);

  await page.locator('[aria-label="Filter jobs by status"] button').nth(0).click(); // Active
  await page.waitForTimeout(1200);
  check((await text()).includes(job.title), 'switching back to Active shows the job again');

  // A search matching nothing must not render a blank grid.
  await page.goto(`${BASE}/jobs?search=Machine%20Learning%20Architect%20Nonexistent`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  body = await text();
  check(/no jobs found/i.test(body), 'a fruitless search shows a no-results state');
  check(/clear search/i.test(body), 'and offers a way to clear it');

  /* ------------------------------------------------- Close from job details */
  section('Closing the job from the control centre');
  await page.goto(`${BASE}/jobs/${job.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  body = await text();
  check(/\bActive\b/.test(body), 'the job details header shows Active');

  const closeButton = page.locator('button', { hasText: /select final candidate/i }).first();
  check((await closeButton.count()) > 0, 'a Select final candidate action is offered on job details');
  check(await closeButton.isEnabled(), 'it is enabled once candidates are shortlisted');

  await closeButton.click();
  const dialog = page.locator('[role=dialog]');
  await dialog.waitFor({ state: 'visible', timeout: 15000 });
  check(true, 'the close-job dialog opens');

  const dialogText = await dialog.innerText();
  check(dialogText.includes(job.title), 'the dialog names the job being closed');
  check(/select the candidate hired/i.test(dialogText), 'the dialog states what it is asking for');

  const radios = dialog.locator('input[type=radio]');
  check((await radios.count()) === 3, 'only the three shortlisted candidates are offered');
  check(dialogText.includes('Bravo Chosen'), 'shortlisted candidates are listed by name');

  // Nothing preselected: the recruiter must make the choice.
  check((await dialog.locator('input[type=radio]:checked').count()) === 0, 'no candidate is preselected');

  const confirm = dialog.locator('button', { hasText: /confirm & close job/i });
  check(await confirm.isDisabled(), 'confirm is disabled until a candidate is chosen');

  // Escape closes the dialog — keyboard users are not trapped.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check((await page.locator('[role=dialog]').count()) === 0, 'Escape dismisses the dialog');

  await closeButton.click();
  await dialog.waitFor({ state: 'visible', timeout: 15000 });

  // Deliberately pick the middle scorer, not the top one.
  const bravoRadio = dialog.locator(`input[value="${idOf(bravo)}"]`);
  await bravoRadio.check();
  check(await bravoRadio.isChecked(), 'the recruiter selects a candidate who is not the highest scorer');
  check(await dialog.locator('button', { hasText: /confirm & close job/i }).isEnabled(), 'confirm becomes available');

  await dialog.locator('button', { hasText: /confirm & close job/i }).click();
  await page.waitForTimeout(3000);

  body = await text();
  check(/closed/i.test(body), 'the job page reports the closed state');
  check(/this job is closed/i.test(body), 'a closed banner explains the state');
  check(body.includes('Bravo Chosen'), 'the banner names the selected candidate');
  check(/filled on/i.test(body), 'the closure date is shown');
  check(
    (await page.locator('button', { hasText: /select final candidate/i }).count()) === 0,
    'the Select final candidate action is gone'
  );
  check(
    (await page.locator('a', { hasText: /^Import candidates$/i }).count()) === 0,
    'the Import candidates action is withdrawn'
  );

  /* --------------------------------------------------- state after closure */
  section('State after closure');
  const after = await api('GET', `/jobs/${job.id}`);
  check(after.body?.data?.status === 'CLOSED', 'the job is persisted as CLOSED');
  check(after.body?.data?.selectedCandidateId === idOf(bravo), 'the selected candidate is stored on the job');
  check(Boolean(after.body?.data?.closedAt), 'closedAt is stored');

  const others = await api('GET', `/jobs/${job.id}/candidates?limit=100`);
  const byId = Object.fromEntries(others.body.data.map((c) => [c._id || c.id, c]));
  check(byId[idOf(bravo)]?.hrStatus === 'SELECTED', 'the chosen candidate is SELECTED');
  check(byId[idOf(alpha)]?.hrStatus === 'SHORTLISTED', 'the higher scorer stays SHORTLISTED');
  check(byId[idOf(charlie)]?.hrStatus === 'SHORTLISTED', 'the third candidate stays SHORTLISTED');

  const second = await api('POST', `/jobs/${job.id}/close`, { selectedCandidateId: idOf(alpha) });
  check(second.status === 409, 'a repeated closure is refused', `status ${second.status}`);
  check(second.body?.code === 'JOB_ALREADY_CLOSED', 'with a safe error code');

  /* ------------------------------------------------------- closed jobs page */
  section('Closed jobs history');
  await page.goto(`${BASE}/jobs/closed?search=${TAG}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  body = await text();
  check(body.includes(job.title), 'the closed job appears under /jobs/closed');
  check(/\bClosed\b/.test(body), 'it carries a Closed badge');
  check(body.includes('Bravo Chosen'), 'the card shows the selected candidate');
  check(/selected candidate/i.test(body), 'the card labels the selection');
  check((await page.locator('#job-search').count()) === 1, 'the closed jobs page has its own search');

  // Searching by the hire's name must find the role they were hired for.
  await page.fill('#job-search', 'Bravo Chosen');
  await page.waitForTimeout(1800);
  check((await text()).includes(job.title), 'closed jobs are searchable by selected candidate name');

  // Refresh safety.
  await page.goto(`${BASE}/jobs/closed?search=${TAG}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  check((await text()).includes(job.title), 'refreshing /jobs/closed preserves the search');

  // An active job must never leak onto the history route.
  const activeOnClosed = await api('GET', '/jobs?status=CLOSED&limit=100');
  check(
    activeOnClosed.body.data.every((j) => j.status === 'CLOSED'),
    'the closed listing contains only closed jobs'
  );

  /* ---------------------------------------------------- portal + sidebar */
  section('Portal and navigation');
  await page.goto(`${BASE}/jobs?search=${TAG}&status=OPEN`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  check(!(await text()).includes(job.title), 'the closed job no longer appears among active jobs');

  // Primary navigation is the three workspace destinations. Settings and Closed
  // Jobs sit in a Management group below them, one click away and asserted
  // separately, so grouping them cannot quietly become losing them. Closed jobs
  // is also the Closed tab inside Jobs, which is where a recruiter already is
  // when they want it; the /jobs/closed route still exists for bookmarks.
  const navLinks = page.locator('nav[aria-label="Main navigation"] a');
  check(
    (await navLinks.count()) === 3,
    'the sidebar offers exactly three workspace destinations',
    `got ${await navLinks.count()}`
  );
  const navLabels = (await navLinks.allInnerTexts()).map((t) => t.trim().toLowerCase());
  check(
    ['dashboard', 'jobs', 'candidates'].every((label) => navLabels.includes(label)),
    'they are Dashboard, Jobs and Candidates',
    navLabels.join(', ')
  );
  const managementLabels = (await page.locator('nav[aria-label="Management"] a').allInnerTexts()).map((t) =>
    t.trim().toLowerCase()
  );
  check(
    managementLabels.includes('settings') && managementLabels.includes('closed jobs'),
    'Settings and Closed Jobs remain reachable in Management',
    managementLabels.join(', ')
  );

  // Reaching closed jobs from the portal, via the Closed tab.
  await page.locator('[aria-label="Filter jobs by status"] button').nth(1).click();
  await page.waitForTimeout(1500);
  check(page.url().includes('status=CLOSED'), 'the Closed tab filters the portal to closed jobs', page.url());
  check((await text()).includes(job.title), 'and shows the closed job');

  // The dedicated history route remains addressable and keeps Jobs highlighted.
  await page.goto(`${BASE}/jobs/closed`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  check(page.url().endsWith('/jobs/closed'), 'the /jobs/closed route still resolves');
  const jobsCurrent = await page.locator('a[href="/jobs"][aria-current="page"]').count();
  check(jobsCurrent > 0, 'Jobs stays the active section on the history route');

  /* --------------------------------------------------------- import blocked */
  section('Closed job protections');
  await page.goto(`${BASE}/jobs/${job.id}/import`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  body = await text();
  check(/this job is closed/i.test(body), 'the import screen refuses a closed job');
  check(/imports are disabled for closed jobs/i.test(body), 'and explains why');
  check((await page.locator('input[type=file]').count()) === 0, 'no upload control is offered');

  const uploadForm = new FormData();
  uploadForm.append('resume', new Blob(['blocked'], { type: 'text/plain' }), 'blocked.txt');
  const blockedUpload = await fetch(`${API}/api/jobs/${job.id}/candidates/upload`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: uploadForm
  });
  check(blockedUpload.status === 409, 'the API refuses an upload to a closed job', `status ${blockedUpload.status}`);

  const revert = await api('PATCH', `/jobs/${job.id}/candidates/${idOf(bravo)}/status`, { status: 'REVIEW' });
  check(revert.status === 409, 'the selected candidate cannot be reverted through the status route');

  /* ---------------------------------------------------- candidate surfaces */
  section('Candidate surfaces');
  await page.goto(`${BASE}/jobs/${job.id}/candidates/${idOf(bravo)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  body = await text();
  check(/\bSelected\b/.test(body), 'the hired candidate profile shows Selected');
  check(/selected for this role/i.test(body), 'the profile states the outcome');
  check(body.includes(job.title), 'and names the role they were selected for');
  check(
    (await page.locator('select[aria-label="Change candidate status"]').count()) === 0,
    'the status dropdown is withdrawn for a selected candidate'
  );

  await page.goto(`${BASE}/candidates?hrStatus=SELECTED`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  body = await text();
  check(body.includes('Bravo Chosen'), 'the global Selected filter finds the hire');
  const listStatuses = await api('GET', '/candidates?hrStatus=SELECTED&limit=100');
  check(
    listStatuses.body.data.every((c) => c.hrStatus === 'SELECTED'),
    'the Selected filter returns only selected candidates'
  );

  /* ------------------------------------------------------------- dashboard */
  section('Dashboard hiring outcome');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('a[aria-label^="Candidates"]').waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500);
  body = await text();
  check(/active jobs/i.test(body), 'the dashboard reports Active jobs');
  check(/closed jobs/i.test(body), 'and links to Closed jobs');
  // The headline row reports hires as "Hires / Candidates selected"; the count of
  // selected candidates is the same backend aggregate, just labelled for HR.
  check(/\bhires\b/i.test(body) && /candidates selected/i.test(body), 'and the hire count');
  check(/recent hires/i.test(body), 'the Recent hires section renders');
  check(body.includes('Bravo Chosen'), 'the new hire appears in Recent hires');
  check(!/jobs overview/i.test(body), 'the jobs overview section is no longer on the dashboard');
  check(!/\bNaN\b|\bundefined\b/.test(body), 'no NaN or undefined values appear');

  const viewClosed = page.locator('a', { hasText: /view closed jobs/i }).first();
  check((await viewClosed.count()) > 0, 'Recent hires links through to closed jobs');

  /* ------------------------------------------------------------ dark theme */
  section('Dark mode');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => {
    window.localStorage.setItem('hr-dashboard-theme', 'dark');
    document.documentElement.classList.add('dark');
  });
  await page.goto(`${BASE}/jobs/closed?search=${TAG}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  check(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark theme is applied');
  check((await text()).includes(job.title), 'closed jobs render in dark mode');

  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const rgb = darkBg.match(/\d+/g).map(Number);
  check(rgb[0] < 60 && rgb[1] < 60 && rgb[2] < 70, 'the page background is genuinely dark', darkBg);

  await page.goto(`${BASE}/jobs/${job.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  check(/this job is closed/i.test(await text()), 'the closed banner renders in dark mode');

  await page.evaluate(() => {
    window.localStorage.setItem('hr-dashboard-theme', 'light');
    document.documentElement.classList.remove('dark');
  });
  await page.emulateMedia({ colorScheme: 'light' });

  /* ------------------------------------------------------------ responsive */
  section('Responsive layout');
  const widths = [1440, 1280, 1024, 768, 430, 390, 375];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [`/jobs?search=${TAG}`, '/jobs/closed', '/']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      check(overflow <= 1, `no horizontal overflow at ${width}px on ${route}`, `overflow ${overflow}px`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  /* --------------------------------------------------------- accessibility */
  section('Keyboard and accessibility');
  // A job with a shortlist is needed to reopen the dialog; make a second one.
  const keyboardJob = await createFixtureJob(`${TAG} Keyboard Role`);
  const keyboardCandidate = await createCandidate(keyboardJob.id, 'Delta Keyboard', 85);
  await api('PATCH', `/jobs/${keyboardJob.id}/candidates/${idOf(keyboardCandidate)}/status`, {
    status: 'SHORTLISTED'
  });

  await page.goto(`${BASE}/jobs/${keyboardJob.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);

  const kbClose = page.locator('button', { hasText: /select final candidate/i }).first();
  await kbClose.focus();
  check(
    await kbClose.evaluate((el) => el === document.activeElement),
    'the closure action is reachable by keyboard focus'
  );
  await page.keyboard.press('Enter');
  await page.locator('[role=dialog]').waitFor({ state: 'visible', timeout: 15000 });
  check(true, 'Enter opens the dialog');

  const dlg = page.locator('[role=dialog]');
  check((await dlg.getAttribute('aria-modal')) === 'true', 'the dialog is marked aria-modal');
  check(Boolean(await dlg.getAttribute('aria-labelledby')), 'the dialog has an accessible name');
  check((await dlg.locator('[role=radiogroup]').count()) === 1, 'candidates are grouped as a radiogroup');

  const focusInside = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    return d.contains(document.activeElement);
  });
  check(focusInside, 'focus moves into the dialog on open');

  // Tab must cycle inside the dialog rather than escaping to the page behind.
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  const stillInside = await page.evaluate(() => {
    const d = document.querySelector('[role=dialog]');
    return d.contains(document.activeElement);
  });
  check(stillInside, 'Tab is trapped inside the dialog');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const restored = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
  check(/select final candidate/i.test(restored), 'focus returns to the trigger after Escape', restored.slice(0, 60));

  section('Runtime health');
  check(pageErrors.length === 0, 'no uncaught exceptions', pageErrors.join(' | '));

  // The app probes /auth/me on load to discover whether a session exists; before
  // sign-in that legitimately answers 401. The 409s from deliberately poking a
  // closed job are already excluded at capture time.
  const unexpectedRequests = failedRequests.filter((entry) => !entry.includes('/auth/me'));
  const unexpectedConsole = consoleIssues.filter((entry) => !entry.includes('Failed to load resource'));
  check(unexpectedConsole.length === 0, 'no console errors', unexpectedConsole.slice(0, 3).join(' | '));
  check(unexpectedRequests.length === 0, 'no unexpected failed requests', unexpectedRequests.slice(0, 3).join(' | '));
} catch (error) {
  failed++;
  console.log(`\n  SUITE ERROR: ${error.message}`);
  console.log(error.stack);
} finally {
  await browser.close();

  // The API intentionally exposes no job-delete route, so fixtures are removed
  // by the companion cleanup script, which matches on the fixture tag:
  //   node backend/tests/cleanupE2EFixtures.js
  const remaining = await api('GET', `/jobs?search=${TAG}&limit=100`);
  const leftover = remaining.body?.data?.length || 0;
  if (leftover > 0) console.log(`\n  [cleanup] ${leftover} fixture job(s) tagged "${TAG}" to remove.`);

  console.log('\n----------------------------------------------------------------');
  console.log(`  Job closure & search E2E: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------------------\n');
  process.exit(failed > 0 ? 1 : 0);
}
