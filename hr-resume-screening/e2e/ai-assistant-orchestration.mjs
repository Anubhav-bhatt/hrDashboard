/**
 * Acceptance checks for Phase 8 Unified AI Assistant Orchestration.
 *
 * Tests natural-language intent parsing, specialist agent orchestration,
 * context preservation, and follow-up interaction.
 *
 * Usage:
 *   node ai-assistant-orchestration.mjs
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

const ALL_MODES = { assistant: true, screening: true, ranking: true, comparison: true, insights: true };

const summary = ({ id, title, status = 'OPEN', stats = {} }) => ({
  success: true,
  data: {
    job: {
      id,
      title,
      status,
      isClosed: status === 'CLOSED'
    },
    stats: {
      candidateCount: 20,
      analyzedCount: 20,
      strongMatchCount: 5,
      shortlistedCount: 3,
      ...stats
    },
    strongMatchThreshold: 80
  }
});

const SUMMARIES = {
  [JOB_A]: summary({ id: JOB_A, title: 'Senior React Developer' })
};

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'msedge' });
const errors = [];

const open = async ({ jobId = JOB_A, modes = ALL_MODES } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  if (jobId) {
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
          activeFilters: {}
        })
      ]
    );
  }

  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource.*404/i.test(m.text())) return;
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));

  await page.route('**/api/**', (r) => r.fulfill({ json: { success: true, data: [], meta: {} } }));
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { success: true, data: { user: { id: 'u1', name: 'A', email: 'r@e.com', role: 'ADMIN' } } } })
  );
  await page.route('**/api/ai/config', (r) =>
    r.fulfill({ json: { success: true, data: { enabled: true, modes } } })
  );
  await page.route(
    (url) => /\/api\/jobs\/[^/]+\/summary/.test(url.pathname),
    (r) => {
      const id = r.request().url().match(/\/api\/jobs\/([^/]+)\/summary/)?.[1];
      const payload = SUMMARIES[id];
      return payload
        ? r.fulfill({ json: payload })
        : r.fulfill({ status: 404, json: { success: false, code: 'JOB_NOT_FOUND', message: 'Job not found.' } });
    }
  );

  return { context, page };
};

console.log('\n================================================================');
console.log('  AI Assistant — Unified Orchestration & Follow-ups');
console.log('================================================================');

/* ------------------------------------------------------------ A. Rank prompt -- */
{
  section('A. Current Job -> "Rank candidates"');
  const { context, page } = await open({ jobId: JOB_A });

  await page.route('**/api/ai/run', (r) => {
    return r.fulfill({
      json: {
        success: true,
        data: {
          mode: 'assistant',
          content: 'Ranking complete for Senior React Developer.\n\nTop candidates:\n1. Rahul Sharma (92% match)\n2. Priya Patel (88% match)',
          structuredData: {
            intent: 'RANK_CANDIDATES',
            status: 'SUCCESS',
            jobId: JOB_A,
            candidateIds: ['cand-1', 'cand-2'],
            specialistMode: 'ranking',
            suggestedActions: [
              { label: 'View full ranking', action: 'view_ranking', to: `/ai/ranking?jobId=${JOB_A}` },
              { label: 'Compare top 2', action: 'compare_candidates', mode: 'comparison', candidateIds: ['cand-1', 'cand-2'] }
            ]
          }
        }
      }
    });
  });

  await page.goto(`${BASE}/ai`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const textarea = page.locator('textarea').first();
  check(await textarea.isEnabled(), 'Assistant input field is enabled');

  await textarea.fill('Rank candidates');
  await textarea.press('Enter');
  await page.waitForTimeout(1000);

  const thread = await page.locator('#assistant-conversation-thread').innerText();
  check(/Ranking complete for Senior React Developer/.test(thread), 'Assistant responded with ranking summary');
  check(/Rahul Sharma/.test(thread), 'Ranked top candidate is displayed');

  const actionBtn = page.getByRole('button', { name: /Compare top 2/ });
  check((await actionBtn.count()) > 0, 'Suggested action "Compare top 2" is rendered');

  await context.close();
}

/* --------------------------------------------------------- B. Compare top 2 -- */
{
  section('B. Follow-up: "Compare top 2"');
  const { context, page } = await open({ jobId: JOB_A });

  let capturedContext = null;
  await page.route('**/api/ai/run', (r) => {
    const postData = r.request().postDataJSON();
    capturedContext = postData?.context;
    return r.fulfill({
      json: {
        success: true,
        data: {
          mode: 'assistant',
          content: 'Compared Rahul Sharma and Priya Patel for Senior React Developer.\n\nKey Trade-offs:\n• Rahul holds higher match score',
          structuredData: {
            intent: 'COMPARE_CANDIDATES',
            status: 'SUCCESS',
            jobId: JOB_A,
            candidateIds: ['cand-1', 'cand-2'],
            specialistMode: 'comparison',
            suggestedActions: [
              { label: 'View full comparison', action: 'view_comparison', to: `/ai/comparison?jobId=${JOB_A}&candidateIds=cand-1,cand-2` }
            ]
          }
        }
      }
    });
  });

  await page.goto(`${BASE}/ai`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const textarea = page.locator('textarea').first();
  await textarea.fill('Compare top 2');
  await textarea.press('Enter');
  await page.waitForTimeout(1000);

  check(capturedContext?.jobId === JOB_A, 'Context carried currentJobId');
  const thread = await page.locator('#assistant-conversation-thread').innerText();
  check(/Compared Rahul Sharma and Priya Patel/.test(thread), 'Assistant responded with comparison');

  await context.close();
}

/* ------------------------------------------------------------- C. No Job -- */
{
  section('C. No Job -> "Rank candidates" clarification');
  const { context, page } = await open({ jobId: null });

  await page.route('**/api/ai/run', (r) => {
    return r.fulfill({
      json: {
        success: true,
        data: {
          mode: 'assistant',
          content: 'Choose a job or run Ranking first so I know which candidates to work with.',
          structuredData: {
            intent: 'RANK_CANDIDATES',
            status: 'CLARIFICATION_REQUIRED',
            suggestedActions: [
              { label: 'Select a job from Jobs page', action: 'navigate_jobs', to: '/jobs' }
            ]
          }
        }
      }
    });
  });

  await page.goto(`${BASE}/ai`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const textarea = page.locator('textarea').first();
  await textarea.fill('Rank candidates');
  await textarea.press('Enter');
  await page.waitForTimeout(1000);

  const thread = await page.locator('#assistant-conversation-thread').innerText();
  check(/Choose a job/.test(thread), 'Clarification response returned cleanly');

  await context.close();
}

await browser.close();

console.log('\n----------------------------------------------------------------');
console.log(`  AI Assistant Orchestration E2E: ${pass} passed, ${fail} failed`);
console.log('----------------------------------------------------------------');
process.exit(fail === 0 ? 0 : 1);
