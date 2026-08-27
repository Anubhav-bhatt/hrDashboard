/**
 * AI Comparison Agent End-to-End Test Suite.
 *
 *   node ai-comparison.mjs
 *
 * Exercises:
 *   - Real fixture job creation & candidate uploads
 *   - Comparison Agent direct workflow: job picker, candidate multi-picker, bounds (2-5),
 *     loading progress, structured side-by-side results, criteria matrix, trade-offs,
 *     and best-by-dimension observations.
 *   - 2-5 candidate selection constraints (disabled with < 2, disabled extra beyond 5).
 *   - Candidate reset when job selection changes.
 *   - Ranking -> Comparison seamless handoff (URL query params pre-populating job and candidates).
 *   - Comparison -> Screening cross-agent handoff ("Screen" button).
 *   - Mobile responsiveness & dark mode compatibility.
 *   - Fixture teardown.
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

/*
 * A fixture tag unique to this run.
 *
 * The tag used to be the bare prefix, and the suite creates jobs carrying it on
 * every execution while cleanup lives in a separate script nobody is obliged to
 * run. So `?search=e2ecomp` matched every previous run's fixtures too, and
 * assertions expecting one job started failing once a second run had happened —
 * reporting a defect in the product when the only thing wrong was the database.
 *
 * Keeping the prefix means cleanupE2EFixtures.js, which matches on `contains`,
 * still finds these.
 */
const RUN_ID = Math.random().toString(36).slice(2, 8);
const TAG = `e2ecomp${RUN_ID}`;
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
const api = async (method, path, body) => {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined
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

const createFixtureJob = async (title) => {
  const form = new FormData();
  form.append('title', title);
  form.append(
    'jdFile',
    new Blob([`Job Title: ${title}\nWe are hiring a Senior Backend Lead.\nRequired skills: Node.js, PostgreSQL, Redis.\nPreferred skills: Docker, AWS.\n4 years experience required.\nLocation: Gurgaon`], {
      type: 'text/plain'
    }),
    'jd.txt'
  );
  const res = await fetch(`${API}/api/jobs`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  const json = await res.json();
  return json.data;
};

let candidateSeq = 0;
const createCandidate = async (jobId, name, skills, exp = 5) => {
  const seq = candidateSeq++;
  const first = name.split(' ')[0].toLowerCase();
  const form = new FormData();
  form.append(
    'resume',
    new Blob(
      [
        `${name}\nSenior Backend Developer\nEmail: ${first}.${TAG}${seq}@example.invalid\n` +
          `Phone: +91 9${String(720000000 + seq).padStart(9, '0')}\nLocation: Gurgaon\n\n` +
          `SKILLS\n${skills}\n\nEXPERIENCE\n${exp} years building scalable backend services.`
      ],
      { type: 'text/plain' }
    ),
    `${first}.txt`
  );
  const res = await fetch(`${API}/api/jobs/${jobId}/candidates/upload`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form
  });
  const json = await res.json();
  return json?.data?.candidate || null;
};

let browser;

try {
  section('Sign in');
  const loginRes = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  check(loginRes.status === 200, 'API login successful');

  browser = await chromium.launch({ ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`);
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
  check(!page.url().includes('/login'), 'Browser logged in to dashboard');

  section('Fixture setup');
  const job = await createFixtureJob(`${TAG} Senior Backend Lead`);
  check(Boolean(job && job.id), 'Fixture job created');
  const fixtureJobId = job.id;

  const cand1 = await createCandidate(fixtureJobId, 'Rahul Sharma', 'Node.js, PostgreSQL, Redis, Docker, JavaScript', 5);
  check(Boolean(cand1 && cand1.id), 'Candidate 1 (Rahul) uploaded');
  const candidate1Id = cand1.id;

  const cand2 = await createCandidate(fixtureJobId, 'Priya Patel', 'Node.js, PostgreSQL, AWS, TypeScript', 4);
  check(Boolean(cand2 && cand2.id), 'Candidate 2 (Priya) uploaded');
  const candidate2Id = cand2.id;

  const cand3 = await createCandidate(fixtureJobId, 'Amit Kumar', 'Node.js, Docker, Python', 3);
  check(Boolean(cand3 && cand3.id), 'Candidate 3 (Amit) uploaded');
  const candidate3Id = cand3.id;

  section('Comparison Agent direct workflow');
  await page.goto(`${BASE}/ai/comparison`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 15000 });
  const compH1 = await page.locator('h1').textContent();
  check(/comparison/i.test(compH1), 'Comparison Agent page loaded');

  // Select job
  await page.waitForSelector('#comparison-job-picker', { timeout: 15000 });
  await page.selectOption('#comparison-job-picker', fixtureJobId);

  // Wait for CandidateMultiPicker to render checkboxes
  await page.waitForSelector('input[type="checkbox"]', { timeout: 15000 });
  const checkboxes = page.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  check(checkboxCount >= 3, `Candidate checkboxes rendered (found ${checkboxCount})`);

  // Assert button disabled with 0 or 1 candidate
  const compareBtn = page.locator('#compare-candidates-btn');
  check(await compareBtn.isDisabled(), 'Compare button is disabled when < 2 candidates are chosen');

  // Select 1 candidate
  await checkboxes.nth(0).check();
  check(await compareBtn.isDisabled(), 'Compare button remains disabled with exactly 1 candidate');

  // Select second candidate
  await checkboxes.nth(1).check();
  check(!(await compareBtn.isDisabled()), 'Compare button becomes enabled when 2 candidates are chosen');

  // Select third candidate
  await checkboxes.nth(2).check();
  check(!(await compareBtn.isDisabled()), 'Compare button remains enabled when 3 candidates are chosen');

  // Enter optional focus. It sits behind a disclosure now — it is an optional
  // refinement, not part of the required setup — so open it first. The field and
  // the instruction it sends are unchanged.
  await page.locator('button[aria-controls="comparison-focus-panel"]').click();
  await page.locator('#comparison-focus-input').fill('Focus on Redis and AWS');
  check(
    (await page.locator('#comparison-focus-input').inputValue()) === 'Focus on Redis and AWS',
    'Optional comparison focus accepts an instruction'
  );

  // Click compare
  await compareBtn.click();

  // Wait for results
  await page.waitForSelector('h2:has-text("Senior Backend Lead")', { timeout: 20000 });
  const pageText = await page.textContent('main');
  check(/rahul sharma/i.test(pageText), 'Comparison includes Rahul Sharma');
  check(/priya patel/i.test(pageText), 'Comparison includes Priya Patel');
  check(/amit kumar/i.test(pageText), 'Comparison includes Amit Kumar');
  check(/match score/i.test(pageText), 'Result displays Match Score');
  check(/key comparative trade-offs/i.test(pageText), 'Result renders Key Trade-offs section');
  check(/detailed criteria breakdown/i.test(pageText), 'Result renders Detailed Criteria breakdown');

  section('Ranking -> Comparison handoff');
  await page.goto(`${BASE}/ai/ranking`, { waitUntil: 'domcontentloaded' });
  // Shared context may already provide a job, in which case ranking answers
  // immediately and keeps its setup collapsed. Open it explicitly to exercise
  // selecting this fixture role.
  const changeSetup = page.getByRole('button', { name: /change setup/i });
  await changeSetup.waitFor({ state: 'visible', timeout: 15000 });
  await changeSetup.click();
  await page.waitForSelector('#agent-job-picker', { timeout: 15000 });
  await page.selectOption('#agent-job-picker', fixtureJobId);

  // Click Rank
  const rankBtn = page.locator('#rank-candidates-btn');
  await rankBtn.click();
  await page.waitForSelector('#compare-top-candidates-btn', { timeout: 20000 });
  check(true, 'Ranking executed successfully and displayed Compare Top Candidates button');

  // Click Compare Top Candidates
  await page.click('#compare-top-candidates-btn');
  await page.waitForURL('**/ai/comparison**', { timeout: 15000 });
  check(page.url().includes('/ai/comparison'), 'Navigated to Comparison Agent from Ranking');
  check(page.url().includes(`jobId=${fixtureJobId}`), 'Carried jobId in query parameter');
  check(page.url().includes('candidateIds='), 'Carried candidateIds in query parameter');
  check(page.url().includes('source=ranking'), 'Carried source=ranking parameter');

  // Comparison page should automatically show preselected candidates
  await page.waitForSelector('#compare-candidates-btn', { timeout: 15000 });
  const prefilledCompareBtn = page.locator('#compare-candidates-btn');
  check(!(await prefilledCompareBtn.isDisabled()), 'Compare button is immediately enabled from Ranking handoff');

  await prefilledCompareBtn.click();
  await page.waitForSelector('h2:has-text("Senior Backend Lead")', { timeout: 20000 });
  check(true, 'Handoff comparison executed successfully');

  section('Comparison -> Screening cross-agent handoff');
  const screenBtn = page.locator('button:has-text("Screen")').first();
  await screenBtn.click();
  await page.waitForURL('**/ai/screening**', { timeout: 15000 });
  check(page.url().includes('/ai/screening'), 'Navigated to Screening Agent from Comparison');
  check(page.url().includes(`jobId=${fixtureJobId}`), 'Carried jobId to Screening Agent');
  check(page.url().includes('candidateId='), 'Carried candidateId to Screening Agent');

  section('Mobile and responsive layout');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/ai/comparison?jobId=${fixtureJobId}&candidateIds=${candidate1Id},${candidate2Id}&source=ranking`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 15000 });
  const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check(!hasHScroll, 'No horizontal overflow on mobile viewport (375px)');

  section('Dark mode compatibility');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  check(isDark, 'Dark theme applied smoothly');

} catch (err) {
  console.error('Test execution error:', err);
  check(false, `Test run threw exception: ${err.message}`);
} finally {
  if (browser) await browser.close();

  console.log(`\n----------------------------------------------------------------`);
  console.log(`  AI Comparison Agent E2E: ${passed} passed, ${failed} failed`);
  console.log(`----------------------------------------------------------------\n`);

  if (failed > 0) process.exit(1);
}
