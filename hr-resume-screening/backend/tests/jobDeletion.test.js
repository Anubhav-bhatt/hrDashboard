/**
 * Permanent deletion of a closed job.
 *
 *   npm run test:delete
 *
 * This is the only destructive operation in the application, so the suite is
 * written to prove both halves of it: that deletion really removes everything a
 * job owned, and that it refuses every case where it must.
 *
 * The fixture is tagged `e2edelete` and the suite creates and removes its own
 * jobs, candidates and accounts. Counts of unrelated data are captured before
 * the run and re-asserted afterwards, because this executes against a database
 * that also holds genuine records — a deletion test that cannot tell its own
 * blast radius from the surrounding data is not a safe test.
 */
require('dotenv').config();
const http = require('http');
const { createSuite, assert } = require('./harness');

const prisma = require('../config/prisma');
const app = require('../server');
const { hashPassword } = require('../services/authService');

const suite = createSuite('Permanent deletion of a closed job');
const { testAsync } = suite;

const PREFIX = 'e2edelete';
const ADMIN_EMAIL = `${PREFIX}.admin@example.invalid`;
const RECRUITER_EMAIL = `${PREFIX}.recruiter@example.invalid`;
const PASSWORD = 'DeleteTest123!';

let server;
let baseUrl;
let adminCookie = '';
let recruiterCookie = '';
const created = { userIds: [], jobIds: [], candidateIds: [] };

const request = async (method, path, { body, cookie = adminCookie } = {}) => {
  const options = { method, headers: {} };
  if (cookie) options.headers.Cookie = cookie;
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { parseError: true };
  }
  return { status: response.status, body: json, setCookie: response.headers.get('set-cookie') };
};

let seq = 0;

const makeJob = async (title) => {
  const job = await prisma.job.create({
    data: {
      title,
      jdFileName: `${title}.txt`,
      jdMimeType: 'text/plain',
      jdText: `Job description for ${title}`,
      requiredSkills: ['React'],
      preferredSkills: [],
      roleKeywords: [],
      minimumExperience: 2,
      preferredEducation: []
    }
  });
  created.jobIds.push(job.id);
  return job;
};

/**
 * A candidate with everything a real one carries: resume bytes, a note and an
 * activity row. Deleting a job has to take all of it, so the fixture has to
 * have all of it.
 */
const makeCandidate = async (jobId, { name, status = 'REVIEW', score = 80, source = 'MANUAL_SINGLE', bytes = 2048 }) => {
  const index = seq++;
  const candidate = await prisma.candidate.create({
    data: {
      jobId,
      name,
      email: `${PREFIX}.${index}@example.invalid`,
      currentRole: 'Engineer',
      totalExperience: 4,
      currentLocation: 'Pune',
      skills: ['React'],
      hrStatus: status,
      overallScore: score,
      source,
      outlookMessageId: `${PREFIX}-msg-${index}`,
      outlookAttachmentId: `${PREFIX}-att-${index}`,
      resumeHash: `${PREFIX}-hash-${index}`,
      resumeFileName: 'resume.pdf',
      resumeMimeType: 'application/pdf',
      resumeText: `Resume text for ${name}`,
      // Outlook-sourced candidates deliberately hold no bytes here; their
      // resumes are re-fetched from the mailbox, so there is no copy of ours.
      resumeData: source === 'OUTLOOK' ? null : Buffer.alloc(bytes, 1),
      resumeSize: source === 'OUTLOOK' ? null : bytes
    }
  });
  created.candidateIds.push(candidate.id);

  await prisma.candidateNote.create({
    data: { candidateId: candidate.id, authorName: 'Tester', body: `A note about ${name}.` }
  });
  await prisma.candidateActivity.create({
    data: { candidateId: candidate.id, actorName: 'Tester', type: 'IMPORTED', description: `${name} imported.` }
  });

  return candidate;
};

const setup = async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash: await hashPassword(PASSWORD), isActive: true, role: 'ADMIN' },
    create: { email: ADMIN_EMAIL, passwordHash: await hashPassword(PASSWORD), name: 'Delete Admin', role: 'ADMIN' }
  });
  created.userIds.push(admin.id);

  // A standard recruiter, to prove the destructive route is not open to one.
  const recruiter = await prisma.user.upsert({
    where: { email: RECRUITER_EMAIL },
    update: { passwordHash: await hashPassword(PASSWORD), isActive: true, role: 'RECRUITER' },
    create: {
      email: RECRUITER_EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      name: 'Delete Recruiter',
      role: 'RECRUITER'
    }
  });
  created.userIds.push(recruiter.id);

  const adminLogin = await request('POST', '/auth/login', { body: { email: ADMIN_EMAIL, password: PASSWORD }, cookie: '' });
  adminCookie = adminLogin.setCookie.split(';')[0];

  const recruiterLogin = await request('POST', '/auth/login', {
    body: { email: RECRUITER_EMAIL, password: PASSWORD },
    cookie: ''
  });
  recruiterCookie = recruiterLogin.setCookie.split(';')[0];
};

const teardown = async () => {
  await prisma.job
    .updateMany({ where: { id: { in: created.jobIds } }, data: { selectedCandidateId: null } })
    .catch(() => {});
  await prisma.candidateActivity.deleteMany({ where: { candidateId: { in: created.candidateIds } } }).catch(() => {});
  await prisma.candidateNote.deleteMany({ where: { candidateId: { in: created.candidateIds } } }).catch(() => {});
  await prisma.candidate.deleteMany({ where: { id: { in: created.candidateIds } } }).catch(() => {});
  await prisma.importSession.deleteMany({ where: { jobId: { in: created.jobIds } } }).catch(() => {});
  await prisma.job.deleteMany({ where: { id: { in: created.jobIds } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
};

/** Closes a job the way a recruiter does — through the real HTTP workflow. */
const closeThroughTheRealWorkflow = async (jobId, candidateId) => {
  const response = await request('POST', `/jobs/${jobId}/close`, { body: { selectedCandidateId: candidateId } });
  assert.strictEqual(response.status, 200, `closure should succeed: ${JSON.stringify(response.body)}`);
  return response;
};

const run = async () => {
  await setup();

  /* ------------------------------------------------- the surrounding world */

  // Everything not belonging to this suite. Re-checked after the deletion so a
  // regression that widened the blast radius fails loudly instead of quietly
  // destroying real records.
  const outsideJobs = await prisma.job.count();
  const outsideCandidates = await prisma.candidate.count();
  const outsideNotes = await prisma.candidateNote.count();
  const outsideActivities = await prisma.candidateActivity.count();

  suite.group('Refusing what must be refused');

  // ------------------------------------------------------------------ open
  await testAsync('an OPEN job cannot be permanently deleted', async () => {
    const job = await makeJob(`${PREFIX} Open Role`);
    await makeCandidate(job.id, { name: 'Open Role Person', status: 'SHORTLISTED' });

    const response = await request('DELETE', `/jobs/${job.id}`, { body: { confirmation: job.title } });

    assert.strictEqual(response.status, 409, JSON.stringify(response.body));
    assert.strictEqual(response.body.code, 'JOB_NOT_CLOSED');

    const still = await prisma.job.findUnique({ where: { id: job.id } });
    assert.ok(still, 'the open job is untouched');
    assert.strictEqual(await prisma.candidate.count({ where: { jobId: job.id } }), 1, 'its candidates are untouched');
  });

  await testAsync('the open-job refusal is enforced by the server, not the dialog', async () => {
    // The frontend never renders delete for an open job. This calls the API
    // directly with a correct confirmation phrase — the only thing standing
    // between an open role and deletion is the service.
    const job = await makeJob(`${PREFIX} Server Guard Role`);
    const response = await request('DELETE', `/jobs/${job.id}`, { body: { confirmation: job.title } });
    assert.strictEqual(response.status, 409);
    assert.ok(await prisma.job.findUnique({ where: { id: job.id } }), 'still there');
  });

  // --------------------------------------------------------- confirmation
  await testAsync('a closed job is not deleted without the confirmation phrase', async () => {
    const job = await makeJob(`${PREFIX} Confirmation Role`);
    const hire = await makeCandidate(job.id, { name: 'Confirm Hire', status: 'SHORTLISTED' });
    await closeThroughTheRealWorkflow(job.id, hire.id);

    for (const attempt of [undefined, '', '   ', 'DELETE', 'some other role', `${job.title} extra`]) {
      const response = await request('DELETE', `/jobs/${job.id}`, { body: { confirmation: attempt } });
      assert.strictEqual(response.status, 400, `"${attempt}" must be refused`);
      assert.strictEqual(response.body.code, 'DELETE_CONFIRMATION_MISMATCH');
    }

    assert.ok(await prisma.job.findUnique({ where: { id: job.id } }), 'the job survived every wrong answer');
    assert.strictEqual(await prisma.candidate.count({ where: { jobId: job.id } }), 1);
  });

  await testAsync('the confirmation forgives typing, not intent', async () => {
    const job = await makeJob(`${PREFIX} Casing Role`);
    const hire = await makeCandidate(job.id, { name: 'Casing Hire', status: 'SHORTLISTED' });
    await closeThroughTheRealWorkflow(job.id, hire.id);

    // Case and stray whitespace are typing accidents; the words must still match.
    const response = await request('DELETE', `/jobs/${job.id}`, {
      body: { confirmation: `  ${job.title.toUpperCase()}  ` }
    });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
  });

  // ---------------------------------------------------------------- access
  await testAsync('a standard recruiter may not permanently delete', async () => {
    const job = await makeJob(`${PREFIX} Permission Role`);
    const hire = await makeCandidate(job.id, { name: 'Permission Hire', status: 'SHORTLISTED' });
    await closeThroughTheRealWorkflow(job.id, hire.id);

    const response = await request('DELETE', `/jobs/${job.id}`, {
      body: { confirmation: job.title },
      cookie: recruiterCookie
    });
    assert.strictEqual(response.status, 403, JSON.stringify(response.body));
    assert.strictEqual(response.body.code, 'FORBIDDEN');
    assert.ok(await prisma.job.findUnique({ where: { id: job.id } }), 'nothing was deleted');
  });

  await testAsync('an unauthenticated caller may not permanently delete', async () => {
    const job = await makeJob(`${PREFIX} Anonymous Role`);
    const hire = await makeCandidate(job.id, { name: 'Anonymous Hire', status: 'SHORTLISTED' });
    await closeThroughTheRealWorkflow(job.id, hire.id);

    const response = await request('DELETE', `/jobs/${job.id}`, { body: { confirmation: job.title }, cookie: '' });
    assert.strictEqual(response.status, 401);
    assert.ok(await prisma.job.findUnique({ where: { id: job.id } }));
  });

  await testAsync('deleting an unknown job returns a safe 404', async () => {
    const response = await request('DELETE', '/jobs/00000000-0000-4000-8000-000000000000', {
      body: { confirmation: 'anything' }
    });
    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.body.code, 'JOB_NOT_FOUND');
    assert.ok(!/prisma|sql|constraint/i.test(JSON.stringify(response.body)), 'no internals leak');
  });

  /* --------------------------------------------------- the real deletion */

  suite.group('Deleting a closed job for real');

  let summary;
  let deletedJobId;
  let deletedCandidateIds;
  let survivingOpenJob;
  let survivingClosedJob;

  await testAsync('a full hiring cycle is closed, then permanently deleted', async () => {
    const job = await makeJob(`${PREFIX} Full Cycle Role`);
    deletedJobId = job.id;

    // Eight candidates: seven uploaded (resume bytes held by us) and one from
    // Outlook (no bytes of ours at all).
    const people = [];
    for (let i = 0; i < 7; i++) {
      people.push(await makeCandidate(job.id, { name: `Cycle Person ${i}`, status: i === 0 ? 'SHORTLISTED' : 'REVIEW' }));
    }
    people.push(await makeCandidate(job.id, { name: 'Outlook Person', source: 'OUTLOOK' }));
    deletedCandidateIds = people.map((p) => p.id);

    // Something to survive alongside it.
    survivingOpenJob = await makeJob(`${PREFIX} Bystander Open Role`);
    await makeCandidate(survivingOpenJob.id, { name: 'Bystander Open Person' });

    survivingClosedJob = await makeJob(`${PREFIX} Bystander Closed Role`);
    const bystanderHire = await makeCandidate(survivingClosedJob.id, {
      name: 'Bystander Closed Person',
      status: 'SHORTLISTED'
    });
    await closeThroughTheRealWorkflow(survivingClosedJob.id, bystanderHire.id);

    // Closed through the real workflow, exactly as a recruiter would.
    await closeThroughTheRealWorkflow(job.id, people[0].id);
    const closed = await prisma.job.findUnique({ where: { id: job.id } });
    assert.strictEqual(closed.status, 'CLOSED');
    assert.strictEqual(closed.selectedCandidateId, people[0].id);

    const before = {
      candidates: await prisma.candidate.count({ where: { jobId: job.id } }),
      notes: await prisma.candidateNote.count({ where: { candidateId: { in: deletedCandidateIds } } }),
      activities: await prisma.candidateActivity.count({ where: { candidateId: { in: deletedCandidateIds } } }),
      withBytes: await prisma.candidate.count({ where: { jobId: job.id, resumeData: { not: null } } })
    };
    assert.strictEqual(before.candidates, 8);
    assert.strictEqual(before.withBytes, 7, 'the Outlook candidate holds no bytes of ours');
    assert.ok(before.activities >= 8 + 2, 'closure added its own audit rows');

    const response = await request('DELETE', `/jobs/${job.id}`, { body: { confirmation: job.title } });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
    summary = response.body.data;
  });

  await testAsync('the job row is gone', async () => {
    assert.strictEqual(await prisma.job.count({ where: { id: deletedJobId } }), 0);
    assert.strictEqual(summary.deleted.jobs, 1);
  });

  await testAsync('every candidate row is gone', async () => {
    assert.strictEqual(await prisma.candidate.count({ where: { jobId: deletedJobId } }), 0);
    assert.strictEqual(await prisma.candidate.count({ where: { id: { in: deletedCandidateIds } } }), 0);
    assert.strictEqual(summary.deleted.candidates, 8);
  });

  await testAsync('notes and activity rows are gone', async () => {
    assert.strictEqual(await prisma.candidateNote.count({ where: { candidateId: { in: deletedCandidateIds } } }), 0);
    assert.strictEqual(await prisma.candidateActivity.count({ where: { candidateId: { in: deletedCandidateIds } } }), 0);
    assert.strictEqual(summary.deleted.candidateNotes, 8);
    assert.ok(summary.deleted.candidateActivities >= 10, JSON.stringify(summary.deleted));
  });

  await testAsync('stored resume bytes are released and reported', async () => {
    assert.strictEqual(summary.deleted.storedResumes, 7, 'seven resumes were ours to delete');
    assert.strictEqual(summary.storage.storedResumesRemoved, 7);
    assert.strictEqual(summary.storage.resumeBytesReleased, 7 * 2048, 'the byte figure is measured, not estimated');
  });

  await testAsync('no mailbox original is touched', async () => {
    assert.strictEqual(summary.external.mailboxOriginalsDeleted, 0);
    assert.strictEqual(summary.external.outlookSourcedCandidates, 1);
  });

  await testAsync('the deleted job is a clean 404, not a crash', async () => {
    const job = await request('GET', `/jobs/${deletedJobId}`);
    assert.strictEqual(job.status, 404, JSON.stringify(job.body));

    const candidate = await request('GET', `/candidates/${deletedCandidateIds[0]}`);
    assert.strictEqual(candidate.status, 404, 'a candidate of a deleted job is genuinely gone');
    assert.strictEqual(candidate.body.code, 'CANDIDATE_NOT_FOUND');
  });

  await testAsync('the deleted job leaves the closed-jobs listing', async () => {
    const closed = await request('GET', '/jobs/summary?status=CLOSED&limit=100');
    assert.strictEqual(closed.status, 200);
    assert.ok(!closed.body.data.some((j) => j.id === deletedJobId), 'gone from Closed Jobs');
    assert.ok(
      closed.body.data.some((j) => j.id === survivingClosedJob.id),
      'the other closed job is still listed'
    );
  });

  /* ------------------------------------------------------- blast radius */

  suite.group('Blast radius');

  await testAsync('other jobs and their candidates are untouched', async () => {
    const open = await prisma.job.findUnique({ where: { id: survivingOpenJob.id } });
    assert.ok(open, 'the open bystander survived');
    assert.strictEqual(open.status, 'OPEN');
    assert.strictEqual(await prisma.candidate.count({ where: { jobId: survivingOpenJob.id } }), 1);

    const closed = await prisma.job.findUnique({ where: { id: survivingClosedJob.id } });
    assert.ok(closed, 'the other closed job survived');
    assert.strictEqual(closed.status, 'CLOSED');
    assert.ok(closed.selectedCandidateId, 'and kept its recorded hire');
    assert.strictEqual(await prisma.candidate.count({ where: { jobId: survivingClosedJob.id } }), 1);
  });

  await testAsync('the database shrank by exactly the fixture rows that were deleted', async () => {
    /*
     * Counted rather than calculated. An earlier version of this assertion did
     * the arithmetic by hand — total minus the one job it expected to have gone
     * — and failed the moment a second test in the suite also deleted a job.
     * The invariant that actually matters is that the totals equal the world
     * outside the fixture plus whatever the fixture still has, whichever tests
     * happened to run.
     */
    const survivingFixtureJobs = await prisma.job.count({ where: { id: { in: created.jobIds } } });
    const survivingFixtureCandidates = await prisma.candidate.count({ where: { id: { in: created.candidateIds } } });

    assert.strictEqual(
      await prisma.job.count(),
      outsideJobs + survivingFixtureJobs,
      'no job outside this fixture was removed'
    );
    assert.strictEqual(
      await prisma.candidate.count(),
      outsideCandidates + survivingFixtureCandidates,
      'no candidate outside this fixture was removed'
    );

    // And the fixture really did lose the eight candidates of the deleted role.
    assert.ok(
      survivingFixtureCandidates === created.candidateIds.length - 9,
      `expected 9 fixture candidates gone (8 from the full cycle + 1 from the casing test), ` +
        `${created.candidateIds.length - survivingFixtureCandidates} went`
    );
  });

  await testAsync('genuine data outside the fixture is exactly as it was', async () => {
    const fixtureJobIds = created.jobIds;
    const fixtureCandidateIds = created.candidateIds;

    const genuineJobs = await prisma.job.count({ where: { id: { notIn: fixtureJobIds } } });
    const genuineCandidates = await prisma.candidate.count({ where: { id: { notIn: fixtureCandidateIds } } });
    const genuineNotes = await prisma.candidateNote.count({
      where: { candidateId: { notIn: fixtureCandidateIds } }
    });
    const genuineActivities = await prisma.candidateActivity.count({
      where: { candidateId: { notIn: fixtureCandidateIds } }
    });

    // These were counted before any fixture existed, so the fixture's own rows
    // are excluded on both sides of the comparison.
    assert.strictEqual(genuineJobs, outsideJobs, 'no genuine job was removed');
    assert.strictEqual(genuineCandidates, outsideCandidates, 'no genuine candidate was removed');
    assert.strictEqual(genuineNotes, outsideNotes, 'no genuine note was removed');
    assert.strictEqual(genuineActivities, outsideActivities, 'no genuine activity was removed');
  });

  await testAsync('deleting the same job twice is a 404, not a second deletion', async () => {
    const again = await request('DELETE', `/jobs/${deletedJobId}`, { body: { confirmation: `${PREFIX} Full Cycle Role` } });
    assert.strictEqual(again.status, 404);
    assert.strictEqual(again.body.code, 'JOB_NOT_FOUND');
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
