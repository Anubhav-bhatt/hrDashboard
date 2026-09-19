/**
 * Workspace isolation.
 *
 * Public signup is only safe if one account cannot reach another's recruitment
 * data. This suite creates two workspaces and then attacks the second from the
 * first's session — through the listings, through direct id guessing, through
 * the aggregate figures, through the mailbox connection and through the AI tool
 * layer.
 *
 *   npm run test:isolation
 *
 * Every probe asserts the *negative*: that nothing of the other workspace is
 * visible. The positive control at the end asserts the owner can still see their
 * own records, so a suite that passed by scoping everything to nothing would
 * fail here.
 */
require('dotenv').config();

// Set before the app is required: limiters read their budgets once, at load.
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.SIGNUP_RATE_LIMIT = '1000';
process.env.REFRESH_RATE_LIMIT = '1000';
process.env.API_RATE_LIMIT = '10000';

const http = require('http');
const crypto = require('crypto');
const { createSuite, assert } = require('./harness');

const prisma = require('../config/prisma');
const app = require('../server');
const { executeTool } = require('../ai/tools/toolRegistry');

const suite = createSuite('Workspace isolation between accounts');
const { testAsync } = suite;

const TEST_PREFIX = 'isolation';
const PASSWORD = 'IsolationTest12345!';
const TRUSTED_ORIGIN = 'http://127.0.0.1:5173';

let server;
let baseUrl;

/** Everything created here, for teardown. */
const created = { userIds: [], workspaceIds: [], jobIds: [] };

/* ------------------------------------------------------------- helpers ---- */

const request = async (method, path, { body, cookie, origin = TRUSTED_ORIGIN } = {}) => {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (cookie) options.headers.Cookie = cookie;
  if (origin) options.headers.Origin = origin;

  const response = await fetch(`${baseUrl}${path}`, options);
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, body: json, setCookies };
};

/** Creates an account through the real signup endpoint and returns its session. */
const signUp = async (label) => {
  const email = `${TEST_PREFIX}.${label}.${crypto.randomUUID().slice(0, 8)}@example.invalid`;
  const res = await request('POST', '/auth/signup', {
    body: { name: `Isolation ${label}`, email, password: PASSWORD }
  });
  assert.strictEqual(res.status, 201, `signup for ${label} succeeds`);

  const cookie = res.setCookies
    .filter((c) => c.startsWith('hr_access=') || c.startsWith('hr_refresh='))
    .map((c) => c.split(';')[0])
    .join('; ');

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: true }
  });
  created.userIds.push(user.id);
  const workspaceId = user.memberships[0].workspaceId;
  created.workspaceIds.push(workspaceId);

  return { email, cookie, userId: user.id, workspaceId };
};

/** A job with one candidate, planted directly so the test controls the ids. */
const plantJob = async (workspaceId, marker) => {
  const job = await prisma.job.create({
    data: {
      workspaceId,
      title: `${TEST_PREFIX} ${marker} Role`,
      jdFileName: `${marker}.txt`,
      jdMimeType: 'text/plain',
      jdText: 'React and TypeScript.',
      requiredSkills: ['React'],
      preferredSkills: [],
      roleKeywords: [],
      preferredEducation: [],
      minimumExperience: 1
    }
  });
  created.jobIds.push(job.id);

  const candidate = await prisma.candidate.create({
    data: {
      jobId: job.id,
      name: `${marker} Candidate`,
      email: `${marker}.candidate@example.invalid`,
      currentLocation: `${marker}ville`,
      qualification: `${marker}-degree`,
      skills: [`${marker}Skill`],
      hrStatus: 'SHORTLISTED',
      overallScore: 91,
      source: 'MANUAL',
      outlookMessageId: crypto.randomUUID(),
      outlookAttachmentId: crypto.randomUUID(),
      resumeFileName: 'r.txt',
      resumeMimeType: 'text/plain',
      resumeText: `${marker} resume text`
    }
  });

  return { job, candidate };
};

/* --------------------------------------------------------------- setup ---- */

const setup = async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
};

const teardown = async () => {
  await prisma.candidateActivity.deleteMany({ where: { candidate: { jobId: { in: created.jobIds } } } });
  await prisma.candidateNote.deleteMany({ where: { candidate: { jobId: { in: created.jobIds } } } });
  await prisma.candidate.deleteMany({ where: { jobId: { in: created.jobIds } } });
  await prisma.job.deleteMany({ where: { id: { in: created.jobIds } } });
  await prisma.outlookConnection.deleteMany({ where: { workspaceId: { in: created.workspaceIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.workspaceMember.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: created.workspaceIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
};

/* ---------------------------------------------------------------- tests --- */

const run = async () => {
  await setup();

  const alice = await signUp('alice');
  const bob = await signUp('bob');

  const aliceData = await plantJob(alice.workspaceId, 'Alpha');
  const bobData = await plantJob(bob.workspaceId, 'Beta');

  /* ------------------------------------------------ signup shape ------- */

  suite.group('Signup creates an isolated workspace');

  await testAsync('each account gets its own workspace', async () => {
    assert.ok(alice.workspaceId, 'alice has a workspace');
    assert.ok(bob.workspaceId, 'bob has a workspace');
    assert.notStrictEqual(alice.workspaceId, bob.workspaceId, 'the two workspaces are different');
  });

  await testAsync('the creator owns their workspace and nobody else is in it', async () => {
    const members = await prisma.workspaceMember.findMany({ where: { workspaceId: alice.workspaceId } });
    assert.strictEqual(members.length, 1, 'exactly one member');
    assert.strictEqual(members[0].userId, alice.userId);
    assert.strictEqual(members[0].role, 'OWNER');
  });

  await testAsync('a new account is not added to the pre-existing workspace', async () => {
    const legacy = await prisma.workspaceMember.findFirst({
      where: { userId: alice.userId, workspaceId: '00000000-0000-4000-8000-000000000001' }
    });
    assert.strictEqual(legacy, null, 'signup never joins the inherited workspace');
  });

  await testAsync('signup refuses to grant a role from the request body', async () => {
    const email = `${TEST_PREFIX}.escalate.${crypto.randomUUID().slice(0, 8)}@example.invalid`;
    const res = await request('POST', '/auth/signup', {
      body: { name: 'Escalation Attempt', email, password: PASSWORD, role: 'ADMIN', isActive: true }
    });
    assert.strictEqual(res.status, 201);

    const user = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
    created.userIds.push(user.id);
    created.workspaceIds.push(user.memberships[0].workspaceId);
    assert.strictEqual(user.role, 'RECRUITER', 'the supplied role is ignored entirely');
  });

  /* ------------------------------------------------- listings ---------- */

  suite.group('Listings show only the caller workspace');

  await testAsync('GET /jobs excludes the other workspace', async () => {
    const res = await request('GET', '/jobs', { cookie: bob.cookie });
    assert.strictEqual(res.status, 200);
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes(aliceData.job.id), 'no trace of the other job id');
    assert.ok(!serialized.includes('Alpha Role'), 'no trace of the other job title');
  });

  await testAsync('GET /jobs/summary excludes the other workspace', async () => {
    const res = await request('GET', '/jobs/summary', { cookie: bob.cookie });
    assert.strictEqual(res.status, 200);
    assert.ok(!JSON.stringify(res.body).includes(aliceData.job.id));
  });

  await testAsync('GET /candidates excludes the other workspace', async () => {
    const res = await request('GET', '/candidates', { cookie: bob.cookie });
    assert.strictEqual(res.status, 200);
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes(aliceData.candidate.id), 'no trace of the other candidate id');
    assert.ok(!serialized.includes('Alpha Candidate'), 'no trace of the other candidate name');
  });

  await testAsync('candidate filter facets do not leak the other pool', async () => {
    const res = await request('GET', '/candidates/filters', { cookie: bob.cookie });
    assert.strictEqual(res.status, 200);
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('AlphaSkill'), 'skills stay within the workspace');
    assert.ok(!serialized.includes('Alphaville'), 'locations stay within the workspace');
  });

  /* ------------------------------------------------- id guessing ------- */

  suite.group('Guessing an id from another workspace');

  const guesses = [
    ['GET', () => `/jobs/${aliceData.job.id}`],
    ['GET', () => `/jobs/${aliceData.job.id}/summary`],
    ['GET', () => `/jobs/${aliceData.job.id}/candidates`],
    ['GET', () => `/jobs/${aliceData.job.id}/shortlist`],
    ['GET', () => `/jobs/${aliceData.job.id}/candidates/${aliceData.candidate.id}`],
    ['GET', () => `/jobs/${aliceData.job.id}/candidates/${aliceData.candidate.id}/resume`],
    ['GET', () => `/candidates/${aliceData.candidate.id}`]
  ];

  for (const [method, path] of guesses) {
    await testAsync(`${method} ${path().replace(/[0-9a-f-]{36}/g, ':id')} is refused`, async () => {
      const res = await request(method, path(), { cookie: bob.cookie });
      assert.strictEqual(res.status, 404, `expected 404, got ${res.status}`);
      const serialized = JSON.stringify(res.body || {});
      assert.ok(!serialized.includes('Alpha'), 'the refusal reveals nothing about the record');
    });
  }

  await testAsync('a refusal does not confirm the id exists', async () => {
    const real = await request('GET', `/jobs/${aliceData.job.id}`, { cookie: bob.cookie });
    const invented = await request('GET', `/jobs/${crypto.randomUUID()}`, { cookie: bob.cookie });
    assert.strictEqual(real.status, invented.status, 'a real id and an invented one answer alike');
    assert.strictEqual(real.body.code, invented.body.code, 'and with the same code');
  });

  /* ------------------------------------------------- writes ------------ */

  suite.group('Writing to another workspace');

  await testAsync('changing a candidate status in another workspace is refused', async () => {
    const res = await request('PATCH', `/jobs/${aliceData.job.id}/candidates/${aliceData.candidate.id}/status`, {
      cookie: bob.cookie,
      body: { status: 'NOT_SUITABLE' }
    });
    assert.strictEqual(res.status, 404);

    const after = await prisma.candidate.findUnique({ where: { id: aliceData.candidate.id } });
    assert.strictEqual(after.hrStatus, 'SHORTLISTED', 'the record is untouched');
  });

  await testAsync('adding a note to another workspace is refused', async () => {
    const res = await request('POST', `/jobs/${aliceData.job.id}/candidates/${aliceData.candidate.id}/notes`, {
      cookie: bob.cookie,
      body: { body: 'should never be written' }
    });
    assert.strictEqual(res.status, 404);

    const notes = await prisma.candidateNote.count({ where: { candidateId: aliceData.candidate.id } });
    assert.strictEqual(notes, 0, 'no note was written');
  });

  await testAsync('closing another workspace job is refused', async () => {
    const res = await request('POST', `/jobs/${aliceData.job.id}/close`, {
      cookie: bob.cookie,
      body: { selectedCandidateId: aliceData.candidate.id }
    });
    assert.strictEqual(res.status, 404);

    const after = await prisma.job.findUnique({ where: { id: aliceData.job.id } });
    assert.strictEqual(after.status, 'OPEN', 'the job is still open');
  });

  /* ------------------------------------------------- aggregates -------- */

  suite.group('Aggregate figures');

  await testAsync('the dashboard counts only the caller workspace', async () => {
    const res = await request('GET', '/dashboard/overview', { cookie: bob.cookie });
    assert.strictEqual(res.status, 200);

    const metrics = res.body.data.metrics;
    assert.strictEqual(metrics.totalCandidates, 1, 'sees its own single candidate');
    assert.strictEqual(metrics.totalJobs, 1, 'sees its own single job');
    assert.ok(!JSON.stringify(res.body).includes('Alpha'), 'no other-workspace record appears');
  });

  await testAsync('a fresh account with no data sees zeroes, not the database', async () => {
    const carol = await signUp('carol');
    const res = await request('GET', '/dashboard/overview', { cookie: carol.cookie });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.metrics.totalCandidates, 0);
    assert.strictEqual(res.body.data.metrics.totalJobs, 0);

    const jobs = await request('GET', '/jobs', { cookie: carol.cookie });
    assert.strictEqual(jobs.body.data.length, 0, 'an empty account really is empty');
  });

  /* ------------------------------------------------- mailbox ----------- */

  suite.group('Mailbox connection');

  await testAsync('another workspace mailbox is invisible', async () => {
    await prisma.outlookConnection.create({
      data: {
        workspaceId: alice.workspaceId,
        microsoftUserId: `${TEST_PREFIX}-${crypto.randomUUID()}`,
        email: 'alice.mailbox@example.invalid',
        accessToken: 'not-a-real-token'
      }
    });

    const res = await request('GET', '/outlook/status', { cookie: bob.cookie });
    assert.strictEqual(res.status, 200);
    assert.ok(!JSON.stringify(res.body).includes('alice.mailbox'), 'the other mailbox is not reported');
  });

  await testAsync('disconnecting does not reach another workspace mailbox', async () => {
    const res = await request('POST', '/outlook/disconnect', { cookie: bob.cookie });
    assert.strictEqual(res.status, 200);

    const stillThere = await prisma.outlookConnection.count({ where: { workspaceId: alice.workspaceId } });
    assert.strictEqual(stillThere, 1, "the other workspace's connection survives");
  });

  /* ------------------------------------------------- AI tools ---------- */

  suite.group('AI tool layer');

  const bobContext = {
    requestId: crypto.randomUUID(),
    userId: bob.userId,
    userRole: 'RECRUITER',
    workspaceId: bob.workspaceId
  };

  // executeTool answers with a failure envelope rather than throwing, so the
  // assertion is on the envelope. Checking for a throw would pass while the tool
  // quietly returned the record.
  await testAsync('getCandidate cannot read another workspace candidate', async () => {
    const result = await executeTool('getCandidate', { candidateId: aliceData.candidate.id }, bobContext);
    assert.strictEqual(result.success, false, 'the tool refuses');
    assert.ok(!JSON.stringify(result).includes('Alpha Candidate'), 'and reveals nothing');
  });

  await testAsync('getJob cannot read another workspace job', async () => {
    const result = await executeTool('getJob', { jobId: aliceData.job.id }, bobContext);
    assert.strictEqual(result.success, false, 'the tool refuses');
    assert.ok(!JSON.stringify(result).includes('Alpha Role'), 'and reveals nothing');
  });

  await testAsync('getJobs lists only the caller workspace', async () => {
    const result = await executeTool('getJobs', {}, bobContext);
    assert.ok(!JSON.stringify(result).includes(aliceData.job.id), 'no other-workspace job is listed');
  });

  await testAsync('searchCandidates cannot reach across workspaces', async () => {
    const result = await executeTool('searchCandidates', { query: 'Alpha' }, bobContext);
    assert.ok(!JSON.stringify(result).includes('Alpha Candidate'), 'a targeted search finds nothing');
  });

  await testAsync('a context with no workspace reads nothing rather than everything', async () => {
    const result = await executeTool('getJobs', {}, { ...bobContext, workspaceId: null });
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(aliceData.job.id), 'not the other workspace');
    assert.ok(!serialized.includes(bobData.job.id), 'and not its own either — it fails closed');
  });

  /* ------------------------------------------------- positive control -- */

  suite.group('The owner can still see their own work');

  await testAsync('the owner reads their own job and candidate', async () => {
    const job = await request('GET', `/jobs/${aliceData.job.id}`, { cookie: alice.cookie });
    assert.strictEqual(job.status, 200, 'the owner is not locked out by the scoping');

    const candidate = await request('GET', `/candidates/${aliceData.candidate.id}`, { cookie: alice.cookie });
    assert.strictEqual(candidate.status, 200);
    assert.strictEqual(candidate.body.data.personal.name, 'Alpha Candidate');
  });

  await testAsync('the owner dashboard counts their own records', async () => {
    const res = await request('GET', '/dashboard/overview', { cookie: alice.cookie });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.metrics.totalCandidates, 1);
  });

  const { failed } = suite.summary();
  await teardown();
  process.exit(failed > 0 ? 1 : 0);
};

run().catch(async (error) => {
  console.error('Isolation suite crashed:', error.message);
  try {
    await teardown();
  } catch {
    /* already torn down */
  }
  process.exit(1);
});
