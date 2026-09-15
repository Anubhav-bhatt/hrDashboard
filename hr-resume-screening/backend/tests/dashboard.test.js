const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deriveNextAction, buildDashboardWorkflow } = require('../services/dashboardWorkflow');
const role = { id: 'job-1', title: 'Engineer', candidatesCount: 5, pendingReview: 0, unscoredCount: 0, shortlisted: 0 };

test('empty roles direct recruiters to import, never create a second job', () => {
  const action = deriveNextAction({ ...role, candidatesCount: 0 });
  assert.equal(action.actionLabel, 'Add candidates');
  assert.equal(action.destination, '/jobs/job-1/import');
});
test('unscored candidates take precedence over review and shortlist', () => {
  const action = deriveNextAction({ ...role, unscoredCount: 2, pendingReview: 3, shortlisted: 1 });
  assert.equal(action.destination, '/jobs/job-1');
  assert.equal(action.priority, 10);
  assert.match(action.description, /2 candidates/);
});
test('review action includes both stored review statuses and job scope', () => {
  const action = deriveNextAction({ ...role, pendingReview: 1, shortlisted: 1 });
  const url = new URL(action.destination, 'http://localhost');
  assert.equal(url.searchParams.get('jobId'), role.id);
  assert.equal(url.searchParams.get('hrStatus'), 'REVIEW,NEEDS_REVIEW');
  assert.equal(url.searchParams.get('sort'), 'score_desc');
});
test('shortlist and fallback actions use existing routes', () => {
  assert.equal(deriveNextAction({ ...role, shortlisted: 2 }).destination, '/candidates?jobId=job-1&hrStatus=SHORTLISTED&sort=score_desc');
  assert.equal(deriveNextAction(role).destination, '/jobs/job-1');
});
test('no jobs means no recommendation, attention or role rows', () => {
  assert.deepEqual(buildDashboardWorkflow([], [], []), { recommendedAction: null, needsAttention: [], hiringRoles: [] });
});
test('older backlog is considered, attention excludes recommendation, roles are bounded', () => {
  const jobs = Array.from({ length: 9 }, (_, i) => ({ id: `j${i}`, title: `Role ${i}`, createdAt: new Date(2026, 0, 10 - i) }));
  const scores = jobs.map((job, i) => ({ jobId: job.id, _count: { _all: i === 8 ? 20 : 2, overallScore: 2 }, _max: { overallScore: 88.5 } }));
  const statuses = jobs.map((job) => ({ jobId: job.id, hrStatus: 'REVIEW', _count: { _all: 2 } }));
  const result = buildDashboardWorkflow(jobs, statuses, scores);
  assert.equal(result.recommendedAction.id, 'j8');
  assert.equal(result.recommendedAction.unscoredCount, 18);
  assert.equal(result.needsAttention.length, 3);
  assert.ok(result.needsAttention.every((job) => job.id !== 'j8'));
  assert.equal(result.hiringRoles.length, 5);
  assert.equal(result.hiringRoles[0].topScore, 88.5);
});
test('pending review combines REVIEW and NEEDS_REVIEW without counting declined candidates', () => {
  const result = buildDashboardWorkflow([{ id: 'j', title: 'Role' }], [
    { jobId: 'j', hrStatus: 'REVIEW', _count: { _all: 2 } },
    { jobId: 'j', hrStatus: 'NEEDS_REVIEW', _count: { _all: 3 } },
    { jobId: 'j', hrStatus: 'NOT_SUITABLE', _count: { _all: 4 } }
  ], [{ jobId: 'j', _count: { _all: 9, overallScore: 9 }, _max: { overallScore: 0 } }]);
  assert.equal(result.hiringRoles[0].pendingReview, 5);
  assert.equal(result.hiringRoles[0].topScore, 0);
});
test('ties are deterministic and completed screening creates no attention item', () => {
  const jobs = [{ id: 'b', createdAt: new Date(0) }, { id: 'a', createdAt: new Date(0) }];
  const groups = jobs.map((job) => ({ jobId: job.id, _count: { _all: 1, overallScore: 1 }, _max: { overallScore: 50 } }));
  const result = buildDashboardWorkflow(jobs, [], groups);
  assert.equal(result.recommendedAction.id, 'a');
  assert.equal(result.needsAttention.length, 0);
});
