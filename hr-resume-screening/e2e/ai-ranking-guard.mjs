/**
 * Regression guard: an agent result missing `candidateScope` must not take the
 * Ranking route down.
 *
 * The result header reads the scope straight off the agent response. One of the
 * two places that did so was unguarded, so a response without the field threw
 * `Cannot read properties of undefined (reading 'toLowerCase')` during render
 * and the whole route fell into the ErrorBoundary — a blank agent instead of a
 * ranking with one word missing from a subtitle.
 *
 * The live backend always sends the field, which is why this was never seen in
 * normal use; it needs a response the real API does not currently produce, so
 * the API is stubbed at the network boundary. That also means this suite writes
 * nothing to the database and needs no fixtures or sign-in.
 *
 * Usage:
 *   node ai-ranking-guard.mjs
 *
 * Environment:
 *   E2E_BASE_URL   frontend origin        (default http://localhost:5173)
 *   E2E_BROWSER    'msedge' | 'chrome' | 'chromium'  (default msedge)
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const JOB_ID = '00000000-0000-4000-8000-0000000000f1';

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

/**
 * A ranking result, with `candidateScope` under the caller's control.
 *
 * Everything else mirrors the real payload so the only variable under test is
 * the missing field.
 */
const rankingResult = (scopeKey) => {
  const structuredData = {
    jobId: JOB_ID,
    jobTitle: 'Senior React Developer',
    totalCandidatesConsidered: 2,
    returnedCount: 2,
    instructionApplied: null,
    rankedCandidates: [
      {
        rank: 1,
        candidateId: '00000000-0000-4000-8000-0000000000c1',
        candidateName: 'Rahul Sharma',
        matchScore: 92,
        mandatoryGaps: [],
        evidence: ['Strong React depth']
      },
      {
        rank: 2,
        candidateId: '00000000-0000-4000-8000-0000000000c2',
        candidateName: 'Priya Patel',
        matchScore: 88,
        mandatoryGaps: [],
        evidence: ['Strong AWS experience']
      }
    ]
  };

  // `absent` deletes the key outright; the others set it to the falsy values a
  // future execution path could realistically produce.
  if (scopeKey === 'absent') delete structuredData.candidateScope;
  else if (scopeKey === 'null') structuredData.candidateScope = null;
  else if (scopeKey === 'empty') structuredData.candidateScope = '';
  else structuredData.candidateScope = scopeKey;

  return { success: true, data: { mode: 'ranking', content: 'Ranking complete.', structuredData } };
};

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'msedge' });

const run = async (scopeKey) => {
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource.*404/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));

  await page.route('**/api/**', (r) => r.fulfill({ json: { success: true, data: [], meta: {} } }));
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { success: true, data: { user: { id: 'u1', name: 'A', email: 'r@e.com', role: 'ADMIN' } } } })
  );
  await page.route('**/api/ai/config', (r) =>
    r.fulfill({
      json: {
        success: true,
        data: { enabled: true, modes: { assistant: true, screening: true, ranking: true, comparison: true, insights: true } }
      }
    })
  );
  await page.route('**/api/ai/run', (r) => r.fulfill({ json: rankingResult(scopeKey) }));

  // Ranking auto-runs once the role is known, so the stubbed result renders
  // without driving the picker.
  await page.goto(`${BASE}/ai/ranking?jobId=${JOB_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const body = await page.locator('body').innerText();
  const rendered = (await page.locator('#ranking-results-container').count()) > 0;
  const subtitle = rendered ? await page.locator('#ranking-results-container').innerText() : '';

  await context.close();
  return { errors, rendered, body, subtitle };
};

console.log('\n================================================================');
console.log('  Ranking — optional candidateScope is not a crash');
console.log('================================================================');

for (const [scopeKey, label] of [
  ['absent', 'the field is absent'],
  ['null', 'the field is null'],
  ['empty', 'the field is an empty string']
]) {
  console.log(`\n-- ${label} --`);
  const { errors, rendered, body, subtitle } = await run(scopeKey);

  check(errors.length === 0, 'no uncaught exception', errors.slice(0, 2).join(' | '));
  check(rendered, 'the ranking result still renders');
  check(/Rahul Sharma/.test(body), 'the ranked candidates are still listed');
  check(!/Something went wrong|went wrong/i.test(body), 'the route did not fall into the error boundary');
  // The established idiom degrades to "all" rather than dropping the sentence.
  check(/\(all\)/.test(subtitle), 'the scope reads "all" when unknown', subtitle.split('\n').slice(0, 3).join(' | '));
}

/* A present scope must be unchanged — this is a guard, not a behaviour change. */
console.log('\n-- a real scope is unchanged --');
{
  const { errors, rendered, subtitle } = await run('SHORTLISTED');
  check(errors.length === 0, 'no uncaught exception', errors.slice(0, 2).join(' | '));
  check(rendered, 'the ranking result renders');
  check(/\(shortlisted\)/.test(subtitle), 'the real scope is still shown, lower-cased', subtitle.split('\n').slice(0, 3).join(' | '));
}

await browser.close();

console.log('\n----------------------------------------------------------------');
console.log(`  Ranking candidateScope guard: ${pass} passed, ${fail} failed`);
console.log('----------------------------------------------------------------');
process.exit(fail === 0 ? 0 : 1);
