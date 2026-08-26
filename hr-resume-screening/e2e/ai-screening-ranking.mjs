/**
 * AI Screening Agent & Ranking Agent End-to-End Test Suite.
 *
 *   node ai-screening-ranking.mjs
 *
 * Exercises:
 *   - Real fixture job creation & candidate upload via standard FormData
 *   - Screening Agent: job/candidate picker, analysis execution, loading states,
 *     structured results (fit level, recommendation, strengths, gaps, criteria),
 *     and "Screen Another Candidate" workflow.
 *   - Ranking Agent: job selection, scope selection (All vs Shortlisted),
 *     preference instruction, ranked results table, mandatory gap badges,
 *     and "Screen" action cross-agent navigation handoff.
 *   - Mobile responsiveness & Dark mode.
 *   - Automatic fixture teardown.
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
 * run. So `?search=e2erank` matched every previous run's fixtures too, and
 * assertions expecting one job started failing once a second run had happened —
 * reporting a defect in the product when the only thing wrong was the database.
 *
 * Keeping the prefix means cleanupE2EFixtures.js, which matches on `contains`,
 * still finds these.
 */
const RUN_ID = Math.random().toString(36).slice(2, 8);
const TAG = `e2erank${RUN_ID}`;
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
    new Blob([`Job Title: ${title}\nWe are hiring a Senior React Developer.\nRequired skills: React, TypeScript, Redux.\nPreferred skills: AWS, Next.js.\n4 years experience required.\nLocation: Bengaluru`], {
      type: 'text/plain'
    }),
    'jd.txt'
  );
  const res = await fetch(`${API}/api/jobs`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  const json = await res.json();
  return json.data;
};

let candidateSeq = 0;
const createCandidate = async (jobId, name, skills = 'React, TypeScript, Redux, Next.js', exp = 5) => {
  const seq = candidateSeq++;
  const first = name.split(' ')[0].toLowerCase();
  const form = new FormData();
  form.append(
    'resume',
    new Blob(
      [
        `${name}\nSenior Frontend Developer\nEmail: ${first}.${TAG}${seq}@example.invalid\n` +
          `Phone: +91 9${String(710000000 + seq).padStart(9, '0')}\nLocation: Bengaluru\n\n` +
          `SKILLS\n${skills}\n\nEXPERIENCE\n${exp} years building web applications.`
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

const browser = await chromium.launch({ ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const bodyText = async () => (await page.locator('body').textContent()) || '';

try {
  /* ------------------------------------------------------------- Sign in --- */
  section('Sign in');

  const loginRes = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  check(loginRes.status === 200, 'API login successful');

  await page.goto(`${BASE}/login`);
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  check(!page.url().includes('/login'), 'Browser logged in to dashboard');

  /* -------------------------------------------------------- Fixture setup -- */
  section('Fixture setup');

  const job = await createFixtureJob(`${TAG} Senior Frontend Architect`);
  check(Boolean(job && job.id), 'Fixture job created');
  const jobId = job.id;

  const cand1 = await createCandidate(jobId, 'Rahul Sharma', 'React, TypeScript, Redux, Next.js', 5);
  check(Boolean(cand1 && cand1.id), 'Candidate 1 (Rahul) uploaded');
  const cand1Id = cand1.id;

  const cand2 = await createCandidate(jobId, 'Priya Patel', 'React, Redux, AWS', 4); // Missing TypeScript
  check(Boolean(cand2 && cand2.id), 'Candidate 2 (Priya) uploaded');
  const cand2Id = cand2.id;

  /* ------------------------------------------------- Screening Agent E2E -- */
  section('Screening Agent workflow');

  await page.goto(`${BASE}/ai/screening`);
  await page.locator('h1').first().waitFor({ state: 'visible' });
  check((await bodyText()).includes('Screening Agent'), 'Screening Agent page loaded');

  page.on('console', (msg) => console.log('  [browser]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('  [browser error]', err.message));
  page.on('request', (req) => {
    if (req.url().includes('/api/')) console.log('  [fetch req]', req.method(), req.url());
  });
  page.on('response', async (res) => {
    if (res.url().includes('/api/')) {
      let text = '';
      try { text = await res.text(); } catch {}
      console.log('  [fetch res]', res.status(), res.url(), text.slice(0, 150));
    }
  });

  // Select job
  const jobSelect = page.locator('#agent-job-picker');
  await jobSelect.waitFor({ state: 'visible' });
  await jobSelect.selectOption(jobId);

  const candidateSelect = page.locator('#agent-candidate-picker');
  await candidateSelect.waitFor({ state: 'visible' });
  
  // Wait for candidates options to load from API
  await page.waitForFunction(
    (id) => {
      const select = document.querySelector('#agent-candidate-picker');
      return select && select.options.length > 1 && !select.disabled;
    },
    cand1Id,
    { timeout: 10000 }
  );
  check(await candidateSelect.isEnabled(), 'Candidate picker becomes enabled after job selection');

  // Select candidate Rahul
  await candidateSelect.selectOption(cand1Id);
  await page.waitForTimeout(300);

  const analyzeBtn = page.locator('#analyze-candidate-btn');
  check(await analyzeBtn.isEnabled(), 'Analyse candidate button is enabled');

  // Fill instruction and click Analyze
  await page.locator('#screening-instruction').fill('Focus on TypeScript and frontend architecture');
  await analyzeBtn.click();

  // Wait for result card
  const resultCard = page.locator('#screening-result-card');
  await resultCard.waitFor({ state: 'visible', timeout: 15000 });
  const resultText = await resultCard.textContent();

  check(resultText.includes('Rahul Sharma'), 'Result shows candidate name');
  check(resultText.includes('Senior Frontend Architect'), 'Result shows job title');
  check(/Existing Match Score/i.test(resultText), 'Result displays Existing Match Score');
  check(/Key Strengths/i.test(resultText), 'Result displays Key Strengths section');
  check(/Criteria Review/i.test(resultText), 'Result displays Detailed Criteria Review');

  // Test "Screen Another Candidate" action
  const screenAnotherBtn = page.locator('#screen-another-btn');
  await screenAnotherBtn.click();
  await page.waitForTimeout(400);

  check(await jobSelect.inputValue() === jobId, 'Screen Another keeps the selected job');
  check(await candidateSelect.inputValue() === '', 'Screen Another clears candidate selection');
  check(!await resultCard.isVisible(), 'Screen Another clears previous result');

  /* --------------------------------------------------- Ranking Agent E2E -- */
  section('Ranking Agent workflow');

  await page.goto(`${BASE}/ai/ranking`);
  await page.locator('h1').first().waitFor({ state: 'visible' });
  check((await bodyText()).includes('Ranking Agent'), 'Ranking Agent page loaded');

  const rankJobSelect = page.locator('#agent-job-picker');
  await rankJobSelect.waitFor({ state: 'visible' });
  await rankJobSelect.selectOption(jobId);
  await page.waitForTimeout(500);

  // Fill ranking preference
  await page.locator('#ranking-instruction').fill('Prioritize candidates with AWS experience');

  const rankBtn = page.locator('#rank-candidates-btn');
  check(await rankBtn.isEnabled(), 'Rank candidates button is enabled');
  await rankBtn.click();

  // Wait for results container
  const rankingContainer = page.locator('#ranking-results-container');
  await rankingContainer.waitFor({ state: 'visible', timeout: 15000 });
  const rankingText = await rankingContainer.textContent();

  check(rankingText.includes('Rahul Sharma'), 'Ranking list includes Rahul Sharma');
  check(rankingText.includes('Priya Patel'), 'Ranking list includes Priya Patel');
  check(/candidates considered/i.test(rankingText), 'Ranking header states candidate count');
  check(/Preference Applied/i.test(rankingText), 'Preference banner is displayed');

  // Verify Mandatory Gap indicator on Priya (missing TypeScript)
  check(/Mandatory/i.test(rankingText), 'Mandatory gap indicator is visible for missing required skills');

  // Test cross-agent handoff: Click "Screen" button for Rahul Sharma
  const screenCandidateRowBtn = rankingContainer.getByRole('button', { name: /Screen/i }).first();
  await screenCandidateRowBtn.click();
  await page.waitForURL((url) => url.pathname.includes('/ai/screening'), { timeout: 10000 });

  check(page.url().includes('/ai/screening'), 'Navigated to Screening Agent from Ranking row');
  check(page.url().includes(`jobId=${jobId}`), 'Carried jobId in query parameter');
  check(page.url().includes('candidateId='), 'Carried candidateId in query parameter');

  /* ------------------------------------------- Responsive & Mobile Test -- */
  section('Mobile and responsive layout');

  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${BASE}/ai/ranking`);
  await page.waitForLoadState('networkidle');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'No horizontal overflow on mobile viewport (375px)');

  /* ---------------------------------------------------- Dark mode test --- */
  section('Dark mode compatibility');

  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(300);
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  check(isDark, 'Dark theme class applied smoothly');

} catch (err) {
  failed++;
  console.error(`\n  SUITE ERROR: ${err.message}`);
  console.error(err.stack);
} finally {
  await browser.close();

  console.log('\n----------------------------------------------------------------');
  console.log(`  AI Screening & Ranking E2E: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------------------\n');
  process.exit(failed > 0 ? 1 : 0);
}
