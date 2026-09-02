/**
 * Acceptance checks for the context-aware AI Assistant landing.
 *
 * The API is stubbed at the network boundary rather than logged into, so every
 * state the Assistant has to handle — no role, an open role, a closed role, a
 * deleted role, a disabled agent — is reachable deterministically, and so this
 * writes nothing to the database. The recruitment context is seeded into
 * sessionStorage exactly as the app itself stores it, which is also what makes
 * the refresh and job-switch checks honest.
 *
 * Usage:
 *   node ai-assistant.mjs
 *
 * Environment:
 *   E2E_BASE_URL   frontend origin        (default http://localhost:5173)
 *   E2E_BROWSER    'msedge' | 'chrome' | 'chromium'  (default msedge)
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const CTX_KEY = 'hr-dashboard-recruitment-context';

let pass = 0;
let fail = 0;
const check = (ok, label, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
};
const section = (name) => console.log(`\n-- ${name} --`);

const JOB_A = '00000000-0000-4000-8000-00000000000a';
const JOB_B = '00000000-0000-4000-8000-00000000000b';

/** The `/api/jobs/:id/summary` payload, shaped exactly as the backend returns it. */
const summary = ({ id, title, status = 'OPEN', selectedCandidateId = null, stats = {} }) => ({
  success: true,
  data: {
    job: {
      id,
      title,
      status,
      isClosed: status === 'CLOSED',
      selectedCandidateId,
      canClose: status === 'OPEN' && (stats.shortlistedCount ?? 0) > 0
    },
    stats: {
      candidateCount: 0,
      analyzedCount: 0,
      strongMatchCount: 0,
      shortlistedCount: 0,
      needsReviewCount: 0,
      pendingReviewCount: 0,
      notSuitableCount: 0,
      inReviewCount: 0,
      selectedCount: 0,
      bestMatchScore: null,
      averageMatchScore: null,
      ...stats
    },
    strongMatchThreshold: 80
  }
});

const SUMMARIES = {
  [JOB_A]: summary({
    id: JOB_A,
    title: 'Senior React Developer',
    stats: { candidateCount: 42, analyzedCount: 42, strongMatchCount: 12, shortlistedCount: 4, bestMatchScore: 93 }
  }),
  [JOB_B]: summary({
    id: JOB_B,
    title: 'Backend Platform Engineer',
    stats: { candidateCount: 17, analyzedCount: 17, strongMatchCount: 3, bestMatchScore: 84 }
  })
};

const ALL_MODES = { assistant: true, screening: true, ranking: true, comparison: true, insights: true };

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'msedge' });
const errors = [];

/**
 * Opens the Assistant with a seeded context and a stubbed API.
 *
 * @param {Object} [o]
 * @param {string|null} [o.jobId]   Seeded `currentJobId`, or null for no context
 * @param {Object} [o.modes]        AI mode flags returned by /api/ai/config
 * @param {Object} [o.summaries]    jobId -> summary payload; a missing id 404s
 * @param {number} [o.width]
 */
const open = async ({ jobId = null, modes = ALL_MODES, summaries = SUMMARIES, width = 1440, extraContext = {} } = {}) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });

  if (jobId) {
    /*
     * Seeded once, then owned by the app.
     *
     * `addInitScript` runs before *every* document, so an unconditional write
     * would silently restore the starting job on each navigation — the
     * job-switch check would then measure the seed rather than the app, and
     * pass or fail for the wrong reason.
     */
    await context.addInitScript(
      ([key, value]) => {
        if (!window.sessionStorage.getItem(key)) window.sessionStorage.setItem(key, value);
      },
      [
        CTX_KEY,
        JSON.stringify({
          currentJobId: jobId,
          selectedCandidateIds: [],
          lastRankingCandidateIds: [],
          lastComparisonCandidateIds: [],
          sourceWorkflow: null,
          currentTask: null,
          activeFilters: {},
          ...extraContext
        })
      ]
    );
  }

  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    /*
     * Scenario F deletes a role on purpose, so the browser logs a 404 for the
     * summary it can no longer fetch. That is the condition under test, not a
     * defect; the assertions there prove it was handled. React warnings and
     * uncaught exceptions still land here.
     */
    if (/Failed to load resource.*404/i.test(m.text())) return;
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));

  // Anything unnamed must still answer 200: the client reads a 401 on any
  // request as the session ending, which would redirect away from /ai.
  await page.route('**/api/**', (r) => r.fulfill({ json: { success: true, data: [], meta: {} } }));
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { success: true, data: { user: { id: 'u1', name: 'A', email: 'r@e.com', role: 'ADMIN' } } } })
  );
  await page.route('**/api/ai/config', (r) =>
    r.fulfill({ json: { success: true, data: { enabled: true, modes } } })
  );
  /*
   * Keep the ranking agent inert but successful, so the job-switch check can
   * travel through it without depending on the mock agent's real output.
   *
   * `candidateScope` and `totalCandidatesConsidered` are present because the
   * real endpoint always sends them and the result header reads both. A stub
   * that omitted them would crash RankingAgent and report it as a failure of
   * this suite, which tests the Assistant.
   */
  await page.route('**/api/ai/run', (r) =>
    r.fulfill({
      json: {
        success: true,
        data: {
          mode: 'ranking',
          content: 'ok',
          structuredData: {
            jobId: JOB_B,
            jobTitle: 'Backend Platform Engineer',
            candidateScope: 'ALL',
            totalCandidatesConsidered: 0,
            rankedCandidates: []
          }
        }
      }
    })
  );
  await page.route(
    (url) => /\/api\/jobs\/[^/]+\/summary/.test(url.pathname),
    (r) => {
      const id = r.request().url().match(/\/api\/jobs\/([^/]+)\/summary/)?.[1];
      const payload = summaries[id];
      return payload
        ? r.fulfill({ json: payload })
        : r.fulfill({ status: 404, json: { success: false, code: 'JOB_NOT_FOUND', message: 'Job not found.' } });
    }
  );

  return { context, page };
};

const gotoAssistant = async (page) => {
  await page.goto(`${BASE}/ai`, { waitUntil: 'networkidle' });
  await page.locator('h1, h2').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(600);
};

const readContext = (page) =>
  page.evaluate((k) => {
    try {
      return JSON.parse(window.sessionStorage.getItem(k));
    } catch {
      return null;
    }
  }, CTX_KEY);

console.log('\n================================================================');
console.log('  AI Assistant — lifecycle-aware context');
console.log('================================================================');

/* ------------------------------------------------------------ A. no context -- */
{
  section('A. no current job');
  const { context, page } = await open({ jobId: null });
  await gotoAssistant(page);
  const body = await page.locator('body').innerText();

  check(!(await page.locator('#assistant-current-job').count()), 'no current-job panel is shown');
  check(!(await page.locator('#assistant-context-metrics').count()), 'no metrics are invented without a role');
  check(/what would you like to do/i.test(body), 'the task menu still leads the page');
  check((await page.getByRole('button', { name: /rank candidates/i }).count()) > 0, 'Rank candidates remains offered');
  check((await page.getByRole('button', { name: /screen a candidate/i }).count()) > 0, 'Screen a candidate remains offered');
  check((await page.getByRole('button', { name: /compare candidates/i }).count()) > 0, 'Compare candidates remains offered');
  check(/open a role from/i.test(body), 'it says where a role comes from');
  check(await page.locator('textarea').first().isDisabled(), 'the instruction field stays honestly disabled');
  await context.close();
}

/* --------------------------------------------------------- B. open job state -- */
{
  section('B. current OPEN job');
  const { context, page } = await open({ jobId: JOB_A });
  await gotoAssistant(page);
  const body = await page.locator('body').innerText();
  const metrics = await page.locator('#assistant-context-metrics').innerText();

  check(/current job/i.test(body), 'the panel is labelled Current job');
  check((await page.locator('#assistant-current-job').innerText()).includes('Senior React Developer'), 'the role title is shown');
  check(/42/.test(metrics), 'the real candidate count is shown', metrics.replace(/\n+/g, ' | '));
  check(/12/.test(metrics), 'the real strong-match count is shown');
  check(/4\b/.test(metrics), 'the real shortlisted count is shown');
  check(/80%\+/.test(metrics), 'the strong-match threshold is stated, not assumed');
  check(/recommended next step/i.test(body), 'a recommended next step is stated');
  check((await page.locator('#assistant-recommended-action').count()) === 1, 'exactly one dominant action is offered');

  // 4 shortlisted with nobody selected: deriveNextAction says review the shortlist.
  const cta = await page.locator('#assistant-recommended-action').innerText();
  check(/review shortlist/i.test(cta), 'the action matches the shared lifecycle helper', cta);
  check(/other actions/i.test(body), 'the task menu is demoted to Other actions');
  await context.close();
}

/* ------------------------------------------------------- C. action navigation -- */
{
  section('C. actions carry the role');
  const { context, page } = await open({ jobId: JOB_A });
  await gotoAssistant(page);

  const hrefs = await page.locator('a[href*="/ai/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  const forMode = (mode) => hrefs.filter((h) => h.startsWith(`/ai/${mode}`));

  check(forMode('ranking').some((h) => h.includes(`jobId=${JOB_A}`)), 'Ranking receives the current job', forMode('ranking').join(' '));
  check(forMode('comparison').some((h) => h.includes(`jobId=${JOB_A}`)), 'Comparison receives the current job', forMode('comparison').join(' '));
  check(forMode('screening').some((h) => h.includes(`jobId=${JOB_A}`)), 'Screening receives the current job');
  check(forMode('insights').some((h) => h.includes(`jobId=${JOB_A}`)), 'Insights receives the current job');
  check(hrefs.every((h) => !h.includes('candidateIds=')), 'no candidate ids are invented into an agent link');

  // The recommended action itself is a recruitment screen, not an agent, so it
  // can never be pointed at a switched-off agent.
  const rec = await page.locator('#assistant-recommended-action').getAttribute('href');
  check(rec.startsWith(`/jobs/${JOB_A}`), 'the recommendation targets the role, not an agent', rec);
  await context.close();
}

/* -------------------------------------------------------------- D. refresh -- */
{
  section('D. refresh');
  const { context, page } = await open({ jobId: JOB_A });
  await gotoAssistant(page);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  check(
    (await page.locator('#assistant-current-job').innerText()).includes('Senior React Developer'),
    'the role survives a refresh'
  );
  check((await readContext(page))?.currentJobId === JOB_A, 'and the stored context still names it');
  await context.close();
}

/* ------------------------------------------------------------ E. job switch -- */
{
  section('E. switching roles');
  const { context, page } = await open({
    jobId: JOB_A,
    extraContext: { lastRankingCandidateIds: ['cand-a1', 'cand-a2'], selectedCandidateIds: ['cand-a1'] }
  });
  await gotoAssistant(page);
  check((await page.locator('#assistant-current-job').innerText()).includes('Senior React Developer'), 'starts on job A');

  // Switch through a real agent entry, the way a recruiter would.
  await page.goto(`${BASE}/ai/ranking?jobId=${JOB_B}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await gotoAssistant(page);

  const after = await readContext(page);
  check(
    (await page.locator('#assistant-current-job').innerText()).includes('Backend Platform Engineer'),
    'the Assistant follows to job B'
  );
  check(after?.currentJobId === JOB_B, 'the stored context names job B');
  check(!(after?.lastRankingCandidateIds || []).includes('cand-a1'), 'job A ranking ids are gone');
  check(!(after?.selectedCandidateIds || []).includes('cand-a1'), 'job A selection is gone');
  const metrics = await page.locator('#assistant-context-metrics').innerText();
  check(!/42/.test(metrics), 'no job A figure survives into job B', metrics.replace(/\n+/g, ' | '));
  await context.close();
}

/* --------------------------------------------------------- F. deleted job -- */
{
  section('F. remembered role that no longer exists');
  const { context, page } = await open({ jobId: JOB_A, summaries: {} }); // every summary 404s
  await gotoAssistant(page);
  await page.waitForTimeout(800);
  const body = await page.locator('body').innerText();

  check(!(await page.locator('#assistant-current-job').count()), 'the dead role is not shown');
  check(/what would you like to do/i.test(body), 'it falls back to the no-role state');
  check((await page.getByRole('button', { name: /rank candidates/i }).count()) > 0, 'the task menu still works');
  check((await readContext(page))?.currentJobId === null, 'the invalid role is cleared from context');
  check(!/error|failed|something went wrong/i.test(body), 'no error is shown for an ordinary deletion', body.slice(0, 120));
  await context.close();
}

/* ---------------------------------------------------------- G. closed job -- */
{
  section('G. closed job');
  const closed = {
    [JOB_A]: summary({
      id: JOB_A,
      title: 'Senior React Developer',
      status: 'CLOSED',
      selectedCandidateId: 'cand-hired',
      stats: { candidateCount: 42, analyzedCount: 42, strongMatchCount: 12, shortlistedCount: 4, selectedCount: 1, bestMatchScore: 93 }
    })
  };
  const { context, page } = await open({ jobId: JOB_A, summaries: closed });
  await gotoAssistant(page);
  const body = await page.locator('body').innerText();
  const cta = await page.locator('#assistant-recommended-action').innerText();

  check(/closed/i.test(body), 'the role is marked closed');
  check(/view closed job/i.test(cta), 'the action is to read it, not to work it', cta);
  check(!/close job/i.test(cta), 'it does not offer to close an already-closed role');
  check(!/shortlist|select a candidate/i.test(cta), 'it does not offer shortlisting or selection');
  /*
   * Scoped to the context panel, not the page: the sidebar always lists every
   * agent, and asserting against it would only ever measure the navigation.
   */
  const panel = page.locator('#assistant-context-metrics').locator('xpath=ancestor::*[contains(@class,"card")][1]');
  const also = (await panel.locator('a[href*="/ai/"]').evaluateAll((els) => els.map((e) => e.textContent))).join(' ');
  check(!/rank candidates/i.test(also), 'no ranking action is offered for a closed role', also.trim().slice(0, 120));
  check(!/compare/i.test(also), 'no comparison action is offered for a closed role', also.trim().slice(0, 120));

  // Nor may the task menu below hand a finished role to a live agent.
  const menu = await page.locator('a[href*="jobId="], button').evaluateAll((els) =>
    els.map((e) => e.getAttribute('href')).filter(Boolean)
  );
  check(!menu.some((h) => h.includes(`/ai/ranking?jobId=${JOB_A}`)), 'the task menu does not pre-load the closed role');
  await context.close();
}

/* -------------------------------------------------------- H. feature flags -- */
{
  section('H. a disabled agent is never recommended');
  const { context, page } = await open({
    jobId: JOB_A,
    modes: { ...ALL_MODES, ranking: false, comparison: false }
  });
  await gotoAssistant(page);

  const hrefs = await page.locator('a[href*="/ai/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  check(!hrefs.some((h) => h.startsWith('/ai/ranking')), 'no link to the disabled ranking agent', hrefs.join(' '));
  check(!hrefs.some((h) => h.startsWith('/ai/comparison')), 'no link to the disabled comparison agent');
  check(hrefs.some((h) => h.startsWith('/ai/screening')), 'the enabled screening agent is still offered');
  check((await page.locator('#assistant-recommended-action').count()) === 1, 'a recommendation is still made');

  // The card's accessible name carries its description too, so this cannot be
  // anchored — it is matched on the label the recruiter reads.
  const rankCard = page.getByRole('button', { name: /Rank candidates/ });
  check((await rankCard.count()) > 0, 'the disabled agent card is still listed');
  check(await rankCard.first().isDisabled(), 'and is disabled rather than hidden');
  await context.close();
}

/* ---------------------------------------------------------- I. responsive -- */
{
  section('I. responsive');
  for (const width of [375, 768, 1280, 1440]) {
    const { context, page } = await open({ jobId: JOB_A, width });
    await gotoAssistant(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    check(!overflow, `${width}px — no horizontal page overflow`);
    check(await page.locator('#assistant-recommended-action').isVisible(), `${width}px — the recommendation stays visible`);
    await context.close();
  }
}

/* ------------------------------------------------------- J. runtime health -- */
{
  section('J. runtime health');
  // React key/prop warnings and unhandled rejections surface here as console errors.
  check(errors.length === 0, 'no console errors or uncaught exceptions', errors.slice(0, 3).join(' | '));
}

await browser.close();

console.log('\n----------------------------------------------------------------');
console.log(`  AI Assistant context E2E: ${pass} passed, ${fail} failed`);
console.log('----------------------------------------------------------------');
process.exit(fail === 0 ? 0 : 1);
