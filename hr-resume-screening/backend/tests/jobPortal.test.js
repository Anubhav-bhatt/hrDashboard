/**
 * Jobs portal and job-wise dashboard integration tests.
 *
 * Creates two jobs with controlled candidate scores, then asserts the
 * aggregation, ranking and isolation guarantees the portal depends on. Cleans up
 * everything it creates.
 *
 *   npm run test:jobs
 */
require('dotenv').config();
const http = require('http');
const { createSuite, assert } = require('./harness');

const prisma = require('../config/prisma');
const app = require('../server');
const { hashPassword } = require('../services/authService');
const { STRONG_MATCH_MIN } = require('../utils/scoreThresholds');

const suite = createSuite('Jobs portal & job-wise dashboard');
const { testAsync } = suite;

const PREFIX = 'jobportaltest';
const TEST_EMAIL = `${PREFIX}.recruiter@example.invalid`;
const TEST_PASSWORD = 'JobPortalTest123!';

let server;
let baseUrl;
let cookie = '';
const created = { userIds: [], jobIds: [], candidateIds: [] };

const request = async (method, path, { body, raw = false } = {}) => {
  const options = { method, headers: {} };
  if (cookie) options.headers.Cookie = cookie;
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${path}`, options);
  const setCookie = response.headers.get('set-cookie');
  if (raw) return { status: response.status, setCookie, headers: response.headers };

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { parseError: true };
  }
  return { status: response.status, body: json, setCookie };
};

/** Creates a candidate with an explicit score and status. */
const makeCandidate = async (jobId, index, { name, score = null, status = 'REVIEW', skills = [] }) => {
  const candidate = await prisma.candidate.create({
    data: {
      jobId,
      name,
      email: `${PREFIX}.${index}@example.invalid`,
      currentRole: 'Engineer',
      totalExperience: 3 + index * 0.5,
      currentLocation: 'Gurugram',
      skills,
      hrStatus: status,
      overallScore: score,
      alignmentLabel: score === null ? null : score >= 90 ? 'Excellent Alignment' : 'Strong Alignment',
      source: 'MANUAL_SINGLE',
      outlookMessageId: `${PREFIX}-msg-${jobId}-${index}`,
      outlookAttachmentId: `${PREFIX}-att-${jobId}-${index}`,
      resumeHash: `${PREFIX}-hash-${jobId}-${index}`,
      resumeFileName: `${name.replace(/\s+/g, '_')}.txt`,
      resumeMimeType: 'text/plain',
      resumeText: `Resume text for ${name}`
    }
  });
  created.candidateIds.push(candidate.id);
  return candidate;
};

const setup = async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { passwordHash: await hashPassword(TEST_PASSWORD), isActive: true },
    create: { email: TEST_EMAIL, passwordHash: await hashPassword(TEST_PASSWORD), name: 'Portal Tester', role: 'ADMIN' }
  });
  created.userIds.push(user.id);

  const login = await request('POST', '/auth/login', { body: { email: TEST_EMAIL, password: TEST_PASSWORD } });
  cookie = login.setCookie.split(';')[0];

  const makeJob = async (title, requiredSkills) => {
    const job = await prisma.job.create({
      data: {
        title,
        jdFileName: `${title}.txt`,
        jdMimeType: 'text/plain',
        jdText: `Job description for ${title}`,
        requiredSkills,
        preferredSkills: [],
        roleKeywords: [],
        minimumExperience: 2,
        preferredEducation: []
      }
    });
    created.jobIds.push(job.id);
    return job;
  };

  // Test 1: two distinct jobs.
  const reactJob = await makeJob(`${PREFIX} React Developer`, ['React', 'TypeScript']);
  const dataJob = await makeJob(`${PREFIX} Data Analyst`, ['SQL', 'Python']);
  const emptyJob = await makeJob(`${PREFIX} Empty Role`, ['Go']);

  // Test 2 & 3: React gets 10 candidates topping out at 91; Data gets 5 topping
  // out at 94. React's best must be 91, never 94.
  const reactScores = [91, 86, 72, 84, 68, 55, 90, 47, 80, null];
  for (let i = 0; i < reactScores.length; i++) {
    await makeCandidate(reactJob.id, i, {
      name: `React Candidate ${i + 1}`,
      score: reactScores[i],
      status: i === 0 ? 'SHORTLISTED' : i === 1 ? 'NEEDS_REVIEW' : 'REVIEW',
      skills: ['React', 'TypeScript']
    });
  }

  const dataScores = [94, 81, 60, 45, 77];
  for (let i = 0; i < dataScores.length; i++) {
    await makeCandidate(dataJob.id, 100 + i, {
      name: `Data Candidate ${i + 1}`,
      score: dataScores[i],
      status: i === 0 ? 'SHORTLISTED' : 'REVIEW',
      skills: ['SQL', 'Python']
    });
  }

  return { reactJob, dataJob, emptyJob };
};

const teardown = async () => {
  await prisma.candidateActivity.deleteMany({ where: { candidateId: { in: created.candidateIds } } });
  await prisma.candidateNote.deleteMany({ where: { candidateId: { in: created.candidateIds } } });
  await prisma.candidate.deleteMany({ where: { jobId: { in: created.jobIds } } });
  await prisma.job.deleteMany({ where: { id: { in: created.jobIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
};

const run = async () => {
  const { reactJob, dataJob, emptyJob } = await setup();

  const findJob = (list, id) => list.find((j) => j.id === id);

  suite.group('Test 1 — both jobs appear in the portal');

  await testAsync('GET /jobs/summary lists every created job', async () => {
    const res = await request('GET', '/jobs/summary');
    assert.strictEqual(res.status, 200);
    for (const id of [reactJob.id, dataJob.id, emptyJob.id]) {
      assert.ok(findJob(res.body.data, id), `job ${id} missing from the portal`);
    }
  });

  await testAsync('GET /jobs returns the same aggregated payload', async () => {
    const res = await request('GET', '/jobs');
    assert.strictEqual(res.status, 200);
    const job = findJob(res.body.data, reactJob.id);
    assert.ok(job, 'react job present');
    assert.ok('strongMatchCount' in job && 'bestMatchScore' in job, 'aggregates included');
  });

  suite.group('Test 2 — candidate counts are per job, with no contamination');

  await testAsync('each job reports only its own candidate count', async () => {
    const { body } = await request('GET', '/jobs/summary');
    assert.strictEqual(findJob(body.data, reactJob.id).candidateCount, 10);
    assert.strictEqual(findJob(body.data, dataJob.id).candidateCount, 5);
    assert.strictEqual(findJob(body.data, emptyJob.id).candidateCount, 0);
  });

  suite.group('Test 3 — best match score is scoped to the job');

  await testAsync("React's best score is 91, not the Data Analyst's 94", async () => {
    const { body } = await request('GET', '/jobs/summary');
    assert.strictEqual(findJob(body.data, reactJob.id).bestMatchScore, 91, 'React best must be its own maximum');
    assert.strictEqual(findJob(body.data, dataJob.id).bestMatchScore, 94);
    assert.strictEqual(findJob(body.data, emptyJob.id).bestMatchScore, null, 'no candidates means no best score');
  });

  suite.group('Test 4 — the job candidate list is isolated');

  await testAsync('the job-scoped list returns only that job’s candidates', async () => {
    const res = await request('GET', `/jobs/${reactJob.id}/candidates?limit=100`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.length, 10);
    assert.ok(
      res.body.data.every((c) => c.jobId === reactJob.id),
      'every row belongs to the requested job'
    );
    assert.ok(
      res.body.data.every((c) => c.name.startsWith('React Candidate')),
      'no Data Analyst candidate leaked in'
    );
  });

  await testAsync('a jobId query parameter cannot widen the job-scoped route', async () => {
    // The route's job must win over any query string attempt to change scope.
    const res = await request('GET', `/jobs/${reactJob.id}/candidates?jobId=${dataJob.id}&limit=100`);
    assert.strictEqual(res.status, 200);
    assert.ok(
      res.body.data.every((c) => c.jobId === reactJob.id),
      'scope stayed on the route job'
    );
  });

  suite.group('Tests 5 & 6 — dashboard metrics follow the selected job');

  await testAsync('scoping the dashboard to React returns React-only metrics', async () => {
    const res = await request('GET', `/dashboard/overview?jobId=${reactJob.id}`);
    assert.strictEqual(res.status, 200);
    const { scope, metrics } = res.body.data;
    assert.strictEqual(scope.type, 'JOB');
    assert.strictEqual(scope.jobId, reactJob.id);
    assert.strictEqual(metrics.totalCandidates, 10);
    assert.strictEqual(metrics.shortlisted, 1);
    assert.strictEqual(metrics.needsReview, 1);
    assert.strictEqual(metrics.bestMatchScore, 91);
  });

  await testAsync('scoping the dashboard to Data Analyst returns different figures', async () => {
    const { body } = await request('GET', `/dashboard/overview?jobId=${dataJob.id}`);
    assert.strictEqual(body.data.metrics.totalCandidates, 5);
    assert.strictEqual(body.data.metrics.bestMatchScore, 94);
    assert.strictEqual(body.data.metrics.shortlisted, 1);
  });

  await testAsync('the unscoped dashboard totals cover every job', async () => {
    const scoped = await request('GET', `/dashboard/overview?jobId=${reactJob.id}`);
    const global = await request('GET', '/dashboard/overview');
    assert.strictEqual(global.body.data.scope.type, 'ALL_JOBS');
    assert.ok(
      global.body.data.metrics.totalCandidates >= scoped.body.data.metrics.totalCandidates + 5,
      `global (${global.body.data.metrics.totalCandidates}) must include both jobs`
    );
  });

  await testAsync('an unknown job on the dashboard returns 404', async () => {
    const res = await request('GET', '/dashboard/overview?jobId=11111111-1111-1111-1111-111111111111');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.code, 'JOB_NOT_FOUND');
  });

  suite.group('Test 9 — strong match uses the shared threshold');

  await testAsync(`strong matches count candidates at ${STRONG_MATCH_MIN}% or above`, async () => {
    // React scores at or above 80: 91, 86, 84, 90, 80 = 5
    const { body } = await request('GET', '/jobs/summary');
    assert.strictEqual(findJob(body.data, reactJob.id).strongMatchCount, 5);
    // Data scores at or above 80: 94, 81 = 2
    assert.strictEqual(findJob(body.data, dataJob.id).strongMatchCount, 2);
  });

  await testAsync('the dashboard and the portal agree on the strong-match count', async () => {
    const dashboard = await request('GET', `/dashboard/overview?jobId=${reactJob.id}`);
    const portal = await request('GET', '/jobs/summary');
    assert.strictEqual(
      dashboard.body.data.metrics.strongMatch,
      findJob(portal.body.data, reactJob.id).strongMatchCount,
      'one definition, one number'
    );
  });

  await testAsync('the threshold is reported so the UI can label it', async () => {
    const { body } = await request('GET', '/jobs/summary');
    assert.strictEqual(body.meta.strongMatchThreshold, STRONG_MATCH_MIN);
  });

  suite.group('Test 10 — shortlisted counts use hrStatus');

  await testAsync('shortlisted counts match the SHORTLISTED status', async () => {
    const { body } = await request('GET', '/jobs/summary');
    assert.strictEqual(findJob(body.data, reactJob.id).shortlistedCount, 1);

    const stored = await prisma.candidate.count({ where: { jobId: reactJob.id, hrStatus: 'SHORTLISTED' } });
    assert.strictEqual(findJob(body.data, reactJob.id).shortlistedCount, stored);
  });

  await testAsync('needs-review and pending-review counts are distinct', async () => {
    const { body } = await request('GET', '/jobs/summary');
    const job = findJob(body.data, reactJob.id);
    assert.strictEqual(job.needsReviewCount, 1, 'only NEEDS_REVIEW');
    assert.strictEqual(job.pendingReviewCount, 9, 'REVIEW plus NEEDS_REVIEW');
  });

  suite.group('Test 11 — a job with no candidates behaves correctly');

  await testAsync('an empty job reports zeros and a null best score', async () => {
    const { body } = await request('GET', '/jobs/summary');
    const job = findJob(body.data, emptyJob.id);
    assert.strictEqual(job.candidateCount, 0);
    assert.strictEqual(job.strongMatchCount, 0);
    assert.strictEqual(job.shortlistedCount, 0);
    assert.strictEqual(job.bestMatchScore, null);
    // `status` is the persisted lifecycle; the derived operational badge that
    // used to occupy this field is now reported as `processingStatus`.
    assert.strictEqual(job.status, 'OPEN');
    assert.strictEqual(job.processingStatus, 'NEW');
  });

  await testAsync('an empty job’s candidate list is an empty page, not an error', async () => {
    const res = await request('GET', `/jobs/${emptyJob.id}/candidates`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.data, []);
    assert.strictEqual(res.body.pagination.total, 0);
  });

  await testAsync('an empty job’s summary endpoint still returns its requirements', async () => {
    const res = await request('GET', `/jobs/${emptyJob.id}/summary`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.stats.candidateCount, 0);
    assert.deepStrictEqual(res.body.data.job.requiredSkills, ['Go']);
  });

  suite.group('Test 12 — job search');

  await testAsync('search matches a job title case-insensitively', async () => {
    for (const term of ['React Developer', 'react developer', 'REACT DEVELOPER']) {
      const res = await request('GET', `/jobs/summary?search=${encodeURIComponent(`${PREFIX} ${term}`)}`);
      assert.ok(
        findJob(res.body.data, reactJob.id),
        `"${term}" should find the react job`
      );
    }
  });

  await testAsync('search matches a required skill', async () => {
    const res = await request('GET', '/jobs/summary?search=SQL');
    assert.ok(findJob(res.body.data, dataJob.id), 'SQL should find the data analyst job');
    assert.ok(!findJob(res.body.data, reactJob.id), 'and not the react job');
  });

  await testAsync('a search with no matches returns an empty list', async () => {
    const res = await request('GET', '/jobs/summary?search=zzzznotarealskill');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.data, []);
  });

  suite.group('Test 13 — job sorting');

  await testAsync('sorting by most candidates puts the busiest job first', async () => {
    const { body } = await request('GET', `/jobs/summary?sort=candidates&search=${PREFIX}`);
    const ours = body.data.filter((j) => created.jobIds.includes(j.id));
    assert.strictEqual(ours[0].id, reactJob.id, 'React has 10 candidates');
    assert.strictEqual(ours[ours.length - 1].candidateCount, 0, 'the empty job sorts last');
  });

  await testAsync('sorting by best match ranks by the job’s top score', async () => {
    const { body } = await request('GET', `/jobs/summary?sort=best_match&search=${PREFIX}`);
    const ours = body.data.filter((j) => created.jobIds.includes(j.id));
    assert.strictEqual(ours[0].id, dataJob.id, 'Data Analyst tops out at 94');
    assert.strictEqual(ours[1].id, reactJob.id, 'React tops out at 91');
    assert.strictEqual(ours[ours.length - 1].bestMatchScore, null, 'unscored jobs sort last');
  });

  await testAsync('newest and oldest orderings are inverses', async () => {
    const newest = await request('GET', `/jobs/summary?sort=newest&search=${PREFIX}`);
    const oldest = await request('GET', `/jobs/summary?sort=oldest&search=${PREFIX}`);
    const newestIds = newest.body.data.filter((j) => created.jobIds.includes(j.id)).map((j) => j.id);
    const oldestIds = oldest.body.data.filter((j) => created.jobIds.includes(j.id)).map((j) => j.id);
    assert.deepStrictEqual(newestIds, [...oldestIds].reverse());
  });

  await testAsync('an unknown sort value falls back to newest instead of failing', async () => {
    const res = await request('GET', `/jobs/summary?sort=nonsense&search=${PREFIX}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.length >= 3);
  });

  suite.group('Test 14 — no N+1 request pattern');

  await testAsync('one request returns every job with its statistics', async () => {
    const res = await request('GET', '/jobs/summary');
    assert.strictEqual(res.status, 200);
    // A single response carries the counts for every job, so the client never
    // needs a follow-up request per card.
    for (const job of res.body.data) {
      for (const field of ['candidateCount', 'analyzedCount', 'strongMatchCount', 'shortlistedCount', 'bestMatchScore']) {
        assert.ok(field in job, `${field} present on every job`);
      }
    }
  });

  await testAsync('the dashboard overview reports hiring outcome alongside pipeline metrics', async () => {
    const { body } = await request('GET', '/dashboard/overview');
    const { metrics, recentHires } = body.data;

    // The per-job overview grid was removed from the dashboard; jobs are browsed
    // in the jobs portal. What the dashboard reports about jobs is the hiring
    // outcome, aggregated in the database.
    assert.strictEqual(body.data.jobsOverview, undefined, 'the jobs overview grid is no longer part of the dashboard');
    assert.ok(Number.isInteger(metrics.openJobs), 'active job count included');
    assert.ok(Number.isInteger(metrics.closedJobs), 'closed job count included');
    assert.ok(Number.isInteger(metrics.selectedCandidates), 'selected candidate count included');
    assert.ok(Array.isArray(recentHires), 'recent hires included');
  });

  suite.group('Test 15 — candidate ranking');

  await testAsync('the job candidate list defaults to highest score first', async () => {
    const res = await request('GET', `/jobs/${reactJob.id}/candidates?limit=100`);
    const scores = res.body.data.map((c) => c.matchAnalysis?.overallScore ?? null);
    const scored = scores.filter((s) => s !== null);

    assert.deepStrictEqual(scored, [...scored].sort((a, b) => b - a), `not descending: ${scores.join(', ')}`);
    assert.strictEqual(scored[0], 91, 'top candidate is the job’s best');
  });

  await testAsync('unscored candidates rank after scored ones rather than as zero', async () => {
    const res = await request('GET', `/jobs/${reactJob.id}/candidates?limit=100`);
    const scores = res.body.data.map((c) => c.matchAnalysis?.overallScore ?? null);
    assert.strictEqual(scores[scores.length - 1], null, 'the unscored candidate is last');
    assert.strictEqual(scores.filter((s) => s === null).length, 1);
  });

  await testAsync('the top-candidates list excludes unscored candidates', async () => {
    const { body } = await request('GET', `/dashboard/overview?jobId=${reactJob.id}`);
    assert.ok(body.data.topCandidates.length > 0, 'top candidates returned');
    assert.ok(
      body.data.topCandidates.every((c) => c.matchAnalysis && c.matchAnalysis.overallScore !== null),
      'every top candidate has a score'
    );
    assert.strictEqual(body.data.topCandidates[0].matchAnalysis.overallScore, 91);
  });

  await testAsync('score bands are scoped to the selected job', async () => {
    const { body } = await request('GET', `/dashboard/overview?jobId=${reactJob.id}`);
    const bands = body.data.scoreBands;
    const total = bands.reduce((sum, b) => sum + b.count, 0);
    assert.strictEqual(total, 9, 'nine scored React candidates across the bands');
    assert.strictEqual(bands.find((b) => b.key === 'excellent').count, 2, '91 and 90');
  });

  suite.group('Existing filters still apply within a job');

  await testAsync('a status filter narrows within the job scope', async () => {
    const res = await request('GET', `/jobs/${reactJob.id}/candidates?hrStatus=SHORTLISTED`);
    assert.strictEqual(res.body.data.length, 1);
    assert.ok(res.body.data.every((c) => c.jobId === reactJob.id));
  });

  await testAsync('a score filter narrows within the job scope', async () => {
    const res = await request('GET', `/jobs/${reactJob.id}/candidates?minScore=${STRONG_MATCH_MIN}&limit=100`);
    assert.strictEqual(res.body.data.length, 5);
    assert.ok(res.body.data.every((c) => c.matchAnalysis.overallScore >= STRONG_MATCH_MIN));
  });

  await testAsync('a search filter narrows within the job scope', async () => {
    const res = await request('GET', `/jobs/${reactJob.id}/candidates?search=React Candidate 1&limit=100`);
    assert.ok(res.body.data.length >= 1);
    assert.ok(res.body.data.every((c) => c.jobId === reactJob.id));
  });

  await testAsync('pagination works within the job scope', async () => {
    const first = await request('GET', `/jobs/${reactJob.id}/candidates?page=1&limit=4`);
    assert.strictEqual(first.body.data.length, 4);
    assert.strictEqual(first.body.pagination.total, 10);
    assert.strictEqual(first.body.pagination.totalPages, 3);
    assert.ok(first.body.data.every((c) => c.jobId === reactJob.id));
  });

  const { failed } = suite.summary();
  await teardown();
  process.exit(failed > 0 ? 1 : 0);
};

run().catch(async (error) => {
  console.error('\n  SUITE ERROR:', error.message);
  console.error(error.stack);
  try {
    await teardown();
  } catch {
    /* best effort */
  }
  process.exit(1);
});
