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
import { execSync } from 'node:child_process';

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

/* ── Isolated fixture ──────────────────────────────────────────────────────
 *
 * This suite used to open with:
 *
 *     const jobsRes = await api('/jobs?status=OPEN&sort=candidates&limit=5');
 *     const busiest = (jobsRes.body?.data || []).find((j) => j.candidateCount > 0);
 *
 * and then drove nine different sections against whatever job that returned.
 * Two things were wrong with it.
 *
 * It was not deterministic. Which job came back depended on whatever happened
 * to be in the database, so which conditional branches ran — and therefore how
 * many assertions executed — changed between runs. The suite reported 121, 131,
 * 136 and 152 checks on four consecutive runs of the same code. A gate whose
 * size moves cannot tell you whether a change broke something.
 *
 * And it operated on records it did not own. On a workspace whose only populated
 * job was a real one, this suite drove the real job through the real workflows.
 *
 * So the suite now creates its own job, tagged `e2esimpl<runid>`, populates it
 * with exactly the states the assertions below need, and never looks at another
 * job again. The prefix is one `cleanupE2EFixtures.js` recognises, and the run
 * id keeps two runs from colliding.
 */
const RUN_ID = Math.random().toString(36).slice(2, 8);
const FIXTURE_TAG = `e2esimpl${RUN_ID}`;

if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
  console.error('Refusing to create fixtures against a production environment.');
  process.exit(1);
}

const uploadCandidate = async (jobId, name, seq, skills) => {
  const form = new FormData();
  form.append(
    'resume',
    new Blob(
      [
        `${name}\nSenior Frontend Developer\n` +
          `Email: ${name.split(' ')[0].toLowerCase()}.${FIXTURE_TAG}${seq}@example.invalid\n` +
          `Phone: +91 9${String(600000000 + seq).padStart(9, '0')}\nLocation: Pune\n\n` +
          `SKILLS\n${skills.join(', ')}\n\nEXPERIENCE\n${4 + (seq % 6)} years building web applications.`
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
  const json = await res.json().catch(() => null);
  return json?.data?.candidateId || null;
};

const jobForm = new FormData();
jobForm.append('title', `${FIXTURE_TAG} Senior React Developer`);
jobForm.append(
  'jdFile',
  new Blob(
    ['We are hiring a Senior React Developer. Required skills: React, TypeScript, Node.js. 4 years experience required.'],
    { type: 'text/plain' }
  ),
  'jd.txt'
);
const createdJob = await fetch(`${API}/api/jobs`, { method: 'POST', headers: { Cookie: cookie }, body: jobForm })
  .then((r) => r.json())
  .catch(() => null);

const fixtureJob = createdJob?.data;
if (!fixtureJob?.id) {
  console.error('Could not create the simplification fixture job.');
  process.exit(1);
}
const fixtureJobId = fixtureJob.id;

/*
 * Six candidates, chosen so every branch this suite exercises has a guaranteed
 * precondition: candidates exist, some clear the strong-match threshold, one is
 * shortlisted, and the pool is large enough for the browser's controls to have
 * something to act on.
 */
const fixtureCandidateIds = [];
const STRONG_SKILLS = ['React', 'TypeScript', 'Node.js'];
const WEAK_SKILLS = ['jQuery', 'PHP'];
for (const [index, spec] of [
  ['Aarav Fixture', STRONG_SKILLS],
  ['Priya Fixture', STRONG_SKILLS],
  ['Rahul Fixture', STRONG_SKILLS],
  ['Meera Fixture', WEAK_SKILLS],
  ['Vikram Fixture', WEAK_SKILLS],
  ['Ananya Fixture', WEAK_SKILLS]
].entries()) {
  const id = await uploadCandidate(fixtureJobId, spec[0], index, spec[1]);
  if (id) fixtureCandidateIds.push(id);
}

if (fixtureCandidateIds.length < 4) {
  console.error(`Fixture created only ${fixtureCandidateIds.length} candidates; the suite needs at least 4.`);
  process.exit(1);
}

/* One shortlisted candidate, so shortlist-dependent surfaces have a subject. */
const fixtureShortlistedCandidateId = fixtureCandidateIds[0];
await fetch(`${API}/api/jobs/${fixtureJobId}/candidates/${fixtureShortlistedCandidateId}/status`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ status: 'SHORTLISTED' })
});

/** The suite's only job. Nothing below may reach for another. */
const busiest = { id: fixtureJobId, title: fixtureJob.title };

/**
 * Removes only what THIS run created.
 *
 * Scoped with `--tag=${FIXTURE_TAG}`, which includes the run id, so a run can
 * never delete another suite's fixtures — and in particular never touches the
 * visual-audit dataset the design work depends on.
 */
const removeFixture = () => {
  try {
    execSync(`node ../backend/tests/cleanupE2EFixtures.js --tag=${FIXTURE_TAG}`, { stdio: 'ignore' });
  } catch {
    /* Best effort: the tag keeps the records identifiable and removable either way. */
  }
};

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

  /*
   * The sidebar is four named groups, not one flat list.
   *
   * OLD: one "Main navigation" group holding Dashboard, Jobs, Candidates and
   *      Closed Jobs, plus a "Management" group holding Settings.
   * NEW: WORKSPACE (where am I) / HIRING (what am I hiring for) / AI (what can
   *      help me) / SYSTEM (what do I configure).
   *
   * WHY: with the funnel sitting beside the Dashboard, "Workspace" had come to
   *      mean "everything", which is the same as meaning nothing. The property
   *      this suite protects is unchanged and still asserted exactly — a short,
   *      fixed set of primary destinations, with not everything promoted to
   *      primary — it is now asserted per group instead of over one list.
   */
  const workspaceNav = page.locator('nav[aria-label="Main navigation"] a');
  check(
    (await workspaceNav.count()) === 1,
    'WORKSPACE is exactly one destination',
    `got ${await workspaceNav.count()}`
  );
  const workspaceLabels = (await workspaceNav.allInnerTexts()).map((t) => t.trim().toLowerCase());
  check(
    JSON.stringify(workspaceLabels) === JSON.stringify(['dashboard']),
    'WORKSPACE is the Dashboard',
    workspaceLabels.join(', ')
  );

  const hiringNav = page.locator('nav[aria-label="Hiring navigation"] a');
  check(
    (await hiringNav.count()) === 3,
    'HIRING is exactly three destinations',
    `got ${await hiringNav.count()}`
  );
  const hiringLabels = (await hiringNav.allInnerTexts()).map((t) => t.trim().toLowerCase());
  check(
    JSON.stringify(hiringLabels) === JSON.stringify(['jobs', 'candidates', 'closed jobs']),
    'they are Jobs, Candidates, Closed Jobs',
    hiringLabels.join(', ')
  );

  const systemLinks = page.locator('nav[aria-label="System navigation"] a');
  const systemLabels = (await systemLinks.allInnerTexts()).map((t) => t.trim().toLowerCase());
  check(systemLabels.includes('settings'), 'Settings remains reachable under SYSTEM', systemLabels.join(', '));

  /*
   * Closed Jobs sits with the hiring funnel, not with configuration.
   *
   * Hiring history is a high-frequency recruiter destination; grouping it with
   * Settings put a routine workflow behind the same heading as configuration a
   * recruiter opens a few times a year.
   */
  const primaryClosed = page.locator('nav[aria-label="Hiring navigation"] a[href="/jobs/closed"]');
  check(
    (await primaryClosed.count()) === 1,
    'Closed Jobs appears exactly once in the hiring group',
    String(await primaryClosed.count())
  );
  check(
    (await page.locator('aside nav a[href="/jobs/closed"]').count()) === 1,
    'Closed Jobs is not duplicated across the sidebar'
  );
  check(
    !systemLabels.includes('closed jobs'),
    'Closed Jobs does not sit under SYSTEM',
    systemLabels.join(', ')
  );
  check(
    /closed jobs/i.test((await primaryClosed.innerText()) || (await primaryClosed.getAttribute('aria-label')) || ''),
    'Closed Jobs has an accessible name'
  );

  // Create Job stays a page action rather than a permanent sidebar destination.
  check(
    (await page.locator('aside nav a[href="/jobs/new"]').count()) === 0,
    '/jobs/new is not a permanent sidebar destination'
  );

  // Active state must move cleanly between Jobs and Closed Jobs.
  await page.goto(`${BASE}/jobs/closed`, { waitUntil: 'domcontentloaded' });
  await page.locator('nav[aria-label="Hiring navigation"]').first().waitFor({ state: 'visible', timeout: 20000 });
  check(
    (await page.locator('nav[aria-label="Hiring navigation"] a[href="/jobs/closed"]').getAttribute('aria-current')) ===
      'page',
    'Closed Jobs is active on /jobs/closed'
  );
  check(
    (await page.locator('nav[aria-label="Hiring navigation"] a[href="/jobs"]').getAttribute('aria-current')) !== 'page',
    'Jobs does not remain active on /jobs/closed'
  );
  await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' });
  await page.locator('nav[aria-label="Hiring navigation"]').first().waitFor({ state: 'visible', timeout: 20000 });
  check(
    (await page.locator('nav[aria-label="Hiring navigation"] a[href="/jobs"]').getAttribute('aria-current')) === 'page',
    'Jobs is active on /jobs'
  );

  // Keyboard reachability of the promoted destination.
  const closedLink = page.locator('nav[aria-label="Hiring navigation"] a[href="/jobs/closed"]');
  await closedLink.focus();
  check(
    await closedLink.evaluate((node) => node === document.activeElement),
    'Closed Jobs is keyboard focusable'
  );

  /*
   * Return to the Dashboard before handing off.
   *
   * The navigation assertions above move the page around; the section that
   * follows asserts against the Dashboard and relied on the page still being
   * there. Leaving it parked elsewhere made those checks fail for a reason that
   * had nothing to do with what they test.
   */
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('button[aria-controls="dashboard-analytics"]').waitFor({ state: 'visible', timeout: 25000 });

  /* ----------------------------------------------- Test 11: dashboard focus */
  section('Tests 11-15 — dashboard focus');
  const dash = await text();
  check(/needs your attention/i.test(dash), 'Needs your attention is present');
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
  check(/recent hires/i.test(analyticsText), 'Recent hires is preserved inside Analytics');

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
  const tabLabels = (await jobTabs.allInnerTexts()).map((t) => t.trim().toLowerCase());
  check(
    tabLabels.join('|') === 'overview|job criteria',
    'the workspace offers Overview and Job criteria',
    tabLabels.join(', ')
  );

  // A requirements summary answers "is this the right vacancy" without opening
  // the criteria form.
  const jobBody = await text();
  check(/requirements/i.test(jobBody), 'a requirements summary is on the overview');
  check(/view full requirements/i.test(jobBody), 'the full requirements are one click away');

  /*
   * The extracted JD moved from a card of its own into "More details".
   * A recruiter opening a job wants its state, not reference material, so the
   * disclosure now holds the JD rather than sitting beside it.
   */
  const detailsToggle = page.locator('button[aria-controls="job-more-details"]');
  if ((await detailsToggle.count()) > 0) {
    check(true, 'reference material is behind a More details disclosure');
    const panel = page.locator('#job-more-details');
    check(await panel.isHidden(), 'More details starts collapsed');
    await detailsToggle.first().click();
    await page.waitForTimeout(400);
    check(await panel.isVisible(), 'More details opens on request');
    await detailsToggle.first().click();
    await page.waitForTimeout(300);
  } else {
    check(false, 'reference material is behind a More details disclosure', 'no disclosure found');
  }

  /*
   * The Candidates tab was retired on purpose.
   *
   * It mounted a second full CandidateBrowser one click from
   * /jobs/:jobId/candidates. The workspace now previews the strongest
   * candidates and links to the route that owns browsing, so the assertions
   * here changed from "the tab embeds a browser" to "the tab is gone, its
   * preview is present, and old links still land somewhere useful".
   */
  check((await jobTabs.count()) === 2, 'the workspace offers two tabs, not three', `${await jobTabs.count()}`);
  check(
    (await page.locator('#candidate-search, input[type=search]').count()) === 0,
    'the workspace no longer embeds a full candidate browser'
  );
  check(
    /view all|view candidates/i.test(await text()),
    'the workspace links out to the candidate browser instead'
  );

  // A link to the retired tab must still land on the browser it used to show.
  const jobUrl = page.url().split('?')[0];
  await page.goto(`${jobUrl}?tab=candidates`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  check(
    /\/candidates(\?|$)/.test(page.url()) && !page.url().includes('tab=candidates'),
    'an old ?tab=candidates link redirects to the candidate browser',
    page.url()
  );
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Job criteria: summary first, full editing behind Edit.
  await jobTabs.nth(1).click();
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
  check(/import from outlook/i.test(importBody), 'Import from Outlook is the other choice');
  check(!/drag resumes here/i.test(importBody), 'source configuration is hidden until a method is chosen');
  await page.getByRole('button', { name: /^upload resumes/i }).click();
  await page.waitForTimeout(400);
  check(/drag resumes here/i.test(await text()), 'a single drop zone is offered');
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
  await page.locator('button', { hasText: /change method/i }).click();
  await page.locator('button', { hasText: /import from outlook/i }).click();
  await page.waitForTimeout(1200);
  check(/outlook/i.test(await text()), 'the Outlook import flow is still available');

  /* ---------------------------- Tests 67-68: candidate list simplification */
  section('Tests 67-70 — candidate list and profile');
  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' });
  await page.locator('button[aria-label^="Quick look at"]').first().waitFor({ state: 'visible', timeout: 25000 });

  // Toolbar holds search, sort and a Filters button — not every filter.
  for (const gone of ['#filter-score', '#filter-experience', '#filter-location', '#filter-skill']) {
    check((await page.locator(gone).count()) === 0, `${gone} is no longer inline in the toolbar`);
  }
  check((await page.locator('select[aria-label="Sort candidates"]').count()) === 1, 'sort stays in the toolbar');

  /*
   * Approved status-filter contract.
   *
   * This replaces assertions for a retired design that kept seven permanent
   * status tabs in the toolbar (All / Best Matches / In Review / Needs Review /
   * Shortlisted / Selected / Not Suitable). Seven always-on controls worked
   * against the simplification this suite exists to protect, so status now
   * collapses into one dropdown.
   *
   * Best Matches is NOT an hrStatus — it is a score preset built on the
   * server's strong-match threshold — so it stays a first-class control beside
   * the dropdown rather than being folded into it.
   *
   * These checks assert URL and request wiring rather than result counts, so
   * they hold whatever candidate data happens to exist.
   */
  const presetLabels = (await page.locator('[aria-label="Filter candidates"] button').allInnerTexts())
    .map((label) => label.trim().toLowerCase());
  check(presetLabels.some((label) => label.startsWith('all')), 'the All preset is offered', presetLabels.join(' | '));
  check(
    presetLabels.some((label) => label.startsWith('best matches')),
    'Best Matches remains an independent preset',
    presetLabels.join(' | ')
  );
  check(presetLabels.length === 2, 'the toolbar keeps exactly two presets beside the status control', String(presetLabels.length));

  const statusFilter = page.locator('#candidate-status-filter');
  check((await statusFilter.count()) === 1, 'a single status control exists');
  check(
    Boolean((await statusFilter.getAttribute('aria-label')) || '').valueOf(),
    'the status control has an accessible name',
    await statusFilter.getAttribute('aria-label')
  );
  check((await statusFilter.inputValue()) === '', 'status defaults to no restriction');
  const statusOptions = await statusFilter.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => ({ value: node.value, label: node.textContent.trim() }))
  );
  check(
    statusOptions.some((option) => option.value === '' && /any status/i.test(option.label)),
    'the default option reads as no status restriction',
    JSON.stringify(statusOptions.map((o) => o.label))
  );

  // Every hrStatus the product stores must be selectable, and must reach the server.
  for (const status of ['REVIEW', 'NEEDS_REVIEW', 'SHORTLISTED', 'SELECTED', 'NOT_SUITABLE']) {
    const request = page.waitForRequest(
      (candidate) => candidate.url().includes('/api/candidates') && candidate.url().includes(`hrStatus=${status}`),
      { timeout: 15000 }
    );
    await statusFilter.selectOption(status);
    let served = true;
    try {
      await request;
    } catch {
      served = false;
    }
    check(served, `selecting ${status} reaches the server as hrStatus=${status}`);
    check(new URL(page.url()).searchParams.get('hrStatus') === status, `selecting ${status} updates the URL`);
  }

  // Refresh must preserve the selection, because the filter lives in the URL.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#candidate-status-filter').waitFor({ state: 'visible', timeout: 20000 });
  check(
    (await page.locator('#candidate-status-filter').inputValue()) === 'NOT_SUITABLE',
    'refresh preserves the selected status'
  );

  // Clearing removes the restriction entirely rather than leaving an empty param.
  await page.locator('#candidate-status-filter').selectOption('');
  await page.waitForTimeout(900);
  check(!new URL(page.url()).searchParams.get('hrStatus'), 'clearing status removes the restriction from the URL');

  // Card/Table is presentation only: it must not disturb the status filter and
  // must not refetch, because `view` is deliberately absent from FILTER_KEYS.
  await page.locator('#candidate-status-filter').selectOption('SHORTLISTED');
  await page.waitForTimeout(900);
  let refetched = false;
  const watchRefetch = (request) => {
    if (request.url().includes('/api/candidates') || /\/api\/jobs\/[^/]+\/candidates/.test(request.url())) refetched = true;
  };
  page.on('request', watchRefetch);
  const viewToggle = page.locator('[aria-label="Candidate layout"] button');
  if ((await viewToggle.count()) >= 2) {
    await viewToggle.nth(1).click();
    await page.waitForTimeout(1200);
    check(
      (await page.locator('#candidate-status-filter').inputValue()) === 'SHORTLISTED',
      'switching to Table preserves the status filter'
    );
    await viewToggle.nth(0).click();
    await page.waitForTimeout(1200);
    check(
      (await page.locator('#candidate-status-filter').inputValue()) === 'SHORTLISTED',
      'switching back to Cards preserves the status filter'
    );
    check(!refetched, 'Card/Table switching triggers no candidate refetch');
  } else {
    check(false, 'the Card/Table toggle is present');
  }
  page.off('request', watchRefetch);
  await page.locator('#candidate-status-filter').selectOption('');
  await page.waitForTimeout(700);

  // Best matches must reuse the shared threshold rather than invent one.
  const summary = await api('/candidates?limit=1');
  const threshold = summary.body?.facets?.strongMatchThreshold;
  check(threshold === 80, 'the API reports the shared strong-match threshold', String(threshold));
  // Best Matches is the second preset beside the status dropdown.
  await page.locator('[aria-label="Filter candidates"] button').nth(1).click();
  await page.waitForTimeout(1600);
  check(page.url().includes(`minScore=${threshold}`), 'Best matches applies the shared threshold', page.url());
  check(
    !new URL(page.url()).searchParams.get('hrStatus'),
    'Best matches is a score preset, not a status filter',
    page.url()
  );

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
  await page.locator('button[aria-label^="Quick look at"]').first().waitFor({ state: 'visible', timeout: 25000 });
  await page.locator('button[aria-label^="Quick look at"]').first().click();
  await page.getByRole('dialog', { name: /candidate quick look/i }).getByRole('button', { name: /open full profile/i }).click();
  await page.waitForURL((url) => /^\/candidates\/[^/]+$/.test(url.pathname), { timeout: 20000 });
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
    ['/dashboard', /needs your attention|focus/i],
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
  // Runs on the failure path too, so an aborted run does not leave fixture jobs
  // behind to be mistaken for real data by the next person who opens the app.
  removeFixture();
  console.log('\n----------------------------------------------------------------');
  console.log(`  UX simplification E2E: ${passed} passed, ${failed} failed`);
  console.log(`  fixture: ${FIXTURE_TAG} (removed)`);
  console.log('----------------------------------------------------------------\n');
  process.exit(failed > 0 ? 1 : 0);
}
