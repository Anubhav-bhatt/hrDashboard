/**
 * Assistant specialist delegation, through the browser, against a real backend.
 *
 * The existing assistant suite mocks `/api/ai/run`, so it can only assert that
 * the task buttons are offered. That is why a delegation defect survived it: the
 * assistant rebuilt the delegated context from scratch, dropping the
 * authenticated `userId` and `userRole`, and every specialist hand-off came back
 * as "You do not have permission to use this tool (jobs.read required)". A
 * mocked response cannot see that, and the assistant reports the failure as an
 * ordinary answer rather than an error, so an HTTP 200 does not prove anything
 * either.
 *
 * This suite therefore talks to a real server and asserts on what the recruiter
 * actually reads: candidate names and real match scores in the reply. It walks
 * Rank -> Compare in one conversation, because the second turn is resolved from
 * the ids the first turn stored — so a delegated identity that is lost between
 * specialists shows up here and nowhere else.
 *
 * Environment: E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD, E2E_BROWSER, E2E_JOB_ID,
 *              E2E_CANDIDATE_NAMES (comma separated, at least two)
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const JOB_ID = process.env.E2E_JOB_ID;
const NAMES = (process.env.E2E_CANDIDATE_NAMES || '').split(',').map((n) => n.trim()).filter(Boolean);
const CHANNEL = process.env.E2E_BROWSER || 'msedge';
const CTX_KEY = 'hr-dashboard-recruitment-context';

if (!EMAIL || !PASSWORD || !JOB_ID || NAMES.length < 2) {
  console.error('E2E_EMAIL, E2E_PASSWORD, E2E_JOB_ID and E2E_CANDIDATE_NAMES (>=2) must be set.');
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
const section = (name) => console.log(`\n=== ${name} ===`);

const browser = await chromium.launch({ ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

/**
 * Sends one assistant turn and returns the text of the reply.
 *
 * A delegation that loses its identity never produces a reply bubble at all —
 * the request fails and the page shows its error banner instead. Racing the two
 * is what turns that into a named failure rather than a thirty-second timeout.
 */
const ask = async (prompt) => {
  const before = await page.locator('.whitespace-pre-wrap').count();
  await page.locator('textarea').first().fill(prompt);
  await page.locator('textarea').first().press('Enter');

  const reply = page
    .waitForFunction(
      // Two bubbles arrive per turn: the echoed prompt and the answer.
      (count) => document.querySelectorAll('.whitespace-pre-wrap').length >= count + 2,
      before,
      { timeout: 30000 }
    )
    .then(() => null);
  const banner = page
    .locator('[role="alert"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30000 })
    .then(() => page.locator('[role="alert"]').first().innerText());

  const error = await Promise.race([reply, banner]).catch(() => null);
  if (error) throw new Error(`the assistant returned an error instead of an answer: ${error.trim().slice(0, 200)}`);

  return page.locator('.whitespace-pre-wrap').last().innerText();
};

/** Every phrasing the tool layer uses to refuse an unidentified caller. */
const refused = (text) => /permission|not authorized|forbidden|jobs\.read/i.test(text);

try {
  section('Sign in and open the assistant with a role in context');

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').waitFor({ state: 'visible', timeout: 20000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
  check(true, 'the recruiter is signed in');

  // The working role is the one the recruiter already had open, which is the
  // state every real assistant turn starts from.
  await page.evaluate(
    ([key, jobId]) => window.sessionStorage.setItem(key, JSON.stringify({ currentJobId: jobId })),
    [CTX_KEY, JOB_ID]
  );

  await page.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 20000 });
  check(
    (await page.locator('#assistant-current-job').count()) === 1,
    'the assistant opens with the current role in context'
  );

  section('Rank candidates — the ranking specialist runs');

  const rankReply = await ask('Rank candidates for this role');
  check(!refused(rankReply), 'ranking is not refused by the tool layer', rankReply.slice(0, 160));
  check(/ranking complete/i.test(rankReply), 'the reply reports a completed ranking', rankReply.slice(0, 120));
  for (const name of NAMES.slice(0, 2)) {
    check(rankReply.includes(name), `the ranking names ${name}`, rankReply.slice(0, 200));
  }
  // A delegated call that reached the tools returns stored scores; one that did
  // not returns nothing to render.
  check(/\d+% match/.test(rankReply), 'real match scores are rendered', rankReply.slice(0, 200));
  check(!/Unscored/.test(rankReply), 'scored candidates are not reported as Unscored', rankReply.slice(0, 200));

  section('Compare top two — resolved from the ids the ranking stored');

  const stored = await page.evaluate((key) => window.sessionStorage.getItem(key), CTX_KEY);
  check(
    /lastRankingCandidateIds/.test(stored || '') && JSON.parse(stored).lastRankingCandidateIds.length >= 2,
    'the ranking result was recorded into the working context',
    (stored || '').slice(0, 160)
  );

  const compareReply = await ask('Compare the top two');
  check(!refused(compareReply), 'comparison is not refused by the tool layer', compareReply.slice(0, 160));
  check(/compared/i.test(compareReply), 'the reply reports a completed comparison', compareReply.slice(0, 120));
  for (const name of NAMES.slice(0, 2)) {
    check(compareReply.includes(name), `the comparison names ${name}`, compareReply.slice(0, 200));
  }
  check(!/undefined/.test(compareReply), 'no undefined values reach the recruiter', compareReply.slice(0, 200));

  section('Screen a candidate — the screening specialist runs');

  const screenReply = await ask(`Screen ${NAMES[0]}`);
  check(!refused(screenReply), 'screening is not refused by the tool layer', screenReply.slice(0, 160));
  check(screenReply.includes(NAMES[0]), `the screening names ${NAMES[0]}`, screenReply.slice(0, 200));
  check(/fit level/i.test(screenReply), 'screening evidence is rendered', screenReply.slice(0, 200));

  section('Insights still answers without a specialist hand-off');

  const insightReply = await ask('What should I focus on for this job?');
  check(!refused(insightReply), 'insights is not refused', insightReply.slice(0, 160));
  check(insightReply.trim().length > 0, 'insights returns an answer');

  section('Runtime health');

  check(pageErrors.length === 0, 'no uncaught exceptions', pageErrors.join(' | '));
  const unexpected = consoleErrors.filter((m) => !/401|Failed to load resource/.test(m));
  check(unexpected.length === 0, 'no unexpected console errors', unexpected.join(' | '));
} catch (error) {
  failed++;
  console.error(`\n  SUITE ERROR: ${error.message}`);
} finally {
  console.log('\n----------------------------------------');
  console.log(`Assistant delegation E2E: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}
