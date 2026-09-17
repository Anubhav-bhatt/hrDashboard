/**
 * End-to-end recruiter workflow suite.
 *
 * Drives a real browser against a running frontend + backend and asserts the
 * journeys that matter: authentication boundaries, dashboard card navigation,
 * search, the candidate profile, filter persistence across Back, and the
 * not-found paths. It also fails the run on console errors, uncaught exceptions
 * and unexpected failed requests.
 *
 * Usage:
 *   node scenarios.mjs
 *
 * Environment:
 *   E2E_BASE_URL   frontend origin        (default http://localhost:5173)
 *   E2E_EMAIL      recruiter account email
 *   E2E_PASSWORD   recruiter account password
 *   E2E_BROWSER    'msedge' | 'chrome' | 'chromium'  (default msedge)
 *   E2E_HEADED     set to 1 to watch the run
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CHANNEL = process.env.E2E_BROWSER || 'msedge';

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
const failedRequests = [];
const requestLog = [];

page.on('console', (message) => {
  const type = message.type();
  if (type === 'error') consoleIssues.push(`[error] ${message.text().slice(0, 200)}`);
  else if (type === 'warning' && !message.text().includes('DevTools')) {
    consoleIssues.push(`[warning] ${message.text().slice(0, 200)}`);
  }
});
page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 200)));
page.on('response', (response) => {
  requestLog.push(response.url());
  if (response.status() >= 400) {
    failedRequests.push(`${response.status()} ${response.request().method()} ${response.url().replace('http://localhost:5000', '')}`);
  }
});

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
const text = () => page.locator('body').innerText();

try {
  /* ------------------- Scenario 4a: signed-out access is blocked ---------- */
  section('Scenario 4a — protected routes reject an anonymous visitor');
  await page.goto(`${BASE}/candidates`, { waitUntil: 'networkidle' });
  check(page.url().includes('/login'), 'visiting /candidates while signed out redirects to /login', page.url());
  check(!/rahul|priya|amit|sneha/i.test(await text()), 'no candidate data is rendered on the sign-in screen');

  /* ------------------------------- invalid login -------------------------- */
  section('Authentication — rejected credentials');
  await page.fill('#email', EMAIL);
  await page.fill('#password', 'definitely-not-the-password');
  await page.click('button[type=submit]');
  await page.waitForTimeout(1400);
  check(/incorrect email address or password/i.test(await text()), 'a wrong password shows a clear error');
  check(page.url().includes('/login'), 'the recruiter stays on the sign-in screen');

  /* ------- Scenario 1: sign in -> dashboard -> card -> search -> profile --- */
  section('Scenario 1 — sign in through to a candidate profile');
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
  check(true, 'valid credentials sign the recruiter in');

  // Signing in returns the recruiter to the route they originally requested,
  // which here is /candidates rather than the dashboard.
  check(page.url().includes('/candidates'), 'sign-in restores the originally requested route', page.url());

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

  // Wait for real content, not just network idle: the KPI cards render skeletons
  // until the analytics request resolves.
  await page.locator('a[aria-label^="Active candidates"]').waitFor({ state: 'visible', timeout: 20000 });
  const dashboard = await text();
  check(/candidates/i.test(dashboard), 'the dashboard renders its KPI cards');
  check(!/\bNaN\b|\bundefined\b/.test(dashboard), 'no NaN or undefined values appear on the dashboard');
  check(/needs attention/i.test(dashboard), 'the Needs attention section renders');

  // Old: pipeline and recent candidates sat behind a collapsed Analytics disclosure.
  // New: the compact dashboard shows them directly, with no disclosure.
  // Why: the dashboard redesign keeps one compact pipeline, match quality and a short
  // recent list on the page instead of hiding them behind an extra click.
  check(/hiring pipeline/i.test(dashboard), 'the hiring pipeline renders on the dashboard');
  check(/recent candidates/i.test(dashboard), 'the recent candidates panel renders on the dashboard');
  check((await page.locator('button[aria-controls="dashboard-analytics"]').count()) === 0, 'no collapsed Analytics disclosure remains');

  const totalCard = page.locator('a[aria-label^="Active candidates"]');
  check((await totalCard.count()) === 1, 'the Active candidates card is a single interactive element');

  // Click the far corner of the card, well away from any text, to prove the
  // whole surface is the target rather than just the label. Positioned relative
  // to the element so the assertion does not depend on the page's scroll offset.
  const cardBox = await totalCard.boundingBox();
  await totalCard.click({ position: { x: cardBox.width - 24, y: 14 } });
  await page.waitForURL('**/candidates**', { timeout: 15000 });
  // The card links to the ranked list, so a sort parameter is expected.
  check(
    new URL(page.url()).pathname === '/candidates',
    'clicking the card corner navigates to the candidate list',
    page.url()
  );

  await page.locator('button[aria-label^="Quick look at"]').first().waitFor({ state: 'visible', timeout: 20000 });
  check(/candidates/i.test(await text()), 'the candidate list renders');

  await page.fill('#candidate-search', 'rahul');
  await page.waitForTimeout(1600);
  check(page.url().includes('search=rahul'), 'the search term is mirrored into the URL', page.url());
  const matches = await page.locator('button[aria-label^="Quick look at"]').count();
  check(matches >= 1, `search finds the candidate (${matches} result(s))`);

  await page.locator('button[aria-label^="Quick look at"]').first().click();
  await page.getByRole('dialog', { name: /candidate quick look/i }).getByRole('button', { name: /open full profile/i }).click();
  await page.waitForURL((url) => /^\/candidates\/[^/]+$/.test(url.pathname), { timeout: 15000 });
  await page.getByRole('tab', { name: /overview/i }).waitFor({ state: 'visible', timeout: 20000 });
  const profileUrl = page.url().split('?')[0];
  const candidateId = new URL(profileUrl).pathname.split('/').pop();
  const candidateResponse = await page.request.get(`${BASE}/api/candidates/${candidateId}`);
  const candidatePayload = await candidateResponse.json();
  const selectedCandidate = candidatePayload.data;

  const profile = await text();
  const profileLower = profile.toLowerCase();
  const visibleValue = (value) => !value || profileLower.includes(String(value).toLowerCase());
  check(candidateResponse.ok() && Boolean(selectedCandidate), 'the opened profile is backed by the candidate detail API');
  check(visibleValue(selectedCandidate?.name), 'the profile header shows the selected candidate name');
  check(visibleValue(selectedCandidate?.personal?.email), 'the candidate email is visible when available');
  const phoneDigits = String(selectedCandidate?.personal?.phone || '').replace(/\D/g, '');
  check(!phoneDigits || profile.replace(/\D/g, '').includes(phoneDigits), 'the candidate phone is formatted and visible when available');
  check(visibleValue(selectedCandidate?.personal?.currentLocation), 'the candidate location is visible when available');
  check(
    visibleValue(selectedCandidate?.professional?.headline || selectedCandidate?.professional?.currentRole),
    'the current professional role is visible'
  );
  check(visibleValue(selectedCandidate?.professional?.currentCompany), 'the current company is visible when available');
  check(
    !selectedCandidate?.personal?.linkedin || (await page.getByRole('link', { name: /linkedin/i }).count()) > 0,
    'the LinkedIn profile is surfaced when available'
  );
  check(
    !selectedCandidate?.personal?.github || profileLower.includes('github'),
    'the GitHub profile is surfaced when available'
  );
  check(visibleValue(selectedCandidate?.professional?.summary), 'the professional summary comes from the resume when available');
  const educationEvidence = selectedCandidate?.educationDetail?.[0]?.degree || selectedCandidate?.education?.[0];
  check(visibleValue(educationEvidence), 'education uses the selected candidate resume data when available');
  /*
   * Resume actions follow the data, in both directions.
   *
   * These asserted unconditionally that the profile offers "Open resume", which
   * held only while whichever candidate the search landed on happened to carry
   * resume bytes. Candidates legitimately have none — a seeded record, or an
   * import where the blob was deliberately not stored — and offering to open a
   * document that does not exist would be the actual defect. The API already
   * states which case this is, so the suite asserts the matching one rather than
   * depending on the shape of the database it runs against.
   */
  const resumeAvailable = selectedCandidate?.resume?.available === true;
  if (resumeAvailable) {
    check(/open resume/i.test(profile), 'the resume can be opened when one is stored');
    check(/download/i.test(profile), 'the resume can be downloaded when one is stored');
  } else {
    check(
      !/open resume/i.test(profile),
      'no resume action is offered for a candidate without a stored document',
      `storage=${selectedCandidate?.resume?.storage}`
    );
  }
  check(/email candidate/i.test(profile), 'an outreach action is available');
  const certificationEvidence = selectedCandidate?.certifications?.[0]?.name || selectedCandidate?.certifications?.[0];
  check(visibleValue(certificationEvidence), 'certifications use resume data when available');

  /* --------------------------------- profile tabs ------------------------- */
  section('Candidate profile — tabbed sections');
  const experienceEvidence = selectedCandidate?.experience?.[0]?.company || selectedCandidate?.experience?.[0]?.title;
  const skillEvidence = selectedCandidate?.skills?.[0];
  const tabExpectations = [
    ['Experience', experienceEvidence ? new RegExp(experienceEvidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /no work experience|experience/i],
    ['Skills', skillEvidence ? new RegExp(skillEvidence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : /no skills|skills/i],
    // The resume panel offers a Document / Extracted text switch.
    ['Resume', /extracted text|document not available/i],
    ['Notes', /add a note/i],
    /*
     * Activity, like the resume actions above, follows the data.
     *
     * The tab was asserted to contain "resume imported", which is only true for
     * a candidate whose import wrote an activity row. A candidate with an empty
     * trail renders "Nothing recorded yet" — the correct thing to show, and the
     * assertion has to accept whichever of the two this candidate actually is.
     */
    [
      'Activity',
      selectedCandidate?.activities?.length > 0 ? /resume imported|status|note/i : /nothing recorded yet/i
    ]
  ];

  for (const [tabName, pattern] of tabExpectations) {
    await page.getByRole('tab', { name: new RegExp(tabName, 'i') }).click();
    await page.waitForTimeout(500);
    check(pattern.test(await text()), `the ${tabName} tab renders its content`);
    check(page.url().includes(`tab=${tabName.toLowerCase()}`), `the ${tabName} tab is reflected in the URL`);
  }

  // Keyboard support for the tab list. The selected tab is derived from the URL,
  // so the preceding click is allowed to settle before the arrow key is sent,
  // and focus is placed on the tab explicitly rather than relying on the click.
  await page.getByRole('tab', { name: /overview/i }).click();
  await page.waitForTimeout(800);
  await page.getByRole('tab', { name: /overview/i }).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  check(page.url().includes('tab=experience'), 'arrow keys move between tabs', page.url());

  /* ------------------------------- resume preview ------------------------ */
  section('Resume tab');
  await page.getByRole('tab', { name: /resume/i }).click();
  await page.waitForTimeout(2500);

  const resumePanel = await page.evaluate(() => {
    const frame = document.querySelector('iframe');
    return {
      hasFrame: Boolean(frame),
      // A PDF preview must come from a same-origin blob: embedding the API URL
      // directly is a cross-origin frame that the API correctly refuses.
      framesBlob: frame ? String(frame.getAttribute('src') || '').startsWith('blob:') : null,
      bodyText: document.body.innerText
    };
  });

  if (resumePanel.hasFrame) {
    check(resumePanel.framesBlob, 'the PDF preview is rendered from a same-origin blob URL');
    check(!/could not be loaded/i.test(resumePanel.bodyText), 'the preview did not report a load failure');
  } else {
    // A non-PDF resume shows its extracted text rather than an empty frame.
    check(
      /extracted text|original document not available|preview is only available for pdf/i.test(resumePanel.bodyText),
      'a non-PDF resume shows its text instead of an empty preview'
    );
  }

  // The extracted text must be reachable: either already shown, or one click away.
  const textSwitch = page.getByRole('tab', { name: /extracted text/i });
  if ((await textSwitch.count()) > 0) {
    await textSwitch.click();
    await page.waitForTimeout(600);
    check(/experienced react developer|technical skills/i.test(await text()), 'the extracted resume text is viewable');
  } else {
    check(
      /experienced react developer|technical skills|original document not available/i.test(resumePanel.bodyText),
      'the extracted resume text is viewable'
    );
  }

  /* ------------- Scenario 2: dashboard card -> filtered candidates -------- */
  section('Scenario 2 — the Shortlisted card deep-links to a filtered list');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.locator('a[aria-label^="Shortlisted"]').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('a[aria-label^="Shortlisted"]').first().click();
  await page.waitForURL('**hrStatus=SHORTLISTED**', { timeout: 15000 });
  await page.waitForTimeout(1200);
  check(page.url().includes('hrStatus=SHORTLISTED'), 'the URL carries the status filter');
  check(/status: shortlisted/i.test(await text()), 'the active-filter chip reflects the deep link');

  /* -------------- Scenario 3: filter + sort survive Back ------------------ */
  section('Scenario 3 — filter, sort, open a profile, then go Back');
  await page.goto(`${BASE}/candidates`, { waitUntil: 'networkidle' });
  await page.locator('button[aria-label^="Quick look at"]').first().waitFor({ state: 'visible', timeout: 20000 });
  // Sort stays in the toolbar; every field-level filter now lives in the Filters
  // drawer, which is what lets the list open with just search, sort and presets.
  await page.locator('button[aria-controls="candidate-filters"]').click();
  await page.locator('#drawer-filter-skill').waitFor({ state: 'visible', timeout: 15000 });
  await page.selectOption('#drawer-filter-skill', 'React');
  await page.waitForTimeout(1100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.selectOption('select[aria-label="Sort candidates"]', 'newest');
  await page.waitForTimeout(1100);

  check(page.url().includes('skill=React'), 'the skill filter is in the URL');
  check(page.url().includes('sort=newest'), 'the sort choice is in the URL');
  const countBeforeBack = await page.locator('button[aria-label^="Quick look at"]').count();

    await page.locator('button[aria-label^="Quick look at"]').first().click();
  await page.getByRole('dialog', { name: /candidate quick look/i }).getByRole('button', { name: /open full profile/i }).click();
  await page.waitForURL((url) => /^\/candidates\/[^/]+$/.test(url.pathname), { timeout: 15000 });
  await page.goBack();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(900);

  check(page.url().includes('skill=React') && page.url().includes('sort=newest'), 'Back restores the filtered URL', page.url());
  const countAfterBack = await page.locator('button[aria-label^="Quick look at"]').count();
  check(countAfterBack === countBeforeBack, `the same results are shown after Back (${countBeforeBack} then ${countAfterBack})`);

  /* ------------------- Scenario 5: invalid candidate ID ------------------- */
  section('Scenario 5 — an unknown candidate ID is handled cleanly');
  const errorsBefore = pageErrors.length;
  await page.goto(`${BASE}/candidates/11111111-1111-1111-1111-111111111111`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check(/candidate not found/i.test(await text()), 'a candidate-not-found state is shown');
  check(/back to candidates/i.test(await text()), 'a recovery action is offered');
  check(pageErrors.length === errorsBefore, 'the app does not crash on an unknown ID');

  await page.goto(`${BASE}/nope/nowhere`, { waitUntil: 'networkidle' });
  check(/page not found/i.test(await text()), 'an unknown route shows the 404 page');

  /* ---------- Scenario 4b: sign out, then revisit the profile URL --------- */
  section('Scenario 4b — after signing out the profile URL reveals nothing');
  await page.goto(profileUrl, { waitUntil: 'networkidle' });
  await page.locator('button[aria-haspopup="menu"]').waitFor({ state: 'visible', timeout: 20000 });
  await page.click('button[aria-haspopup="menu"]');
  await page.waitForTimeout(400);
  await page.getByRole('menuitem', { name: /sign out/i }).click();
  await page.waitForURL('**/login**', { timeout: 15000 });
  check(page.url().includes('/login'), 'signing out returns to the sign-in screen');

  await page.goto(profileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  check(page.url().includes('/login'), 'revisiting the profile URL redirects to sign-in', page.url());
  const afterSignOut = await text();
  check(!/rahul sharma/i.test(afterSignOut), 'the candidate name is not rendered after signing out');
  check(!/rahul\.sharma@example\.com/.test(afterSignOut), 'the candidate email is not rendered after signing out');

  /* ------------------------- responsive sweep ---------------------------- */
  section('Responsive — no horizontal overflow');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

  const widths = [1440, 1280, 1024, 768, 430, 390, 375];
  const routes = ['/', '/candidates', profileUrl.replace(BASE, ''), '/jobs'];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      check(!overflows, `${width}px — ${route} has no horizontal page overflow`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });

  /* --------------------------- quality gates ----------------------------- */
  section('Quality gates — console, exceptions, network');
  // 401 on the initial /auth/me probe and the deliberate unknown-ID 404 are expected.
  const unexpectedRequests = failedRequests.filter(
    (entry) => !entry.includes('/auth/me') && !entry.includes('11111111-1111') && !entry.includes('/auth/login')
  );
  const unexpectedConsole = consoleIssues.filter(
    (entry) => !entry.includes('401') && !entry.includes('404') && !entry.includes('Failed to load resource')
  );

  check(pageErrors.length === 0, 'zero uncaught exceptions', pageErrors.join(' | '));
  check(unexpectedConsole.length === 0, 'zero unexpected console errors or warnings', unexpectedConsole.join(' | '));
  check(unexpectedRequests.length === 0, 'zero unexpected failed requests', unexpectedRequests.join(' | '));

  const overviewCalls = requestLog.filter((url) => url.includes('/api/analytics/overview')).length;
  console.log(`  (info) analytics/overview was requested ${overviewCalls} time(s) across the run`);
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
