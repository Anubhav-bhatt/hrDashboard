/**
 * API integration tests.
 *
 * Boots the real Express app in-process against the configured PostgreSQL
 * database, creates its own job and candidates, exercises every dashboard
 * endpoint including authentication and authorisation boundaries, then removes
 * the data it created.
 *
 *   npm run test:api
 */
require('dotenv').config();
const http = require('http');
const { createSuite, assert } = require('./harness');

const prisma = require('../config/prisma');
const app = require('../server');
const { hashPassword } = require('../services/authService');

const suite = createSuite('API integration tests');
const { testAsync } = suite;

const TEST_PREFIX = 'apitest';
const TEST_EMAIL = `${TEST_PREFIX}.recruiter@example.invalid`;
const TEST_PASSWORD = 'IntegrationTest123!';

let server;
let baseUrl;
let sessionCookie = '';
const created = { userIds: [], jobIds: [], candidateIds: [] };

/* ------------------------------------------------------------- helpers ---- */

/** Issues a request against the in-process server. */
const request = async (method, path, { body, cookie, raw = false, headers = {} } = {}) => {
  const options = {
    method,
    headers: { ...headers }
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (cookie) options.headers.Cookie = cookie;

  const response = await fetch(`${baseUrl}${path}`, options);
  const setCookie = response.headers.get('set-cookie');

  if (raw) {
    return {
      status: response.status,
      headers: response.headers,
      buffer: Buffer.from(await response.arrayBuffer()),
      setCookie
    };
  }

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { parseError: true, text: text.slice(0, 200) };
  }

  return { status: response.status, body: json, headers: response.headers, setCookie };
};

const authed = (method, path, options = {}) => request(method, path, { ...options, cookie: sessionCookie });

/* --------------------------------------------------------------- setup ---- */

const setup = async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { passwordHash: await hashPassword(TEST_PASSWORD), isActive: true },
    create: {
      email: TEST_EMAIL,
      passwordHash: await hashPassword(TEST_PASSWORD),
      name: 'Integration Recruiter',
      role: 'ADMIN'
    }
  });
  created.userIds.push(user.id);

  const job = await prisma.job.create({
    data: {
      title: `${TEST_PREFIX} React Developer`,
      jdFileName: 'integration-jd.txt',
      jdMimeType: 'text/plain',
      jdText: 'We need a React developer with TypeScript and Node.js experience. Minimum 2 years.',
      requiredSkills: ['React', 'TypeScript'],
      preferredSkills: ['Node.js'],
      roleKeywords: ['react developer'],
      minimumExperience: 2,
      maximumExperience: 8,
      preferredLocations: ['Gurugram'],
      qualifications: ['B.Tech'],
      preferredEducation: ['B.Tech']
    }
  });
  created.jobIds.push(job.id);

  const otherJob = await prisma.job.create({
    data: {
      title: `${TEST_PREFIX} Unrelated Role`,
      jdFileName: 'other-jd.txt',
      jdMimeType: 'text/plain',
      jdText: 'An unrelated role used to verify cross-job access is refused.',
      requiredSkills: ['Python'],
      preferredSkills: [],
      roleKeywords: [],
      minimumExperience: 0,
      preferredEducation: []
    }
  });
  created.jobIds.push(otherJob.id);

  const candidates = [
    {
      name: 'Integration Alpha',
      email: `${TEST_PREFIX}.alpha@example.invalid`,
      phone: '+919000000001',
      currentRole: 'Senior React Developer',
      headline: 'Senior React Developer',
      totalExperience: 4.5,
      currentLocation: 'Gurugram',
      qualification: 'B.Tech',
      skills: ['React', 'TypeScript', 'Node.js'],
      hrStatus: 'SHORTLISTED',
      overallScore: 92,
      alignmentLabel: 'Excellent Alignment',
      matchedSkills: ['React', 'TypeScript'],
      resumeData: Buffer.from('ALPHA RESUME CONTENT — integration test fixture.'),
      resumeSize: 47,
      resumeFileName: 'alpha.txt',
      resumeMimeType: 'text/plain',
      resumeText: 'ALPHA RESUME CONTENT — integration test fixture.'
    },
    {
      name: 'Integration Beta',
      email: `${TEST_PREFIX}.beta@example.invalid`,
      phone: '+919000000002',
      currentRole: 'Java Developer',
      totalExperience: 1,
      currentLocation: 'Pune',
      qualification: 'MCA',
      skills: ['Java', 'Spring Boot'],
      hrStatus: 'REVIEW',
      overallScore: 41,
      alignmentLabel: 'Low Alignment',
      matchedSkills: [],
      resumeFileName: 'beta.txt',
      resumeMimeType: 'text/plain',
      resumeText: 'BETA RESUME CONTENT'
    },
    {
      name: 'Integration Gamma',
      email: `${TEST_PREFIX}.gamma@example.invalid`,
      currentRole: 'React Developer',
      totalExperience: null,
      currentLocation: 'Bengaluru',
      skills: ['React'],
      hrStatus: 'NEEDS_REVIEW',
      overallScore: null,
      resumeFileName: 'gamma.txt',
      resumeMimeType: 'text/plain',
      resumeText: 'GAMMA RESUME CONTENT'
    }
  ];

  for (const [index, data] of candidates.entries()) {
    const candidate = await prisma.candidate.create({
      data: {
        jobId: job.id,
        source: 'MANUAL_SINGLE',
        outlookMessageId: `${TEST_PREFIX}-msg-${index}`,
        outlookAttachmentId: `${TEST_PREFIX}-att-${index}`,
        resumeHash: `${TEST_PREFIX}-hash-${index}`,
        ...data
      }
    });
    created.candidateIds.push(candidate.id);
  }

  return { job, otherJob };
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

/* ---------------------------------------------------------------- tests --- */

const run = async () => {
  const { job, otherJob } = await setup();
  const [alphaId, betaId, gammaId] = created.candidateIds;

  /* ---------------------------------------------------- health & auth ---- */

  suite.group('Health');

  await testAsync('GET /health responds without authentication', async () => {
    const res = await request('GET', '/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  await testAsync('GET /health/details reports database and process health', async () => {
    const res = await request('GET', '/health/details');
    assert.ok([200, 503].includes(res.status), `unexpected status ${res.status}`);
    assert.ok(res.body.services, 'services reported');
    assert.ok(res.body.process, 'process metrics reported');
    assert.strictEqual(typeof res.body.process.eventLoopDelayMs, 'number');
  });

  suite.group('Authentication');

  await testAsync('protected endpoints return 401 without a session', async () => {
    for (const path of ['/jobs', '/candidates', '/analytics/overview', '/outlook/status', `/candidates/${alphaId}`]) {
      const res = await request('GET', path);
      assert.strictEqual(res.status, 401, `${path} should require authentication`);
      assert.strictEqual(res.body.code, 'AUTH_REQUIRED');
    }
  });

  await testAsync('an unauthenticated candidate request leaks no personal data', async () => {
    const res = await request('GET', `/candidates/${alphaId}`);
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('Integration Alpha'), 'name must not appear');
    assert.ok(!serialized.includes('alpha@example.invalid'), 'email must not appear');
  });

  await testAsync('login rejects a missing body with 400', async () => {
    const res = await request('POST', '/auth/login', { body: {} });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
  });

  await testAsync('login rejects a wrong password with 401', async () => {
    const res = await request('POST', '/auth/login', { body: { email: TEST_EMAIL, password: 'wrong-password' } });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'INVALID_CREDENTIALS');
  });

  await testAsync('an unknown account returns the same response as a wrong password', async () => {
    const unknown = await request('POST', '/auth/login', {
      body: { email: 'no-such-user@example.invalid', password: 'whatever12345' }
    });
    assert.strictEqual(unknown.status, 401);
    assert.strictEqual(unknown.body.code, 'INVALID_CREDENTIALS', 'must not reveal that the account is unknown');
  });

  await testAsync('login succeeds and issues an httpOnly session cookie', async () => {
    const res = await request('POST', '/auth/login', { body: { email: TEST_EMAIL, password: TEST_PASSWORD } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.setCookie, 'a session cookie is set');
    assert.ok(/HttpOnly/i.test(res.setCookie), 'cookie is HttpOnly');
    assert.ok(/SameSite=Lax/i.test(res.setCookie), 'cookie is SameSite=Lax');
    assert.ok(!('passwordHash' in res.body.data.user), 'password hash is never returned');
    sessionCookie = res.setCookie.split(';')[0];
  });

  await testAsync('GET /auth/me returns the signed-in recruiter', async () => {
    const res = await authed('GET', '/auth/me');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.user.email, TEST_EMAIL);
  });

  await testAsync('a malformed session token is refused', async () => {
    const res = await request('GET', '/auth/me', { cookie: 'hr_session=not-a-real-token' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'INVALID_SESSION');
  });

  /* --------------------------------------------------------- analytics --- */

  suite.group('Dashboard analytics');

  await testAsync('GET /analytics/overview returns live metrics, pipeline and bands', async () => {
    const res = await authed('GET', '/analytics/overview');
    assert.strictEqual(res.status, 200);

    const { metrics, pipeline, scoreBands, trend, recentCandidates } = res.body.data;
    assert.ok(metrics.totalCandidates >= 3, `expected at least our 3 candidates, got ${metrics.totalCandidates}`);
    assert.ok(metrics.shortlisted >= 1, 'shortlisted count includes our fixture');
    assert.strictEqual(pipeline.length, 4, 'four pipeline stages');
    assert.strictEqual(scoreBands.length, 5, 'five score bands');
    assert.strictEqual(trend.length, 14, 'fourteen-day trend');
    assert.ok(Array.isArray(recentCandidates), 'recent candidates present');
  });

  await testAsync('every analytics metric is a number, never NaN', async () => {
    const { metrics } = (await authed('GET', '/analytics/overview')).body.data;
    for (const [key, value] of Object.entries(metrics)) {
      if (value === null) continue;
      assert.ok(typeof value === 'number' && !Number.isNaN(value), `${key} is not a valid number: ${value}`);
    }
  });

  await testAsync('pipeline stage counts sum to the candidate total', async () => {
    const { metrics, pipeline } = (await authed('GET', '/analytics/overview')).body.data;
    const sum = pipeline.reduce((total, stage) => total + stage.count, 0);
    assert.strictEqual(sum, metrics.totalCandidates, `pipeline sum ${sum} vs total ${metrics.totalCandidates}`);
  });

  /* ------------------------------------------------- candidate listing --- */

  suite.group('Candidate listing, filtering & pagination');

  await testAsync('job-scoped listing returns candidates with a pagination envelope', async () => {
    const res = await authed('GET', `/jobs/${job.id}/candidates`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.length, 3);
    assert.deepStrictEqual(Object.keys(res.body.pagination).sort(), [
      'hasNextPage',
      'hasPreviousPage',
      'limit',
      'page',
      'total',
      'totalPages'
    ]);
    assert.strictEqual(res.body.pagination.total, 3);
  });

  await testAsync('listing never includes resume bytes', async () => {
    const res = await authed('GET', `/jobs/${job.id}/candidates`);
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('resumeData'), 'resumeData must not be serialised');
    assert.ok(!serialized.includes('ALPHA RESUME CONTENT'), 'resume text must not appear in list rows');
  });

  await testAsync('pagination splits results and reports navigation state', async () => {
    const first = await authed('GET', `/jobs/${job.id}/candidates?page=1&limit=2&sort=name_asc`);
    assert.strictEqual(first.body.data.length, 2);
    assert.strictEqual(first.body.pagination.totalPages, 2);
    assert.strictEqual(first.body.pagination.hasNextPage, true);
    assert.strictEqual(first.body.pagination.hasPreviousPage, false);

    const second = await authed('GET', `/jobs/${job.id}/candidates?page=2&limit=2&sort=name_asc`);
    assert.strictEqual(second.body.data.length, 1);
    assert.strictEqual(second.body.pagination.hasNextPage, false);

    const firstIds = first.body.data.map((c) => c._id);
    assert.ok(!firstIds.includes(second.body.data[0]._id), 'pages do not overlap');
  });

  await testAsync('search matches a name case-insensitively', async () => {
    for (const term of ['alpha', 'ALPHA', 'Alpha']) {
      const res = await authed('GET', `/jobs/${job.id}/candidates?search=${term}`);
      assert.strictEqual(res.body.data.length, 1, `"${term}" should find one candidate`);
      assert.strictEqual(res.body.data[0].name, 'Integration Alpha');
    }
  });

  await testAsync('search matches an email address and a skill', async () => {
    const byEmail = await authed('GET', `/jobs/${job.id}/candidates?search=${TEST_PREFIX}.beta`);
    assert.strictEqual(byEmail.body.data.length, 1);

    const bySkill = await authed('GET', `/jobs/${job.id}/candidates?search=spring boot`);
    assert.strictEqual(bySkill.body.data.length, 1, 'skill search is case-insensitive');
    assert.strictEqual(bySkill.body.data[0].name, 'Integration Beta');
  });

  await testAsync('a search combined with a location filter applies BOTH conditions', async () => {
    // Regression: the location filter used to overwrite the search clause, so
    // this returned the Bengaluru candidate instead of nothing.
    const conflicting = await authed('GET', `/jobs/${job.id}/candidates?search=alpha&location=Bengaluru`);
    assert.strictEqual(conflicting.body.data.length, 0, 'contradictory filters must return nothing');

    const agreeing = await authed('GET', `/jobs/${job.id}/candidates?search=alpha&location=Gurugram`);
    assert.strictEqual(agreeing.body.data.length, 1, 'agreeing filters return the match');
    assert.strictEqual(agreeing.body.data[0].name, 'Integration Alpha');
  });

  await testAsync('a skill filter is case-insensitive and combines with a score filter', async () => {
    const lower = await authed('GET', `/jobs/${job.id}/candidates?skill=react`);
    assert.strictEqual(lower.body.data.length, 2, 'React matches two candidates');

    const combined = await authed('GET', `/jobs/${job.id}/candidates?skill=react&minScore=80`);
    assert.strictEqual(combined.body.data.length, 1, 'score narrows the skill match');
    assert.strictEqual(combined.body.data[0].name, 'Integration Alpha');
  });

  await testAsync('requiring two skills returns only candidates with both', async () => {
    const both = await authed('GET', `/jobs/${job.id}/candidates?skill=React&skill=TypeScript`);
    assert.strictEqual(both.body.data.length, 1);

    const impossible = await authed('GET', `/jobs/${job.id}/candidates?skill=React&skill=Spring Boot`);
    assert.strictEqual(impossible.body.data.length, 0);
  });

  await testAsync('status filters accept one or many values', async () => {
    const single = await authed('GET', `/jobs/${job.id}/candidates?hrStatus=SHORTLISTED`);
    assert.strictEqual(single.body.data.length, 1);

    const multiple = await authed('GET', `/jobs/${job.id}/candidates?hrStatus=REVIEW,NEEDS_REVIEW`);
    assert.strictEqual(multiple.body.data.length, 2);
  });

  await testAsync('experience filters include an unknown-experience option', async () => {
    const band = await authed('GET', `/jobs/${job.id}/candidates?experienceRange=4-6`);
    assert.strictEqual(band.body.data.length, 1);
    assert.strictEqual(band.body.data[0].name, 'Integration Alpha');

    const unknown = await authed('GET', `/jobs/${job.id}/candidates?experienceRange=unknown`);
    assert.strictEqual(unknown.body.data.length, 1);
    assert.strictEqual(unknown.body.data[0].name, 'Integration Gamma');
  });

  await testAsync('sorting orders by score and by name as requested', async () => {
    const desc = await authed('GET', `/jobs/${job.id}/candidates?sort=score_desc`);
    assert.strictEqual(desc.body.data[0].name, 'Integration Alpha', 'highest score first');

    const names = await authed('GET', `/jobs/${job.id}/candidates?sort=name_asc`);
    assert.deepStrictEqual(
      names.body.data.map((c) => c.name),
      ['Integration Alpha', 'Integration Beta', 'Integration Gamma']
    );
  });

  await testAsync('an unscored candidate sorts last rather than first', async () => {
    const res = await authed('GET', `/jobs/${job.id}/candidates?sort=score_desc`);
    assert.strictEqual(res.body.data[res.body.data.length - 1].name, 'Integration Gamma');
  });

  await testAsync('special characters and whitespace in search are handled safely', async () => {
    for (const term of ["%27%22--", "'%20OR%201%3D1", '%20%20%20', encodeURIComponent("'; DROP TABLE candidates;--")]) {
      const res = await authed('GET', `/jobs/${job.id}/candidates?search=${term}`);
      assert.strictEqual(res.status, 200, `search "${term}" should not error`);
      assert.ok(Array.isArray(res.body.data));
    }
    // Confirm the table still exists after the injection attempt.
    const after = await authed('GET', `/jobs/${job.id}/candidates`);
    assert.strictEqual(after.body.data.length, 3, 'data intact after injection attempts');
  });

  await testAsync('an over-large page limit is capped instead of honoured', async () => {
    const res = await authed('GET', `/jobs/${job.id}/candidates?limit=100000`);
    assert.strictEqual(res.body.pagination.limit, 100);
  });

  await testAsync('an unknown job returns 404 rather than an empty list', async () => {
    const res = await authed('GET', '/jobs/11111111-1111-1111-1111-111111111111/candidates');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.code, 'JOB_NOT_FOUND');
  });

  await testAsync('a malformed job id is rejected without a server error', async () => {
    const res = await authed('GET', '/jobs/not-a-uuid/candidates');
    assert.ok(res.status === 400 || res.status === 404, `expected 400/404, got ${res.status}`);
    assert.ok(res.status < 500, 'must not surface as a server error');
  });

  /* -------------------------------------------------- global listing ----- */

  suite.group('Cross-job candidate listing');

  await testAsync('GET /candidates spans jobs and includes status facets', async () => {
    const res = await authed('GET', `/candidates?search=Integration&limit=50`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.length >= 3);
    assert.ok(res.body.facets.statusCounts, 'status facets returned');
    assert.ok(res.body.data.every((c) => 'jobTitle' in c), 'each row names its job');
  });

  await testAsync('GET /candidates/filters returns only values present in the data', async () => {
    const res = await authed('GET', '/candidates/filters');
    assert.strictEqual(res.status, 200);
    const skills = res.body.data.skills.map((s) => s.value);
    assert.ok(skills.includes('React'), 'React is offered as a filter');
    assert.ok(res.body.data.skills.every((s) => typeof s.count === 'number'), 'each option carries a count');
  });

  await testAsync('a jobId filter narrows the global listing', async () => {
    const res = await authed('GET', `/candidates?jobId=${job.id}&limit=50`);
    assert.ok(res.body.data.every((c) => c.jobId === job.id), 'only candidates from the requested job');
  });

  /* --------------------------------------------------- candidate detail -- */

  suite.group('Candidate detail');

  await testAsync('GET /candidates/:id returns a fully structured profile', async () => {
    const res = await authed('GET', `/candidates/${alphaId}`);
    assert.strictEqual(res.status, 200);

    const data = res.body.data;
    for (const section of ['personal', 'professional', 'application', 'resume', 'parsing']) {
      assert.ok(data[section], `${section} section present`);
    }
    for (const collection of ['skills', 'experience', 'educationDetail', 'projectsDetail', 'certifications', 'languages', 'achievements', 'noteEntries', 'activities']) {
      assert.ok(Array.isArray(data[collection]), `${collection} is an array`);
    }
    assert.strictEqual(data.personal.name, 'Integration Alpha');
    assert.strictEqual(data.personal.email, `${TEST_PREFIX}.alpha@example.invalid`);
    assert.strictEqual(data.application.jobTitle, job.title);
  });

  await testAsync('the job-scoped detail route returns the same compatibility flags', async () => {
    const scoped = await authed('GET', `/jobs/${job.id}/candidates/${alphaId}`);
    assert.strictEqual(scoped.status, 200);
    // Regression: this route used to omit the job, returning all-null flags.
    assert.strictEqual(scoped.body.data.compatibilityFlags.experienceMatch, true);
    assert.strictEqual(scoped.body.data.compatibilityFlags.locationMatch, true);
  });

  await testAsync('an unknown candidate returns a 404 with a clear code', async () => {
    const res = await authed('GET', '/candidates/11111111-1111-1111-1111-111111111111');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.code, 'CANDIDATE_NOT_FOUND');
  });

  await testAsync('a malformed candidate id does not produce a server error', async () => {
    const res = await authed('GET', '/candidates/not-a-uuid');
    assert.ok(res.status < 500, `expected a client error, got ${res.status}`);
  });

  await testAsync('error responses never leak stack traces or file paths', async () => {
    const res = await authed('GET', '/candidates/not-a-uuid');
    const serialized = JSON.stringify(res.body);
    assert.ok(!/C:\\\\|\/home\/|at Object\./.test(serialized), `leaked internals: ${serialized.slice(0, 200)}`);
  });

  /* ------------------------------------------------------------ IDOR ----- */

  suite.group('Authorisation boundaries');

  await testAsync('reading a candidate through the wrong job returns 404', async () => {
    const res = await authed('GET', `/jobs/${otherJob.id}/candidates/${alphaId}`);
    assert.strictEqual(res.status, 404);
  });

  await testAsync('updating status through the wrong job is refused', async () => {
    // Regression: this used to update the candidate regardless of the job in the URL.
    const res = await authed('PATCH', `/jobs/${otherJob.id}/candidates/${alphaId}/status`, {
      body: { status: 'NOT_SUITABLE' }
    });
    assert.strictEqual(res.status, 404);

    const check = await prisma.candidate.findUnique({ where: { id: alphaId }, select: { hrStatus: true } });
    assert.strictEqual(check.hrStatus, 'SHORTLISTED', 'the record must be untouched');
  });

  await testAsync('updating notes through the wrong job is refused', async () => {
    const res = await authed('PATCH', `/jobs/${otherJob.id}/candidates/${alphaId}/notes`, {
      body: { notes: 'should not be stored' }
    });
    assert.strictEqual(res.status, 404);
  });

  await testAsync('streaming a resume through the wrong job is refused', async () => {
    const res = await authed('GET', `/jobs/${otherJob.id}/candidates/${alphaId}/resume`);
    assert.strictEqual(res.status, 404);
  });

  /* ----------------------------------------------------- status & notes -- */

  suite.group('Status updates and notes');

  await testAsync('an invalid status value is rejected with 400', async () => {
    const res = await authed('PATCH', `/jobs/${job.id}/candidates/${betaId}/status`, { body: { status: 'HIRED' } });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
  });

  await testAsync('a missing status value is rejected with 400', async () => {
    const res = await authed('PATCH', `/jobs/${job.id}/candidates/${betaId}/status`, { body: {} });
    assert.strictEqual(res.status, 400);
  });

  await testAsync('a valid status change persists and is recorded on the activity trail', async () => {
    const res = await authed('PATCH', `/jobs/${job.id}/candidates/${betaId}/status`, { body: { status: 'SHORTLISTED' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.hrStatus, 'SHORTLISTED');

    const stored = await prisma.candidate.findUnique({ where: { id: betaId }, select: { hrStatus: true } });
    assert.strictEqual(stored.hrStatus, 'SHORTLISTED', 'change survives a re-read');

    const activity = await prisma.candidateActivity.findFirst({
      where: { candidateId: betaId, type: 'STATUS_CHANGED' },
      orderBy: { createdAt: 'desc' }
    });
    assert.ok(activity, 'a STATUS_CHANGED entry was recorded');
    assert.ok(/REVIEW/.test(activity.description) && /SHORTLISTED/.test(activity.description), activity.description);
  });

  await testAsync('a status change to the same value is accepted without duplicating activity', async () => {
    const before = await prisma.candidateActivity.count({ where: { candidateId: betaId, type: 'STATUS_CHANGED' } });
    const res = await authed('PATCH', `/jobs/${job.id}/candidates/${betaId}/status`, { body: { status: 'SHORTLISTED' } });
    assert.strictEqual(res.status, 200);
    const after = await prisma.candidateActivity.count({ where: { candidateId: betaId, type: 'STATUS_CHANGED' } });
    assert.strictEqual(after, before, 'no redundant activity entry');
  });

  await testAsync('notes are saved and returned', async () => {
    const res = await authed('PATCH', `/jobs/${job.id}/candidates/${betaId}/notes`, {
      body: { notes: 'Strong communication; 30 day notice period.' }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.notes, 'Strong communication; 30 day notice period.');
  });

  await testAsync('an oversized note is rejected with 422 rather than stored', async () => {
    const res = await authed('PATCH', `/jobs/${job.id}/candidates/${betaId}/notes`, {
      body: { notes: 'x'.repeat(6000) }
    });
    assert.strictEqual(res.status, 422);

    const stored = await prisma.candidate.findUnique({ where: { id: betaId }, select: { notes: true } });
    assert.ok(stored.notes.length < 6000, 'the oversized note was not persisted');
  });

  await testAsync('a note is stored verbatim without executing markup', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const res = await authed('POST', `/jobs/${job.id}/candidates/${betaId}/notes`, { body: { body: payload } });
    assert.strictEqual(res.status, 201);
    // Stored as-is; the UI renders it as text, never as HTML.
    assert.strictEqual(res.body.data.body, payload);
  });

  await testAsync('an empty appended note is rejected', async () => {
    const res = await authed('POST', `/jobs/${job.id}/candidates/${betaId}/notes`, { body: { body: '   ' } });
    assert.strictEqual(res.status, 400);
  });

  await testAsync('appended notes appear on the candidate profile newest first', async () => {
    await authed('POST', `/jobs/${job.id}/candidates/${betaId}/notes`, { body: { body: 'Second note' } });
    const res = await authed('GET', `/candidates/${betaId}`);
    assert.ok(res.body.data.noteEntries.length >= 2, 'both notes present');
    assert.strictEqual(res.body.data.noteEntries[0].body, 'Second note', 'newest first');
    assert.strictEqual(res.body.data.noteEntries[0].authorName, 'Integration Recruiter', 'author recorded');
  });

  /* -------------------------------------------------- resume streaming --- */

  suite.group('Resume streaming');

  await testAsync('a stored resume is served with its real bytes', async () => {
    const res = await authed('GET', `/jobs/${job.id}/candidates/${alphaId}/resume`, { raw: true });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.buffer.toString(), 'ALPHA RESUME CONTENT — integration test fixture.');
    assert.ok(!/Mock Candidate Resume/i.test(res.buffer.toString()), 'never placeholder content');
  });

  await testAsync('resume responses carry safe content headers', async () => {
    const res = await authed('GET', `/jobs/${job.id}/candidates/${alphaId}/resume`, { raw: true });
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(/no-store/.test(res.headers.get('cache-control') || ''), 'not cached');
    assert.ok(/inline/.test(res.headers.get('content-disposition') || ''), 'inline by default');
  });

  await testAsync('download=1 switches the disposition to attachment', async () => {
    const res = await authed('GET', `/jobs/${job.id}/candidates/${alphaId}/resume?download=1`, { raw: true });
    assert.ok(/attachment/.test(res.headers.get('content-disposition') || ''));
  });

  await testAsync('a candidate without stored bytes returns 404 instead of fake content', async () => {
    const res = await authed('GET', `/jobs/${job.id}/candidates/${gammaId}/resume`);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.code, 'RESUME_NOT_STORED');
  });

  await testAsync('viewing a resume is recorded on the activity trail', async () => {
    const activity = await prisma.candidateActivity.findFirst({
      where: { candidateId: alphaId, type: 'RESUME_VIEWED' }
    });
    assert.ok(activity, 'RESUME_VIEWED recorded');
    assert.ok(!/ALPHA RESUME CONTENT/.test(JSON.stringify(activity)), 'resume content is never logged');
  });

  /* ------------------------------------------------------------- jobs ---- */

  suite.group('Jobs');

  await testAsync('GET /jobs lists jobs with candidate counts', async () => {
    const res = await authed('GET', '/jobs');
    assert.strictEqual(res.status, 200);
    const ours = res.body.data.find((j) => j._id === job.id);
    assert.ok(ours, 'our job is listed');
    assert.strictEqual(ours.candidatesCount, 3);
  });

  await testAsync('GET /jobs/:id returns requirements and score tiers', async () => {
    const res = await authed('GET', `/jobs/${job.id}`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.data.requirements.requiredSkills, ['React', 'TypeScript']);
    assert.ok(res.body.data.metrics.scoreTiers, 'score tiers present');
    assert.strictEqual(res.body.data.metrics.candidatesCount, 3);
  });

  await testAsync('an unknown job id returns 404', async () => {
    const res = await authed('GET', '/jobs/11111111-1111-1111-1111-111111111111');
    assert.strictEqual(res.status, 404);
  });

  await testAsync('creating a job without a title is rejected', async () => {
    const res = await authed('POST', '/jobs', { body: {} });
    assert.strictEqual(res.status, 400);
  });

  await testAsync('search criteria updates are validated', async () => {
    const badExp = await authed('PATCH', `/jobs/${job.id}/search-criteria`, {
      body: { minimumExperience: 8, maximumExperience: 2 }
    });
    assert.strictEqual(badExp.status, 400, 'max below min is rejected');

    const badSalary = await authed('PATCH', `/jobs/${job.id}/search-criteria`, { body: { salaryMin: -100 } });
    assert.strictEqual(badSalary.status, 400, 'negative salary is rejected');

    const negativeExp = await authed('PATCH', `/jobs/${job.id}/search-criteria`, { body: { minimumExperience: -3 } });
    assert.strictEqual(negativeExp.status, 400, 'negative experience is rejected');
  });

  await testAsync('a valid criteria update persists and deduplicates skills', async () => {
    const res = await authed('PATCH', `/jobs/${job.id}/search-criteria`, {
      body: { requiredSkills: ['React', 'react', 'TypeScript'], minimumExperience: 3 }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.requirements.requiredSkills.length, 2, 'case-duplicate removed');
    assert.strictEqual(res.body.data.requirements.minimumExperience, 3);
  });

  /* -------------------------------------------------------- scoring ------ */

  suite.group('Relevance scoring');

  await testAsync('a single candidate can be re-scored and the score persists', async () => {
    const res = await authed('POST', `/jobs/${job.id}/candidates/${gammaId}/analyze`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.matchAnalysis, 'analysis returned');

    const score = res.body.data.matchAnalysis.overallScore;
    assert.ok(score >= 0 && score <= 100, `score ${score} within 0-100`);

    const stored = await prisma.candidate.findUnique({ where: { id: gammaId }, select: { overallScore: true } });
    assert.strictEqual(stored.overallScore, score, 'score persisted');
  });

  await testAsync('scoring an unknown candidate returns 404', async () => {
    const res = await authed('POST', `/jobs/${job.id}/candidates/11111111-1111-1111-1111-111111111111/analyze`);
    assert.strictEqual(res.status, 404);
  });

  await testAsync('batch scoring reports how many candidates were processed', async () => {
    const res = await authed('POST', `/jobs/${job.id}/candidates/analyze-all`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.total, 3);
    assert.strictEqual(res.body.data.analyzed, 3);
    assert.strictEqual(res.body.data.failed, 0);
  });

  /* ------------------------------------------------------------ outlook -- */

  suite.group('Outlook integration');

  await testAsync('status reports a disconnected mailbox honestly', async () => {
    const res = await authed('GET', '/outlook/status');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(typeof res.body.data.connected, 'boolean');
  });

  await testAsync('folder listing refuses rather than inventing mailbox folders', async () => {
    const connection = await prisma.outlookConnection.findFirst();
    const res = await authed('GET', '/outlook/folders');
    if (connection) {
      assert.ok([200, 502].includes(res.status), `unexpected ${res.status} with a connection present`);
    } else {
      // Regression: this used to return fabricated folders for an unconnected mailbox.
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.code, 'OUTLOOK_NOT_CONNECTED');
    }
  });

  await testAsync('importing without a mailbox connection is refused', async () => {
    const connection = await prisma.outlookConnection.findFirst();
    const res = await authed('POST', `/jobs/${job.id}/candidates/process`, {
      body: { applications: [{ messageId: 'm1', attachmentId: 'a1' }] }
    });
    if (!connection) {
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.code, 'OUTLOOK_NOT_CONNECTED');
    } else {
      assert.ok(res.status < 500, `unexpected ${res.status}`);
    }
  });

  await testAsync('an empty application batch is rejected', async () => {
    const res = await authed('POST', `/jobs/${job.id}/candidates/process`, { body: { applications: [] } });
    assert.strictEqual(res.status, 400);
  });

  /* ------------------------------------------------------------ routing -- */

  suite.group('Routing and sign-out');

  await testAsync('an unknown API route returns a structured 404', async () => {
    const res = await authed('GET', '/definitely-not-a-route');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.code, 'ROUTE_NOT_FOUND');
  });

  await testAsync('malformed JSON is rejected with 400', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ this is not json'
    });
    assert.strictEqual(response.status, 400);
  });

  await testAsync('sign-out clears the session cookie', async () => {
    const res = await authed('POST', '/auth/logout');
    assert.strictEqual(res.status, 200);
    assert.ok(res.setCookie, 'a cookie-clearing header is sent');
    assert.ok(/hr_session=;|hr_session=(?=;)/.test(res.setCookie) || /Expires=Thu, 01 Jan 1970/i.test(res.setCookie), res.setCookie);
  });

  await testAsync('the cleared cookie no longer grants access', async () => {
    const res = await request('GET', '/candidates', { cookie: 'hr_session=' });
    assert.strictEqual(res.status, 401);
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
    /* teardown is best effort */
  }
  process.exit(1);
});
