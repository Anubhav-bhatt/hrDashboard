/**
 * Job closure, final candidate selection and closed-job search integration tests.
 *
 * Covers the closure lifecycle (shortlist -> select -> close), the protections a
 * closed job gains, the closed-jobs history listing, and the Active/Closed
 * search and filtering added to the jobs portal.
 *
 *   npm run test:closure
 *
 * The suite creates its own jobs, candidates and recruiter account and removes
 * them afterwards. Where a metric is workspace-wide (dashboard KPIs), it asserts
 * the delta it caused rather than an absolute total, because the database it
 * runs against also holds real data.
 */
require('dotenv').config();
const http = require('http');
const { randomUUID } = require('crypto');
const { createSuite, assert } = require('./harness');

const prisma = require('../config/prisma');
const app = require('../server');
const { hashPassword } = require('../services/authService');
const { closeJob } = require('../services/jobClosureService');

const suite = createSuite('Job closure & final candidate selection');
const { testAsync } = suite;

const PREFIX = 'closuretest';
const TEST_EMAIL = `${PREFIX}.recruiter@example.invalid`;
const TEST_PASSWORD = 'ClosureTest123!';

let server;
let baseUrl;
let cookie = '';
const created = { userIds: [], jobIds: [], candidateIds: [] };

const request = async (method, path, { body, form = null, raw = false } = {}) => {
  const options = { method, headers: {} };
  if (cookie) options.headers.Cookie = cookie;
  if (form) {
    options.body = form;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${path}`, options);
  if (raw) return { status: response.status, headers: response.headers };

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { parseError: true };
  }
  return { status: response.status, body: json, setCookie: response.headers.get('set-cookie') };
};

let candidateSeq = 0;

const makeCandidate = async (jobId, { name, score = null, status = 'REVIEW', role = 'Engineer' }) => {
  const index = candidateSeq++;
  const candidate = await prisma.candidate.create({
    data: {
      jobId,
      name,
      email: `${PREFIX}.${index}@example.invalid`,
      currentRole: role,
      totalExperience: 3 + (index % 5) * 0.5,
      currentLocation: 'Pune',
      skills: ['React'],
      hrStatus: status,
      overallScore: score,
      source: 'MANUAL_SINGLE',
      outlookMessageId: `${PREFIX}-msg-${index}`,
      outlookAttachmentId: `${PREFIX}-att-${index}`,
      resumeHash: `${PREFIX}-hash-${index}`,
      resumeFileName: 'resume.txt',
      resumeMimeType: 'text/plain',
      resumeText: `Resume text for ${name}`
    }
  });
  created.candidateIds.push(candidate.id);
  return candidate;
};

let jobSeq = 0;
const makeJob = async (title, requiredSkills = ['React']) => {
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
      preferredEducation: [],
      // Spread creation times so "newest" ordering is deterministic.
      createdAt: new Date(Date.now() - (100 - jobSeq++) * 60000)
    }
  });
  created.jobIds.push(job.id);
  return job;
};

const setup = async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { passwordHash: await hashPassword(TEST_PASSWORD), isActive: true },
    create: { email: TEST_EMAIL, passwordHash: await hashPassword(TEST_PASSWORD), name: 'Closure Tester', role: 'ADMIN' }
  });
  created.userIds.push(user.id);

  const login = await request('POST', '/auth/login', { body: { email: TEST_EMAIL, password: TEST_PASSWORD } });
  cookie = login.setCookie.split(';')[0];
};

const teardown = async () => {
  // Jobs point at their selected candidate, so clear that reference before the
  // candidate rows go.
  await prisma.job
    .updateMany({ where: { id: { in: created.jobIds } }, data: { selectedCandidateId: null } })
    .catch(() => {});
  await prisma.candidateActivity.deleteMany({ where: { candidateId: { in: created.candidateIds } } }).catch(() => {});
  await prisma.candidate.deleteMany({ where: { id: { in: created.candidateIds } } }).catch(() => {});
  await prisma.job.deleteMany({ where: { id: { in: created.jobIds } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
};

const run = async () => {
  await setup();

  // ---------------------------------------------------------------- Test 72
  await testAsync('Test 72: a job with no shortlisted candidate cannot be closed', async () => {
    const job = await makeJob(`${PREFIX} No Shortlist Role`);
    const candidate = await makeCandidate(job.id, { name: 'Unshortlisted Person', score: 88, status: 'REVIEW' });

    const shortlist = await request('GET', `/jobs/${job.id}/shortlist`);
    assert.strictEqual(shortlist.status, 200);
    assert.strictEqual(shortlist.body.data.length, 0, 'no candidate should be eligible');
    assert.strictEqual(shortlist.body.meta.canClose, false, 'UI must render Close Job disabled');

    const res = await request('POST', `/jobs/${job.id}/close`, { body: { selectedCandidateId: candidate.id } });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'CANDIDATE_NOT_SHORTLISTED');

    const after = await prisma.job.findUnique({ where: { id: job.id } });
    assert.strictEqual(after.status, 'OPEN', 'job must remain open');
    assert.strictEqual(after.selectedCandidateId, null);
  });

  await testAsync('closing without a selected candidate is rejected by the backend', async () => {
    const job = await makeJob(`${PREFIX} Missing Selection Role`);
    await makeCandidate(job.id, { name: 'Shortlisted Person', score: 80, status: 'SHORTLISTED' });

    const res = await request('POST', `/jobs/${job.id}/close`, { body: {} });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'SELECTED_CANDIDATE_REQUIRED');

    const after = await prisma.job.findUnique({ where: { id: job.id } });
    assert.strictEqual(after.status, 'OPEN');
  });

  // ---------------------------------------------------------------- Test 73
  let singleJob;
  await testAsync('Test 73: closing with one shortlisted candidate selects them and closes the job', async () => {
    singleJob = await makeJob(`${PREFIX} Single Shortlist Role`);
    const hire = await makeCandidate(singleJob.id, { name: 'Solo Hire', score: 87, status: 'SHORTLISTED' });

    const res = await request('POST', `/jobs/${singleJob.id}/close`, { body: { selectedCandidateId: hire.id } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.status, 'CLOSED');

    const job = await prisma.job.findUnique({ where: { id: singleJob.id } });
    const candidate = await prisma.candidate.findUnique({ where: { id: hire.id } });

    assert.strictEqual(job.status, 'CLOSED');
    assert.strictEqual(job.selectedCandidateId, hire.id, 'selectedCandidateId must be stored on the job');
    assert.ok(job.closedAt instanceof Date, 'closedAt must be set');
    assert.ok(job.closedByUserId, 'the recruiter who closed it must be recorded');
    assert.strictEqual(candidate.hrStatus, 'SELECTED');
    assert.ok(candidate.selectedAt instanceof Date, 'selectedAt must be set');
  });

  await testAsync('Test 23: closure writes CANDIDATE_SELECTED and JOB_CLOSED activity', async () => {
    const activities = await prisma.candidateActivity.findMany({
      where: { candidateId: (await prisma.job.findUnique({ where: { id: singleJob.id } })).selectedCandidateId }
    });
    const types = activities.map((a) => a.type);
    assert.ok(types.includes('CANDIDATE_SELECTED'), 'CANDIDATE_SELECTED must be recorded');
    assert.ok(types.includes('JOB_CLOSED'), 'JOB_CLOSED must be recorded');
  });

  // ------------------------------------------------------------ Tests 74, 75
  let multiJob;
  let priya;
  let rahul;
  let amit;
  await testAsync('Tests 74 & 75: HR picks a lower-scoring candidate; the others stay shortlisted', async () => {
    multiJob = await makeJob(`${PREFIX} Multi Shortlist Role`);
    rahul = await makeCandidate(multiJob.id, { name: 'Rahul Higher Score', score: 94, status: 'SHORTLISTED' });
    priya = await makeCandidate(multiJob.id, { name: 'Priya Chosen', score: 90, status: 'SHORTLISTED' });
    amit = await makeCandidate(multiJob.id, { name: 'Amit Third', score: 88, status: 'SHORTLISTED' });

    // Deliberately not the highest scorer: score is decision support only.
    const res = await request('POST', `/jobs/${multiJob.id}/close`, { body: { selectedCandidateId: priya.id } });
    assert.strictEqual(res.status, 200);

    const [p, r, a] = await Promise.all([
      prisma.candidate.findUnique({ where: { id: priya.id } }),
      prisma.candidate.findUnique({ where: { id: rahul.id } }),
      prisma.candidate.findUnique({ where: { id: amit.id } })
    ]);

    assert.strictEqual(p.hrStatus, 'SELECTED', 'the chosen candidate is selected');
    assert.strictEqual(r.hrStatus, 'SHORTLISTED', 'a higher score must not override the recruiter');
    assert.strictEqual(a.hrStatus, 'SHORTLISTED', 'other shortlisted candidates keep their status');

    const job = await prisma.job.findUnique({ where: { id: multiJob.id } });
    assert.strictEqual(job.selectedCandidateId, priya.id);
  });

  // ---------------------------------------------------------------- Test 76
  await testAsync('Test 76: a candidate from another job cannot be selected', async () => {
    const jobA = await makeJob(`${PREFIX} Scope Job A`);
    const jobB = await makeJob(`${PREFIX} Scope Job B`);
    await makeCandidate(jobA.id, { name: 'A Shortlisted', score: 85, status: 'SHORTLISTED' });
    const foreign = await makeCandidate(jobB.id, { name: 'B Shortlisted', score: 92, status: 'SHORTLISTED' });

    const res = await request('POST', `/jobs/${jobA.id}/close`, { body: { selectedCandidateId: foreign.id } });
    assert.strictEqual(res.status, 404, 'must not confirm the candidate exists in another job');
    assert.strictEqual(res.body.code, 'CANDIDATE_NOT_IN_JOB');

    const [a, b, candidate] = await Promise.all([
      prisma.job.findUnique({ where: { id: jobA.id } }),
      prisma.job.findUnique({ where: { id: jobB.id } }),
      prisma.candidate.findUnique({ where: { id: foreign.id } })
    ]);
    assert.strictEqual(a.status, 'OPEN', 'no state may change');
    assert.strictEqual(b.status, 'OPEN');
    assert.strictEqual(candidate.hrStatus, 'SHORTLISTED');
  });

  // ---------------------------------------------------------------- Test 77
  await testAsync('Test 77: a failure mid-closure rolls back completely', async () => {
    const job = await makeJob(`${PREFIX} Rollback Role`);
    const hire = await makeCandidate(job.id, { name: 'Rollback Candidate', score: 91, status: 'SHORTLISTED' });

    // A non-existent actor violates the closedByUserId foreign key, so the
    // failure happens after the job and candidate rows have been written inside
    // the transaction — exactly the partial-state case that must not survive.
    let threw = false;
    try {
      await closeJob({ jobId: job.id, selectedCandidateId: hire.id, actor: { id: randomUUID(), name: 'Ghost' } });
    } catch {
      threw = true;
    }
    assert.ok(threw, 'the closure must fail');

    const [afterJob, afterCandidate, activities] = await Promise.all([
      prisma.job.findUnique({ where: { id: job.id } }),
      prisma.candidate.findUnique({ where: { id: hire.id } }),
      prisma.candidateActivity.count({ where: { candidateId: hire.id } })
    ]);

    assert.strictEqual(afterJob.status, 'OPEN', 'job must remain OPEN');
    assert.strictEqual(afterJob.selectedCandidateId, null);
    assert.strictEqual(afterJob.closedAt, null);
    assert.strictEqual(afterCandidate.hrStatus, 'SHORTLISTED', 'candidate must remain SHORTLISTED');
    assert.strictEqual(afterCandidate.selectedAt, null);
    assert.strictEqual(activities, 0, 'no activity may survive a rolled-back closure');
  });

  // ---------------------------------------------------------------- Test 78
  await testAsync('Test 78: closing an already-closed job returns 409 and changes nothing', async () => {
    const before = await prisma.job.findUnique({ where: { id: multiJob.id } });
    const activityBefore = await prisma.candidateActivity.count({ where: { candidateId: priya.id } });

    // Re-submitting with a different candidate must not overwrite the recorded hire.
    const res = await request('POST', `/jobs/${multiJob.id}/close`, { body: { selectedCandidateId: rahul.id } });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'JOB_ALREADY_CLOSED');

    const after = await prisma.job.findUnique({ where: { id: multiJob.id } });
    const activityAfter = await prisma.candidateActivity.count({ where: { candidateId: priya.id } });

    assert.strictEqual(after.selectedCandidateId, before.selectedCandidateId, 'the hire must not be overwritten');
    assert.strictEqual(after.closedAt.getTime(), before.closedAt.getTime());
    assert.strictEqual(activityAfter, activityBefore, 'no duplicate activity');

    const stillShortlisted = await prisma.candidate.findUnique({ where: { id: rahul.id } });
    assert.strictEqual(stillShortlisted.hrStatus, 'SHORTLISTED');
  });

  // ---------------------------------------------------------------- Test 79
  await testAsync('Test 79: a closed job leaves the open portal and appears under closed', async () => {
    const open = await request('GET', `/jobs?status=OPEN&search=${PREFIX}&limit=100`);
    const closed = await request('GET', `/jobs?status=CLOSED&search=${PREFIX}&limit=100`);

    const openIds = open.body.data.map((j) => j.id);
    const closedIds = closed.body.data.map((j) => j.id);

    assert.ok(!openIds.includes(multiJob.id), 'closed job must not appear among open jobs');
    assert.ok(closedIds.includes(multiJob.id), 'closed job must appear in closed jobs');
    assert.ok(closed.body.data.every((j) => j.status === 'CLOSED'));
  });

  // ------------------------------------------------------------ Tests 80, 35
  await testAsync('Test 80: the closed job payload carries its selected candidate', async () => {
    const res = await request('GET', `/jobs?status=CLOSED&search=${PREFIX} Multi&limit=100`);
    const card = res.body.data.find((j) => j.id === multiJob.id);

    assert.ok(card, 'the closed job must be listed');
    assert.strictEqual(card.status, 'CLOSED');
    assert.ok(card.closedAt, 'closed date is shown on the card');
    assert.ok(card.selectedCandidate, 'selected candidate must be embedded');
    assert.strictEqual(card.selectedCandidate.id, priya.id);
    assert.strictEqual(card.selectedCandidate.name, 'Priya Chosen');
    assert.strictEqual(card.selectedCandidate.overallScore, 90);
    assert.strictEqual(card.candidateCount, 3, 'total candidates stay visible');
    assert.strictEqual(card.shortlistedCount, 2, 'the two who stayed shortlisted');

    // Projection check: a card must not carry resume-sized fields.
    assert.strictEqual(card.selectedCandidate.resumeText, undefined);
    assert.strictEqual(card.selectedCandidate.parsedProfile, undefined);
  });

  // ---------------------------------------------------------------- Test 81
  await testAsync('Test 81: a closed job keeps its candidate ranking and shows SELECTED', async () => {
    const res = await request('GET', `/jobs/${multiJob.id}/candidates?limit=100`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.length, 3, 'history remains fully readable');

    const chosen = res.body.data.find((c) => c.id === priya.id);
    assert.strictEqual(chosen.hrStatus, 'SELECTED');
    assert.strictEqual(chosen.isSelected, true);
    assert.ok(chosen.selectedAt, 'selection date is exposed');
  });

  // -------------------------------------------------------- Tests 82, 83, 84
  await testAsync('Test 82: a closed job rejects single resume upload', async () => {
    const form = new FormData();
    form.append('resume', new Blob(['resume text'], { type: 'text/plain' }), 'candidate.txt');
    const res = await request('POST', `/jobs/${multiJob.id}/candidates/upload`, { form });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'JOB_CLOSED');
  });

  await testAsync('Test 83: a closed job rejects bulk resume upload', async () => {
    const form = new FormData();
    form.append('resumes', new Blob(['one'], { type: 'text/plain' }), 'one.txt');
    form.append('resumes', new Blob(['two'], { type: 'text/plain' }), 'two.txt');
    const res = await request('POST', `/jobs/${multiJob.id}/candidates/bulk-upload`, { form });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'JOB_CLOSED');
  });

  await testAsync('Test 84: a closed job rejects Outlook/EML application import', async () => {
    const res = await request('POST', `/jobs/${multiJob.id}/candidates/process`, {
      body: { applications: [{ messageId: 'x', attachmentId: 'y' }] }
    });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'JOB_CLOSED');
  });

  await testAsync('Test 43: a closed job rejects re-analysis', async () => {
    const res = await request('POST', `/jobs/${multiJob.id}/candidates/analyze-all`, { body: {} });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'JOB_CLOSED');
  });

  await testAsync('an open job still accepts imports and analysis', async () => {
    const openJob = await makeJob(`${PREFIX} Still Open Role`);
    const res = await request('POST', `/jobs/${openJob.id}/candidates/process`, { body: { applications: [] } });
    assert.notStrictEqual(res.status, 409, 'open jobs must be unaffected by the closed-job rule');
  });

  // ---------------------------------------------------------------- Test 85
  /*
   * A closed job's statuses are read-only, and that is now enforced at the route
   * rather than per candidate.
   *
   * These two tests previously asserted the controller's narrower rules —
   * CANDIDATE_ALREADY_SELECTED for the hire, VALIDATION_ERROR for assigning
   * SELECTED directly. Both still exist, but on a closed job the lifecycle guard
   * refuses first, because the old rules protected only the hired candidate and
   * left everyone else on a filled role re-classifiable after the fact.
   */
  await testAsync('Test 85: no candidate status on a closed job can be changed', async () => {
    for (const target of ['REVIEW', 'SHORTLISTED', 'NOT_SUITABLE']) {
      const res = await request('PATCH', `/jobs/${multiJob.id}/candidates/${priya.id}/status`, {
        body: { status: target }
      });
      assert.strictEqual(res.status, 409, `${target} must be refused`);
      assert.strictEqual(res.body.code, 'JOB_CLOSED');
      // The reason has to fit the route: a recruiter changing a status should
      // not be told that imports are disabled.
      assert.ok(/hiring history/i.test(res.body.message), res.body.message);
    }

    const still = await prisma.candidate.findUnique({ where: { id: priya.id } });
    assert.strictEqual(still.hrStatus, 'SELECTED');

    // Not just the hire — everyone on the closed role.
    const other = await request('PATCH', `/jobs/${multiJob.id}/candidates/${rahul.id}/status`, {
      body: { status: 'NOT_SUITABLE' }
    });
    assert.strictEqual(other.status, 409, 'a non-hired candidate is equally frozen');
    const unchangedOther = await prisma.candidate.findUnique({ where: { id: rahul.id } });
    assert.notStrictEqual(unchangedOther.hrStatus, 'NOT_SUITABLE');
  });

  await testAsync('SELECTED cannot be assigned directly on an OPEN job either', async () => {
    /*
     * The rule that matters for an open role: selection happens by closing the
     * job, never by writing the status. Asserted on an open job because that is
     * now the only place the controller's own validation is reachable — on a
     * closed one the lifecycle guard answers first.
     */
    const openJob = await makeJob(`${PREFIX} Direct Selection Role`);
    const candidate = await makeCandidate(openJob.id, { name: 'Direct Select Person', score: 91, status: 'SHORTLISTED' });

    const res = await request('PATCH', `/jobs/${openJob.id}/candidates/${candidate.id}/status`, {
      body: { status: 'SELECTED' }
    });
    assert.strictEqual(res.status, 400, 'selection must go through job closure');
    assert.strictEqual(res.body.code, 'VALIDATION_ERROR');

    const still = await prisma.candidate.findUnique({ where: { id: candidate.id } });
    assert.strictEqual(still.hrStatus, 'SHORTLISTED', 'nothing was written');
  });

  // ------------------------------------------------------------ Tests 86, 87
  await testAsync('Tests 86 & 87: dashboard reports hiring KPIs and recent hires in order', async () => {
    const res = await request('GET', '/dashboard/overview');
    assert.strictEqual(res.status, 200);

    const { metrics, recentHires } = res.body.data;
    assert.ok(Number.isInteger(metrics.openJobs), 'openJobs must be a backend aggregate');
    assert.ok(Number.isInteger(metrics.closedJobs));
    assert.ok(Number.isInteger(metrics.selectedCandidates));

    const dbOpen = await prisma.job.count({ where: { status: 'OPEN' } });
    const dbClosed = await prisma.job.count({ where: { status: 'CLOSED' } });
    const dbSelected = await prisma.candidate.count({ where: { hrStatus: 'SELECTED' } });
    assert.strictEqual(metrics.openJobs, dbOpen, 'openJobs must equal COUNT(status=OPEN)');
    assert.strictEqual(metrics.closedJobs, dbClosed);
    assert.strictEqual(metrics.selectedCandidates, dbSelected);

    assert.ok(Array.isArray(recentHires));
    assert.ok(recentHires.length <= 5, 'recent hires is capped');
    for (let i = 1; i < recentHires.length; i++) {
      assert.ok(
        new Date(recentHires[i - 1].closedAt) >= new Date(recentHires[i].closedAt),
        'recent hires must be ordered most recently closed first'
      );
    }
    const mine = recentHires.find((h) => h.jobId === multiJob.id);
    if (mine) {
      assert.strictEqual(mine.candidateName, 'Priya Chosen');
      assert.strictEqual(mine.candidateId, priya.id);
    }
  });

  await testAsync('a single-job dashboard stays focused and omits workspace hiring totals', async () => {
    const res = await request('GET', `/dashboard/overview?jobId=${multiJob.id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.metrics.openJobs, null);
    assert.strictEqual(res.body.data.recentHires.length, 0);
  });

  // ------------------------------------------------------------ Tests 88, 89
  await testAsync('Test 88: closed jobs are searchable by job title', async () => {
    const res = await request('GET', `/jobs?status=CLOSED&search=${PREFIX} Multi&limit=100`);
    assert.ok(res.body.data.length >= 1);
    assert.ok(res.body.data.every((j) => j.status === 'CLOSED'));
    assert.ok(res.body.data.some((j) => j.id === multiJob.id));
  });

  await testAsync('Test 89: closed jobs are searchable by selected candidate name', async () => {
    const res = await request('GET', '/jobs?status=CLOSED&search=Priya Chosen&limit=100');
    assert.ok(res.body.data.some((j) => j.id === multiJob.id), 'searching the hire finds their job');

    const partial = await request('GET', '/jobs?status=CLOSED&search=priya&limit=100');
    assert.ok(partial.body.data.some((j) => j.id === multiJob.id), 'candidate search is case-insensitive');
  });

  // ---------------------------------------------------------------- Test 90
  await testAsync('Test 90: closed jobs sort by recently closed, oldest closed, best match and title', async () => {
    const recent = await request('GET', `/jobs?status=CLOSED&sort=recently_closed&search=${PREFIX}&limit=100`);
    const closedAts = recent.body.data.map((j) => new Date(j.closedAt).getTime());
    for (let i = 1; i < closedAts.length; i++) {
      assert.ok(closedAts[i - 1] >= closedAts[i], 'recently closed is newest first');
    }

    const oldest = await request('GET', `/jobs?status=CLOSED&sort=oldest_closed&search=${PREFIX}&limit=100`);
    const oldestAts = oldest.body.data.map((j) => new Date(j.closedAt).getTime());
    for (let i = 1; i < oldestAts.length; i++) {
      assert.ok(oldestAts[i - 1] <= oldestAts[i], 'oldest closed is oldest first');
    }

    const byTitle = await request('GET', `/jobs?status=CLOSED&sort=title&search=${PREFIX}&limit=100`);
    const titles = byTitle.body.data.map((j) => j.title);
    assert.deepStrictEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)), 'title sort is alphabetical');

    const byMatch = await request('GET', `/jobs?status=CLOSED&sort=best_match&search=${PREFIX}&limit=100`);
    const scores = byMatch.body.data.map((j) => j.bestMatchScore).filter((s) => s !== null);
    for (let i = 1; i < scores.length; i++) {
      assert.ok(scores[i - 1] >= scores[i], 'best match is highest first');
    }
  });

  // ---------------------------------------------------------------- Test 91
  await testAsync('Test 91: the jobs listing paginates', async () => {
    const first = await request('GET', `/jobs?search=${PREFIX}&sort=newest&page=1&limit=3`);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.body.data.length, 3);
    assert.strictEqual(first.body.meta.pagination.page, 1);
    assert.ok(first.body.meta.pagination.total >= 8);
    assert.ok(first.body.meta.pagination.totalPages >= 3);

    const second = await request('GET', `/jobs?search=${PREFIX}&sort=newest&page=2&limit=3`);
    const firstIds = first.body.data.map((j) => j.id);
    const secondIds = second.body.data.map((j) => j.id);
    assert.ok(!secondIds.some((id) => firstIds.includes(id)), 'pages must not overlap');
  });

  await testAsync('pagination also holds for aggregate sorts', async () => {
    const first = await request('GET', `/jobs?search=${PREFIX}&sort=candidates&page=1&limit=3`);
    const second = await request('GET', `/jobs?search=${PREFIX}&sort=candidates&page=2&limit=3`);
    const firstIds = first.body.data.map((j) => j.id);
    const secondIds = second.body.data.map((j) => j.id);
    assert.strictEqual(first.body.data.length, 3);
    assert.ok(!secondIds.some((id) => firstIds.includes(id)), 'aggregate-sorted pages must not overlap');
  });

  // ---------------------------------------------------------------- Test 92
  /*
   * This previously asserted that a hire shows up in the global candidate list
   * under hrStatus=SELECTED. The archive lifecycle deliberately reverses that:
   * closing a job moves its entire candidate pool — the hire included — out of
   * the active workspace, and history is reached one closed job at a time.
   *
   * The filter is in fact structurally empty on the active scope, not merely
   * empty today: SELECTED is only ever written by closing a job, and closing a
   * job sets it CLOSED. Asserting that keeps the two halves of the lifecycle
   * honest — Test 81 above proves the same records are still fully readable
   * through the closed job itself.
   */
  await testAsync('Test 92: closing a job takes its candidates out of the active list', async () => {
    const res = await request('GET', '/candidates?hrStatus=SELECTED&limit=100');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.length, 0, 'a hire always belongs to a closed job, so it is never active');
    assert.strictEqual(res.body.pagination.total, 0);

    const everyone = await request('GET', '/candidates?limit=200');
    assert.strictEqual(everyone.status, 200);
    assert.ok(
      !everyone.body.data.some((c) => c.id === priya.id),
      'the hire is gone from the active pool entirely, not just from the SELECTED filter'
    );

    // The whole cycle leaves, not only the person who was hired.
    const poolIds = (await prisma.candidate.findMany({ where: { jobId: multiJob.id }, select: { id: true } })).map((c) => c.id);
    assert.ok(poolIds.length >= 3, 'the closed role still has its pool in the database');
    assert.ok(
      !everyone.body.data.some((c) => poolIds.includes(c.id)),
      'no candidate of a closed role appears in the active list'
    );

    // Nothing was deleted — closing is an archive, and the rows are still there.
    const stillStored = await prisma.candidate.count({ where: { jobId: multiJob.id } });
    assert.strictEqual(stillStored, poolIds.length, 'closing preserves every candidate record');
  });

  await testAsync('the job-scoped candidate list also filters by SELECTED', async () => {
    const res = await request('GET', `/jobs/${multiJob.id}/candidates?hrStatus=SELECTED&limit=100`);
    assert.strictEqual(res.body.data.length, 1);
    assert.strictEqual(res.body.data[0].id, priya.id);
  });

  // ================================================================
  //  Job search + Active/Closed status filtering
  // ================================================================

  let searchOpen;
  let searchClosed;
  await testAsync('Search Tests 1-3: All / Active / Closed narrow the same search correctly', async () => {
    searchOpen = await makeJob(`${PREFIX} Searchable Developer Alpha`, ['React', 'TypeScript']);
    searchClosed = await makeJob(`${PREFIX} Searchable Developer Beta`, ['Node.js']);
    const hire = await makeCandidate(searchClosed.id, { name: 'Beta Hire', score: 89, status: 'SHORTLISTED' });
    await request('POST', `/jobs/${searchClosed.id}/close`, { body: { selectedCandidateId: hire.id } });

    const all = await request('GET', `/jobs?search=${PREFIX} Searchable Developer&limit=100`);
    const allIds = all.body.data.map((j) => j.id);
    assert.ok(allIds.includes(searchOpen.id), 'All includes the active job');
    assert.ok(allIds.includes(searchClosed.id), 'All includes the closed job');

    const active = await request('GET', `/jobs?search=${PREFIX} Searchable Developer&status=OPEN&limit=100`);
    const activeIds = active.body.data.map((j) => j.id);
    assert.ok(activeIds.includes(searchOpen.id));
    assert.ok(!activeIds.includes(searchClosed.id), 'Active excludes closed jobs');

    const closed = await request('GET', `/jobs?search=${PREFIX} Searchable Developer&status=CLOSED&limit=100`);
    const closedIds = closed.body.data.map((j) => j.id);
    assert.ok(closedIds.includes(searchClosed.id));
    assert.ok(!closedIds.includes(searchOpen.id), 'Closed excludes active jobs');
  });

  await testAsync('Search Test 6/7: exact and partial titles match case-insensitively', async () => {
    const exact = await request('GET', `/jobs?search=${PREFIX} Searchable Developer Alpha&limit=100`);
    assert.ok(exact.body.data.some((j) => j.id === searchOpen.id), 'exact title matches');

    const partial = await request('GET', '/jobs?search=SEARCHABLE developer alpha&limit=100');
    assert.ok(partial.body.data.some((j) => j.id === searchOpen.id), 'partial, mixed-case title matches');
  });

  await testAsync('Search Test 8: jobs are searchable by required skill', async () => {
    const res = await request('GET', '/jobs?search=typescript&limit=100');
    assert.ok(res.body.data.some((j) => j.id === searchOpen.id), 'a lowercase skill term matches');
  });

  await testAsync('Search Test 10/11: search combines with sort and pagination', async () => {
    const sorted = await request('GET', `/jobs?search=${PREFIX} Searchable&sort=title&limit=100`);
    const titles = sorted.body.data.map((j) => j.title);
    assert.deepStrictEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)));
    assert.ok(sorted.body.data.every((j) => j.title.includes('Searchable')), 'sort must not widen the search');

    const paged = await request('GET', `/jobs?search=${PREFIX} Searchable&sort=title&page=1&limit=1`);
    assert.strictEqual(paged.body.data.length, 1);
    assert.strictEqual(paged.body.meta.pagination.total, 2, 'total reflects the search, not the whole table');
  });

  await testAsync('Search Test 6: status counts are real backend aggregates', async () => {
    const res = await request('GET', `/jobs?search=${PREFIX} Searchable Developer&limit=100`);
    const { statusCounts } = res.body.meta;

    assert.strictEqual(statusCounts.all, 2, 'counts reflect the current search term');
    assert.strictEqual(statusCounts.open, 1);
    assert.strictEqual(statusCounts.closed, 1);
    assert.strictEqual(statusCounts.all, statusCounts.open + statusCounts.closed);

    // The counts must ignore the active status filter so the other tab still
    // shows how many jobs it holds.
    const filtered = await request('GET', `/jobs?search=${PREFIX} Searchable Developer&status=OPEN&limit=100`);
    assert.strictEqual(filtered.body.meta.statusCounts.closed, 1, 'closed count survives an Active filter');
    assert.strictEqual(filtered.body.data.length, 1, 'but the results themselves are filtered');
  });

  await testAsync('Search Test 16: a search matching nothing returns an empty, well-formed result', async () => {
    const res = await request('GET', '/jobs?search=Machine Learning Architect That Does Not Exist&limit=100');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.data, []);
    assert.strictEqual(res.body.meta.pagination.total, 0);
    assert.strictEqual(res.body.meta.statusCounts.all, 0);
  });

  await testAsync('an unknown status value is ignored rather than returning nothing', async () => {
    const res = await request('GET', `/jobs?search=${PREFIX} Searchable Developer&status=BANANA&limit=100`);
    assert.strictEqual(res.body.data.length, 2, 'an unrecognised filter falls back to All');
  });

  // ------------------------------------------------------------- Regression
  await testAsync('Regression: an open job is unaffected by closure features', async () => {
    const res = await request('GET', `/jobs/${searchOpen.id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.status, 'OPEN');
    assert.strictEqual(res.body.data.isClosed, false);
    assert.strictEqual(res.body.data.selectedCandidate, null);
    assert.strictEqual(res.body.data.canClose, false, 'no shortlist yet');
    assert.ok(res.body.data.metrics.processingStatus, 'the processing badge is still derived');
  });

  await testAsync('Regression: unauthenticated closure is refused', async () => {
    const saved = cookie;
    cookie = '';
    const res = await request('POST', `/jobs/${searchOpen.id}/close`, { body: { selectedCandidateId: priya.id } });
    cookie = saved;
    assert.strictEqual(res.status, 401, 'closure requires authentication');
  });

  await testAsync('Regression: closing an unknown job returns a safe 404', async () => {
    const res = await request('POST', `/jobs/${randomUUID()}/close`, { body: { selectedCandidateId: priya.id } });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.code, 'JOB_NOT_FOUND');
    assert.ok(!JSON.stringify(res.body).toLowerCase().includes('prisma'), 'no internals may leak');
    assert.strictEqual(res.body.stack, undefined);
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
