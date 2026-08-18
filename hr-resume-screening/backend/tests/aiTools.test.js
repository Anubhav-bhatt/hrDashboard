/**
 * AI tool layer tests.
 *
 *   npm run test:ai:tools
 *
 * Exercises every tool against the real PostgreSQL database through the real
 * business services — the same services the HTTP API uses. Fixtures are created
 * and removed by this suite.
 *
 * The analytics section is the one worth reading carefully: it asserts that the
 * tools and the dashboard produce the *same numbers* for the same database state,
 * which is the whole justification for having extracted the analytics service.
 */
require('dotenv').config();
const { createSuite, assert } = require('./harness');

const prisma = require('../config/prisma');
const { hashPassword } = require('../services/authService');
const { executeTool, describeTools, listToolNames, getTool } = require('../ai/tools/toolRegistry');
const { resolveAiConfig } = require('../ai/config/aiConfig');
const { normalizeAgentContext } = require('../ai/context/AgentContext');
const { EXCLUDED_CANDIDATE_FIELDS, toAICandidateSummary, toAIJobSummary } = require('../ai/tools/mappers');
const { PERMISSIONS, resolvePermissions } = require('../ai/tools/permissions');
const { APPLICATION_PAGE_CAP } = require('../ai/tools/candidates.tools');
const { getDashboardOverview, getJobSummaryData } = require('../services/analyticsService');

const suite = createSuite('AI tool layer — controlled recruitment data access');
const { test, testAsync } = suite;

const TEST_PREFIX = 'aitooltest';
const created = { userIds: [], jobIds: [], candidateIds: [] };

const config = resolveAiConfig({ AI_ENABLED: 'true' });

/** An execution context as the authenticated pipeline would build it. */
const contextFor = (user) => normalizeAgentContext({}, { user, requestId: 'tool-test-request' });

let recruiter;
let admin;
let ctx;

/* --------------------------------------------------------------- setup ---- */

const setup = async () => {
  const user = await prisma.user.upsert({
    where: { email: `${TEST_PREFIX}.recruiter@example.invalid` },
    update: { isActive: true },
    create: {
      email: `${TEST_PREFIX}.recruiter@example.invalid`,
      passwordHash: await hashPassword('ToolTestPassword123!'),
      name: 'Tool Test Recruiter',
      role: 'RECRUITER'
    }
  });
  created.userIds.push(user.id);
  recruiter = { id: user.id, role: user.role, name: user.name };
  admin = { id: user.id, role: 'ADMIN', name: 'Tool Test Admin' };
  ctx = contextFor(recruiter);

  const job = await prisma.job.create({
    data: {
      title: `${TEST_PREFIX} Senior React Developer`,
      jdFileName: 'tool-jd.txt',
      jdMimeType: 'text/plain',
      jdText: 'React developer with TypeScript. Minimum 3 years.',
      requiredSkills: ['React', 'TypeScript'],
      preferredSkills: ['Node.js'],
      roleKeywords: ['react developer'],
      minimumExperience: 3,
      maximumExperience: 9,
      preferredLocations: ['Gurugram'],
      qualifications: ['B.Tech'],
      preferredEducation: ['B.Tech'],
      salaryMin: 800000,
      salaryMax: 2000000
    }
  });
  created.jobIds.push(job.id);

  // A second job, used to prove job-scoped lookups cannot cross over.
  const otherJob = await prisma.job.create({
    data: {
      title: `${TEST_PREFIX} Unrelated Python Role`,
      jdFileName: 'other-tool-jd.txt',
      jdMimeType: 'text/plain',
      jdText: 'A different role.',
      requiredSkills: ['Python'],
      preferredSkills: [],
      roleKeywords: [],
      minimumExperience: 0,
      preferredEducation: []
    }
  });
  created.jobIds.push(otherJob.id);

  // A job with no candidates and no optional fields set.
  const bareJob = await prisma.job.create({
    data: {
      title: `${TEST_PREFIX} Bare Job`,
      jdFileName: 'bare.txt',
      jdMimeType: 'text/plain',
      jdText: 'Nothing specified.',
      requiredSkills: ['Go'],
      preferredSkills: [],
      roleKeywords: [],
      preferredEducation: []
    }
  });
  created.jobIds.push(bareJob.id);

  const candidates = [
    {
      name: 'Tool Alpha',
      email: `${TEST_PREFIX}.alpha@example.invalid`,
      phone: '+919000000101',
      alternateEmail: `${TEST_PREFIX}.alpha.alt@example.invalid`,
      linkedinUrl: 'https://linkedin.com/in/toolalpha',
      currentRole: 'Senior React Developer',
      totalExperience: 5,
      currentLocation: 'Gurugram',
      qualification: 'B.Tech',
      skills: ['React', 'TypeScript', 'Node.js'],
      education: ['B.Tech'],
      hrStatus: 'SHORTLISTED',
      overallScore: 92,
      alignmentLabel: 'Excellent Alignment',
      requiredSkillScore: 40,
      preferredSkillScore: 10,
      experienceScore: 25,
      roleScore: 15,
      projectScore: 5,
      educationScore: 5,
      matchedSkills: ['React', 'TypeScript'],
      missingRequiredSkills: [],
      strengths: ['Strong React background'],
      gaps: [],
      analyzedAt: new Date('2026-08-01T00:00:00Z'),
      currentSalary: 1200000,
      expectedSalary: 1800000,
      resumeText: 'ALPHA CONFIDENTIAL RESUME BODY',
      notes: 'Private recruiter note about Alpha'
    },
    {
      name: 'Tool Beta',
      email: `${TEST_PREFIX}.beta@example.invalid`,
      phone: '+919000000102',
      currentRole: 'Java Developer',
      totalExperience: 1,
      currentLocation: 'Pune',
      qualification: 'MCA',
      skills: ['Java'],
      education: ['MCA'],
      hrStatus: 'REVIEW',
      overallScore: 38,
      alignmentLabel: 'Low Alignment',
      requiredSkillScore: 0,
      preferredSkillScore: 0,
      experienceScore: 8,
      roleScore: 8,
      projectScore: 3,
      educationScore: 3,
      matchedSkills: [],
      missingRequiredSkills: ['React', 'TypeScript'],
      analyzedAt: new Date('2026-08-02T00:00:00Z'),
      resumeText: 'BETA RESUME BODY'
    },
    {
      // Deliberately never analysed: proves the tools report "unscored" rather
      // than inventing a number.
      name: 'Tool Gamma',
      email: `${TEST_PREFIX}.gamma@example.invalid`,
      currentRole: 'React Developer',
      totalExperience: null,
      currentLocation: 'Bengaluru',
      skills: ['React'],
      hrStatus: 'NEEDS_REVIEW',
      overallScore: null,
      resumeText: 'GAMMA RESUME BODY'
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

  // One candidate on the other job.
  const outsider = await prisma.candidate.create({
    data: {
      jobId: otherJob.id,
      name: 'Tool Outsider',
      source: 'MANUAL_SINGLE',
      outlookMessageId: `${TEST_PREFIX}-msg-out`,
      outlookAttachmentId: `${TEST_PREFIX}-att-out`,
      resumeHash: `${TEST_PREFIX}-hash-out`,
      skills: ['Python'],
      hrStatus: 'REVIEW',
      overallScore: 55
    }
  });
  created.candidateIds.push(outsider.id);

  return { job, otherJob, bareJob, outsider };
};

const teardown = async () => {
  await prisma.candidateActivity.deleteMany({ where: { candidateId: { in: created.candidateIds } } });
  await prisma.candidateNote.deleteMany({ where: { candidateId: { in: created.candidateIds } } });
  await prisma.candidate.deleteMany({ where: { jobId: { in: created.jobIds } } });
  await prisma.job.deleteMany({ where: { id: { in: created.jobIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await prisma.$disconnect();
};

const run = async () => {
  const { job, otherJob, bareJob, outsider } = await setup();
  const [alphaId, betaId, gammaId] = created.candidateIds;

  const call = (name, input) => executeTool(name, input, ctx, { config });

  /* ------------------------------------------------------------ registry -- */

  suite.group('Registry');

  test('every registered tool is read-only', () => {
    for (const tool of describeTools()) {
      assert.strictEqual(tool.readOnly, true, `${tool.name} must be read-only`);
    }
  });

  test('every tool declares a permission, a category and the service it reuses', () => {
    const permissions = Object.values(PERMISSIONS);
    for (const tool of describeTools()) {
      assert.ok(permissions.includes(tool.permission), `${tool.name}: ${tool.permission}`);
      assert.ok(['jobs', 'candidates', 'scoring', 'analytics'].includes(tool.category), tool.category);
      assert.ok(/^services\//.test(tool.service), `${tool.name} must name a service: ${tool.service}`);
    }
  });

  test('the expected twelve tools are registered', () => {
    assert.deepStrictEqual([...listToolNames()].sort(), [
      'getCandidate',
      'getCandidateScore',
      'getCandidates',
      'getDashboardMetrics',
      'getJob',
      'getJobMetrics',
      'getJobRankingData',
      'getJobRequirements',
      'getJobs',
      'getPipelineMetrics',
      'getScoringBreakdown',
      'searchCandidates'
    ]);
  });

  test('a tool name cannot resolve an inherited property or a module path', () => {
    for (const name of ['constructor', '__proto__', 'toString', '../../services/authService', 'hasOwnProperty']) {
      assert.strictEqual(getTool(name), null, `${name} must not resolve`);
    }
  });

  await testAsync('an unregistered tool name fails safely', async () => {
    const res = await call('deleteEverything', {});
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error.code, 'TOOL_INVALID_INPUT');
  });

  test('the model cannot reach the tools: nothing in the agent path imports the registry', () => {
    // This phase builds and tests the tool layer; it does not connect it. The
    // provider must not be able to decide which tool runs, so the orchestrator
    // and the providers are checked for any path to the registry.
    const fs = require('fs');
    const path = require('path');
    const aiDir = path.join(__dirname, '..', 'ai');

    const agentPathFiles = [
      path.join(aiDir, 'orchestrator', 'AgentOrchestrator.js'),
      path.join(aiDir, 'providers', 'index.js'),
      path.join(aiDir, 'providers', 'MockAIProvider.js'),
      path.join(aiDir, 'providers', 'AIProvider.js')
    ];

    for (const file of agentPathFiles) {
      const source = fs.readFileSync(file, 'utf8');
      assert.ok(
        !/require\(['"][^'"]*tools?\//.test(source),
        `${path.basename(file)} imports the tool layer — the model must not select tools in this phase`
      );
    }

    // And the HTTP surface exposes no tool-execution route.
    const routesDir = path.join(__dirname, '..', 'routes');
    for (const file of fs.readdirSync(routesDir)) {
      const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
      assert.ok(!/toolRegistry|executeTool/.test(source), `${file} exposes tool execution over HTTP`);
    }
  });

  /* ---------------------------------------------------------- job tools -- */

  suite.group('Job tools');

  await testAsync('getJob returns a valid job with its requirements', async () => {
    const res = await call('getJob', { jobId: job.id });
    assert.strictEqual(res.success, true, JSON.stringify(res.error));
    assert.strictEqual(res.data.job.jobId, job.id);
    assert.strictEqual(res.data.job.title, job.title);
    assert.strictEqual(res.data.job.status, 'OPEN');
    assert.deepStrictEqual(res.data.job.requirements.requiredSkills, ['React', 'TypeScript']);
    assert.strictEqual(res.data.job.requirements.minimumExperience, 3);
    assert.strictEqual(res.data.job.requirements.salaryRange.min, 800000);
    assert.strictEqual(res.data.job.pipeline.candidateCount, 3);
  });

  await testAsync('getJob rejects a malformed job id without touching the database', async () => {
    for (const jobId of ['', 'not a valid id', "'; DROP TABLE \"Job\"; --", '../../etc/passwd', 42, null]) {
      const res = await call('getJob', { jobId });
      assert.strictEqual(res.success, false, JSON.stringify(jobId));
      assert.strictEqual(res.error.code, 'TOOL_INVALID_INPUT', JSON.stringify(jobId));
    }
  });

  await testAsync('getJob reports a nonexistent job as not found', async () => {
    const res = await call('getJob', { jobId: '2f8a1c4e-0b7d-4c3a-9f21-000000000000' });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error.code, 'RESOURCE_NOT_FOUND');
  });

  await testAsync('getJob refuses an unsupported input key', async () => {
    const res = await call('getJob', { jobId: job.id, includeSecrets: true });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error.code, 'TOOL_INVALID_INPUT');
  });

  await testAsync('getJobRequirements returns criteria and marks absent ones explicitly', async () => {
    const res = await call('getJobRequirements', { jobId: job.id });
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data.requirements.preferredSkills, ['Node.js']);
    assert.strictEqual(res.data.requirements.maximumExperience, 9);
    assert.deepStrictEqual(res.data.requirements.preferredLocations, ['Gurugram']);

    // Not modelled by this application — reported, not invented, not omitted.
    assert.strictEqual(res.data.requirements.noticePeriodPreference.available, false);
    assert.strictEqual(res.data.requirements.noticePeriodPreference.value, null);
    assert.ok(res.metadata.unmodelledCriteria.includes('noticePeriodPreference'));
  });

  await testAsync('getJobRequirements exposes a reference to the JD, never its text', async () => {
    const res = await call('getJobRequirements', { jobId: job.id });
    assert.strictEqual(res.data.jobDescription.fileName, 'tool-jd.txt');
    assert.strictEqual(res.data.jobDescription.hasText, true);
    assert.ok(res.data.jobDescription.characterCount > 0);
    assert.ok(!JSON.stringify(res).includes('Minimum 3 years'), 'JD text leaked into the tool response');
  });

  await testAsync('a job with no candidates and no optional fields returns cleanly', async () => {
    const res = await call('getJob', { jobId: bareJob.id });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.job.pipeline.candidateCount, 0);
    assert.strictEqual(res.data.job.requirements.maximumExperience, null);
    assert.deepStrictEqual(res.data.job.requirements.preferredLocations, []);
    assert.strictEqual(res.data.job.requirements.salaryRange.min, null);
  });

  await testAsync('getJobs lists jobs with counts and honours search and status', async () => {
    const all = await call('getJobs', { search: TEST_PREFIX });
    assert.strictEqual(all.success, true);
    assert.ok(all.data.jobs.length >= 3, `expected our fixtures, got ${all.data.jobs.length}`);
    for (const row of all.data.jobs) {
      assert.ok(row.jobId && row.title, JSON.stringify(row));
      assert.ok('candidateCount' in row);
    }

    const open = await call('getJobs', { search: TEST_PREFIX, status: 'OPEN' });
    assert.strictEqual(open.success, true);
    assert.ok(open.data.jobs.every((j) => j.status === 'OPEN'));

    const closed = await call('getJobs', { search: TEST_PREFIX, status: 'CLOSED' });
    assert.strictEqual(closed.data.jobs.length, 0, 'no fixture job is closed');
  });

  await testAsync('getJobs rejects an invalid status rather than ignoring it', async () => {
    const res = await call('getJobs', { status: 'ACTIVE' });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error.code, 'TOOL_INVALID_INPUT');
    assert.ok(/OPEN/.test(res.error.message), res.error.message);
  });

  await testAsync('getJob does not write to the job it reads', async () => {
    // A legacy job with no requiredSkills: the HTTP route back-fills and persists
    // them; the tool must return the same values without saving.
    const legacy = await prisma.job.create({
      data: {
        title: `${TEST_PREFIX} Legacy Job`,
        jdFileName: 'legacy.txt',
        jdMimeType: 'text/plain',
        jdText: 'We need a React developer with 4 years of experience. Required Skills: React, Redux',
        requiredSkills: [],
        preferredSkills: [],
        roleKeywords: [],
        preferredEducation: []
      }
    });
    created.jobIds.push(legacy.id);

    const before = await prisma.job.findUnique({ where: { id: legacy.id }, select: { requiredSkills: true, updatedAt: true } });
    const res = await call('getJob', { jobId: legacy.id });
    const after = await prisma.job.findUnique({ where: { id: legacy.id }, select: { requiredSkills: true, updatedAt: true } });

    assert.strictEqual(res.success, true);
    assert.ok(res.data.job.requirements.requiredSkills.length > 0, 'the tool still reports the computed requirements');
    assert.deepStrictEqual(after.requiredSkills, before.requiredSkills, 'the tool must not persist a back-fill');
    assert.strictEqual(after.updatedAt.getTime(), before.updatedAt.getTime(), 'the row must not be touched');
  });

  /* ---------------------------------------------------- candidate tools -- */

  suite.group('Candidate tools');

  await testAsync('getCandidate returns a sanitized recruitment summary', async () => {
    const res = await call('getCandidate', { candidateId: alphaId, jobId: job.id });
    assert.strictEqual(res.success, true, JSON.stringify(res.error));

    const c = res.data.candidate;
    assert.strictEqual(c.candidateId, alphaId);
    assert.strictEqual(c.name, 'Tool Alpha');
    assert.strictEqual(c.currentRole, 'Senior React Developer');
    assert.deepStrictEqual(c.skills, ['React', 'TypeScript', 'Node.js']);
    assert.strictEqual(c.experience.statedYears, 5);
    assert.strictEqual(c.location.current, 'Gurugram');
    assert.strictEqual(c.compensation.expectedSalary, 1800000);
    assert.strictEqual(c.status.isShortlisted, true);
    assert.strictEqual(c.status.isSelected, false);
    assert.strictEqual(c.score.overallScore, 92);
    assert.strictEqual(c.score.isScored, true);
  });

  await testAsync('contact details and resume text never leave through a candidate tool', async () => {
    const res = await call('getCandidate', { candidateId: alphaId });
    const serialized = JSON.stringify(res);

    for (const secret of [
      `${TEST_PREFIX}.alpha@example.invalid`,
      `${TEST_PREFIX}.alpha.alt@example.invalid`,
      '+919000000101',
      'linkedin.com/in/toolalpha',
      'ALPHA CONFIDENTIAL RESUME BODY',
      'Private recruiter note about Alpha'
    ]) {
      assert.ok(!serialized.includes(secret), `leaked: ${secret}`);
    }

    // And the field names themselves are absent from the summary.
    const candidate = res.data.candidate;
    for (const field of ['email', 'phone', 'linkedinUrl', 'resumeText', 'notes', 'noteEntries', 'activities']) {
      assert.strictEqual(candidate[field], undefined, `${field} should not be present`);
    }
  });

  await testAsync('the exclusion list is honoured by the mapper for a raw database row', async () => {
    const row = await prisma.candidate.findUnique({ where: { id: alphaId } });
    const summary = toAICandidateSummary(row);
    const serialized = JSON.stringify(summary);

    for (const field of EXCLUDED_CANDIDATE_FIELDS) {
      assert.ok(!Object.prototype.hasOwnProperty.call(summary, field), `${field} present at top level`);
    }
    assert.ok(!serialized.includes('ALPHA CONFIDENTIAL RESUME BODY'), 'resume text leaked');
    assert.ok(!serialized.includes('+919000000101'), 'phone leaked');
  });

  await testAsync('a candidate cannot be read through the wrong job', async () => {
    const res = await call('getCandidate', { candidateId: alphaId, jobId: otherJob.id });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error.code, 'RESOURCE_NOT_FOUND');
    // The message must not confirm the candidate exists elsewhere.
    assert.ok(!/other job|exists/i.test(res.error.message), res.error.message);
  });

  await testAsync('an unknown or malformed candidate id fails safely', async () => {
    const missing = await call('getCandidate', { candidateId: '2f8a1c4e-0b7d-4c3a-9f21-000000000000' });
    assert.strictEqual(missing.error.code, 'RESOURCE_NOT_FOUND');

    for (const candidateId of ['', 'a b', "' OR 1=1 --", 99]) {
      const res = await call('getCandidate', { candidateId });
      assert.strictEqual(res.error.code, 'TOOL_INVALID_INPUT', JSON.stringify(candidateId));
    }
  });

  await testAsync('getCandidates lists a job’s candidates in score order', async () => {
    const res = await call('getCandidates', { jobId: job.id });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.candidates.length, 3);
    assert.strictEqual(res.metadata.totalMatching, 3);

    const scores = res.data.candidates.map((c) => c.score.overallScore);
    assert.strictEqual(scores[0], 92, 'highest first');
    assert.strictEqual(scores[1], 38);
    assert.strictEqual(scores[2], null, 'unscored ranks last, not as zero');
  });

  await testAsync('getCandidates filters by status', async () => {
    const res = await call('getCandidates', { jobId: job.id, status: 'SHORTLISTED' });
    assert.strictEqual(res.data.candidates.length, 1);
    assert.strictEqual(res.data.candidates[0].candidateId, alphaId);
    assert.strictEqual(res.metadata.filters.status, 'SHORTLISTED');
  });

  await testAsync('getCandidates paginates and reports whether more remain', async () => {
    const first = await call('getCandidates', { jobId: job.id, limit: 2, offset: 0 });
    assert.strictEqual(first.data.candidates.length, 2);
    assert.strictEqual(first.metadata.hasMore, true);
    assert.strictEqual(first.metadata.totalMatching, 3);

    const second = await call('getCandidates', { jobId: job.id, limit: 2, offset: 2 });
    assert.strictEqual(second.data.candidates.length, 1);
    assert.strictEqual(second.metadata.hasMore, false);

    const firstIds = first.data.candidates.map((c) => c.candidateId);
    assert.ok(!firstIds.includes(second.data.candidates[0].candidateId), 'pages must not overlap');
  });

  await testAsync('an offset that does not land on a page boundary is refused', async () => {
    const res = await call('getCandidates', { jobId: job.id, limit: 2, offset: 1 });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error.code, 'TOOL_INVALID_INPUT');
    assert.ok(/multiple of limit/.test(res.error.message), res.error.message);
  });

  await testAsync('getCandidates on an unknown job reports not found', async () => {
    const res = await call('getCandidates', { jobId: '2f8a1c4e-0b7d-4c3a-9f21-000000000000' });
    assert.strictEqual(res.error.code, 'RESOURCE_NOT_FOUND');
  });

  await testAsync('searchCandidates uses the application’s existing filters', async () => {
    const bySkill = await call('searchCandidates', { jobId: job.id, skills: ['react'] });
    assert.strictEqual(bySkill.success, true, JSON.stringify(bySkill.error));
    const names = bySkill.data.candidates.map((c) => c.name).sort();
    assert.deepStrictEqual(names, ['Tool Alpha', 'Tool Gamma'], 'case-insensitive skill match');

    const byScore = await call('searchCandidates', { jobId: job.id, minimumScore: 80 });
    assert.strictEqual(byScore.data.candidates.length, 1);
    assert.strictEqual(byScore.data.candidates[0].candidateId, alphaId);

    const byStatus = await call('searchCandidates', { jobId: job.id, status: 'NEEDS_REVIEW' });
    assert.strictEqual(byStatus.data.candidates.length, 1);
    assert.strictEqual(byStatus.data.candidates[0].candidateId, gammaId);

    const byLocation = await call('searchCandidates', { jobId: job.id, location: 'Pune' });
    assert.strictEqual(byLocation.data.candidates.length, 1);
    assert.strictEqual(byLocation.data.candidates[0].candidateId, betaId);
  });

  await testAsync('searchCandidates spans jobs when no jobId is given', async () => {
    const res = await call('searchCandidates', { search: 'Tool ' });
    assert.strictEqual(res.success, true);
    const ids = res.data.candidates.map((c) => c.candidateId);
    assert.ok(ids.includes(alphaId), 'should include the first job');
    assert.ok(ids.includes(outsider.id), 'should include the second job');
  });

  await testAsync('searchCandidates refuses a raw query object, SQL or a Prisma expression', async () => {
    const attacks = [
      { where: { hrStatus: 'SHORTLISTED' } },
      { filters: { OR: [{ id: { not: null } }] } },
      { search: { contains: 'x' } },
      { skills: [{ hasSome: ['React'] }] },
      { minimumScore: { gte: 0 } },
      { orderBy: 'createdAt' },
      { select: { email: true } },
      { include: { job: true } },
      { take: 100000 }
    ];

    for (const attack of attacks) {
      const res = await call('searchCandidates', attack);
      assert.strictEqual(res.success, false, JSON.stringify(attack));
      assert.ok(
        ['TOOL_INVALID_INPUT', 'TOOL_LIMIT_EXCEEDED'].includes(res.error.code),
        `${JSON.stringify(attack)} -> ${res.error.code}`
      );
    }
  });

  await testAsync('a conflicting score range is refused', async () => {
    const res = await call('searchCandidates', { minimumScore: 90, maximumScore: 10 });
    assert.strictEqual(res.error.code, 'TOOL_INVALID_INPUT');
  });

  /* -------------------------------------------------------- limit rules -- */

  suite.group('Limit enforcement');

  await testAsync('a limit above the ceiling is refused rather than silently clamped', async () => {
    for (const limit of [101, 500, 50000]) {
      const res = await call('getCandidates', { jobId: job.id, limit });
      assert.strictEqual(res.success, false, `limit ${limit}`);
      assert.strictEqual(res.error.code, 'TOOL_LIMIT_EXCEEDED', `limit ${limit}`);
    }
  });

  await testAsync('the effective ceiling respects the application’s own page cap', async () => {
    // The configured maximum is 200, but utils/candidateQuery caps a page at 100.
    // The advertised ceiling must be the one actually honoured.
    assert.strictEqual(config.limits.maxCandidateLimit, 200, 'configured maximum');
    const atCap = await call('getCandidates', { jobId: job.id, limit: APPLICATION_PAGE_CAP });
    assert.strictEqual(atCap.success, true, 'the application cap itself must be accepted');

    const overCap = await call('getCandidates', { jobId: job.id, limit: APPLICATION_PAGE_CAP + 1 });
    assert.strictEqual(overCap.error.code, 'TOOL_LIMIT_EXCEEDED');
  });

  await testAsync('a malformed or non-positive limit is refused, never coerced', async () => {
    // A numeric string is the important case: coercing "50" would mean a caller
    // could also send "50; DROP" and have it silently become a number somewhere.
    for (const limit of ['50', 0, -1, 2.5, {}, true, []]) {
      const res = await call('getCandidates', { jobId: job.id, limit });
      assert.strictEqual(res.success, false, JSON.stringify(limit));
      assert.strictEqual(res.error.code, 'TOOL_INVALID_INPUT', JSON.stringify(limit));
    }
  });

  await testAsync('an absent limit means the default, and null counts as absent', async () => {
    // null and undefined both read as "not supplied", consistently with the
    // optional-id and optional-filter validators.
    for (const limit of [undefined, null]) {
      const res = await call('getCandidates', { jobId: job.id, limit });
      assert.strictEqual(res.success, true, JSON.stringify(limit));
      assert.strictEqual(res.metadata.limit, config.limits.defaultCandidateLimit);
    }
  });

  await testAsync('an oversized skills array is refused', async () => {
    const res = await call('searchCandidates', { skills: Array.from({ length: 40 }, (_, i) => `skill${i}`) });
    assert.strictEqual(res.error.code, 'TOOL_LIMIT_EXCEEDED');
  });

  await testAsync('the default limit applies when none is given', async () => {
    const res = await call('getCandidates', { jobId: job.id });
    assert.strictEqual(res.metadata.limit, config.limits.defaultCandidateLimit);
  });

  /* ------------------------------------------------------ scoring tools -- */

  suite.group('Scoring tools');

  await testAsync('getCandidateScore returns the stored score, unchanged', async () => {
    const res = await call('getCandidateScore', { candidateId: alphaId, jobId: job.id });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.overallScore, 92);
    assert.strictEqual(res.data.alignmentLabel, 'Excellent Alignment');
    assert.strictEqual(res.data.isScored, true);
    assert.strictEqual(res.data.band.isStrongMatch, true);
    assert.strictEqual(res.data.band.isExcellentMatch, true);
    assert.strictEqual(res.metadata.source, 'stored');

    // The value must match the database exactly — no recomputation.
    const row = await prisma.candidate.findUnique({ where: { id: alphaId }, select: { overallScore: true } });
    assert.strictEqual(res.data.overallScore, row.overallScore);
  });

  await testAsync('an unscored candidate is reported as unscored, never as zero', async () => {
    const score = await call('getCandidateScore', { candidateId: gammaId });
    assert.strictEqual(score.success, true);
    assert.strictEqual(score.data.isScored, false);
    assert.strictEqual(score.data.overallScore, null, 'must be null, not 0');
    assert.strictEqual(score.data.alignmentLabel, null);
    assert.strictEqual(score.data.band, null);
    assert.ok(/not been analysed/i.test(score.data.reason), score.data.reason);

    const breakdown = await call('getScoringBreakdown', { candidateId: gammaId });
    assert.strictEqual(breakdown.data.isScored, false);
    assert.strictEqual(breakdown.data.breakdown, null, 'no invented breakdown');
  });

  await testAsync('getScoringBreakdown returns the real dimensions and their weights', async () => {
    const res = await call('getScoringBreakdown', { candidateId: alphaId, jobId: job.id });
    assert.strictEqual(res.success, true);

    assert.deepStrictEqual(Object.keys(res.data.breakdown).sort(), [
      'education',
      'experience',
      'preferredSkills',
      'projects',
      'requiredSkills',
      'roleRelevance'
    ]);

    assert.strictEqual(res.data.breakdown.requiredSkills.points, 40);
    assert.strictEqual(res.data.breakdown.requiredSkills.maxPoints, 40);
    assert.strictEqual(res.data.breakdown.requiredSkills.percentage, 100);
    assert.strictEqual(res.data.breakdown.experience.maxPoints, 25);

    const total = Object.values(res.data.breakdown).reduce((sum, d) => sum + d.maxPoints, 0);
    assert.strictEqual(total, 100, 'the dimensions must account for the whole score');

    assert.deepStrictEqual(res.data.skills.matched, ['React', 'TypeScript']);
    assert.deepStrictEqual(res.data.skills.missingRequired, []);
  });

  await testAsync('unscored criteria are named rather than reported as zero scores', async () => {
    const res = await call('getScoringBreakdown', { candidateId: alphaId });
    assert.deepStrictEqual(res.metadata.criteriaNotScored, ['location', 'salary', 'noticePeriod']);
    for (const absent of ['location', 'salary', 'noticePeriod']) {
      assert.strictEqual(res.data.breakdown[absent], undefined, `${absent} must not appear as a scored dimension`);
    }
  });

  await testAsync('a wrong job/candidate pair is refused for scoring too', async () => {
    const res = await call('getCandidateScore', { candidateId: alphaId, jobId: otherJob.id });
    assert.strictEqual(res.error.code, 'RESOURCE_NOT_FOUND');
  });

  await testAsync('getJobRankingData reuses the application ranking without re-sorting', async () => {
    const res = await call('getJobRankingData', { jobId: job.id });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.metadata.ordering, 'score_desc');

    assert.deepStrictEqual(
      res.data.ranking.map((r) => [r.rank, r.overallScore]),
      [
        [1, 92],
        [2, 38],
        [3, null]
      ]
    );
    assert.strictEqual(res.metadata.unscoredCount, 1);
  });

  /* ---------------------------------------------------- analytics tools -- */

  suite.group('Analytics tools agree with the dashboard');

  await testAsync('getDashboardMetrics matches the dashboard service exactly', async () => {
    const tool = await call('getDashboardMetrics', {});
    const dashboard = await getDashboardOverview({});

    assert.strictEqual(tool.success, true);
    assert.deepStrictEqual(tool.data.metrics, dashboard.metrics, 'metrics must be identical');
    assert.deepStrictEqual(tool.data.scoreBands, dashboard.scoreBands);
    assert.strictEqual(tool.data.strongMatchThreshold, dashboard.strongMatchThreshold);
  });

  await testAsync('a job-scoped dashboard matches too', async () => {
    const tool = await call('getDashboardMetrics', { jobId: job.id });
    const dashboard = await getDashboardOverview({ jobId: job.id });

    assert.deepStrictEqual(tool.data.metrics, dashboard.metrics);
    assert.strictEqual(tool.data.scope.jobId, job.id);
    assert.strictEqual(tool.data.metrics.totalCandidates, 3);
    assert.strictEqual(tool.data.metrics.shortlisted, 1);
  });

  await testAsync('getJobMetrics matches the job summary service exactly', async () => {
    const tool = await call('getJobMetrics', { jobId: job.id });
    const service = await getJobSummaryData(job.id);

    assert.strictEqual(tool.success, true);
    assert.deepStrictEqual(tool.data.stats, service.stats, 'stats must be identical');
    assert.deepStrictEqual(tool.data.scoreBands, service.scoreBands);
    assert.strictEqual(tool.data.stats.candidateCount, 3);
    assert.strictEqual(tool.data.stats.shortlistedCount, 1);
  });

  await testAsync('getPipelineMetrics matches the dashboard pipeline', async () => {
    const tool = await call('getPipelineMetrics', { jobId: job.id });
    const dashboard = await getDashboardOverview({ jobId: job.id });

    assert.deepStrictEqual(tool.data.pipeline, dashboard.pipeline);
    const stageCounts = Object.fromEntries(tool.data.pipeline.map((s) => [s.key, s.count]));
    assert.strictEqual(stageCounts.SHORTLISTED, 1);
    assert.strictEqual(stageCounts.REVIEW, 1);
    assert.strictEqual(stageCounts.NEEDS_REVIEW, 1);
  });

  await testAsync('analytics tools omit candidate collections', async () => {
    const res = await call('getDashboardMetrics', {});
    for (const omitted of ['topCandidates', 'recentCandidates', 'recentHires']) {
      assert.strictEqual(res.data[omitted], undefined, `${omitted} should not be returned`);
      assert.ok(res.metadata.omitted.includes(omitted), `${omitted} should be declared as omitted`);
    }
  });

  await testAsync('analytics tools report an unknown job as not found', async () => {
    const res = await call('getJobMetrics', { jobId: '2f8a1c4e-0b7d-4c3a-9f21-000000000000' });
    assert.strictEqual(res.error.code, 'RESOURCE_NOT_FOUND');
  });

  /* -------------------------------------------------------- permissions -- */

  suite.group('Authorization');

  test('permissions come from the role and an absent user grants nothing', () => {
    assert.strictEqual(resolvePermissions(null).size, 0);
    assert.strictEqual(resolvePermissions({}).size, 0);
    assert.strictEqual(resolvePermissions({ userId: 'u1' }).size, 0, 'a role is required');
    assert.strictEqual(resolvePermissions({ userRole: 'ADMIN' }).size, 0, 'a user id is required');
    assert.strictEqual(resolvePermissions({ userId: 'u1', userRole: 'RECRUITER' }).size, 4);
    assert.strictEqual(resolvePermissions({ userId: 'u1', userRole: 'UNKNOWN_ROLE' }).size, 0);
  });

  test('a role named after an inherited property grants nothing', () => {
    for (const userRole of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      assert.strictEqual(resolvePermissions({ userId: 'u1', userRole }).size, 0, userRole);
    }
  });

  await testAsync('every tool is refused without an authenticated context', async () => {
    const anonymous = normalizeAgentContext({}, { user: null, requestId: 'anon' });
    for (const name of listToolNames()) {
      const res = await executeTool(name, {}, anonymous, { config });
      assert.strictEqual(res.success, false, name);
      assert.strictEqual(res.error.code, 'TOOL_FORBIDDEN', name);
    }
  });

  await testAsync('a null context is refused rather than defaulting to allowed', async () => {
    const res = await executeTool('getJobs', {}, null, { config });
    assert.strictEqual(res.error.code, 'TOOL_FORBIDDEN');
  });

  await testAsync('permission is checked before input validation', async () => {
    const anonymous = normalizeAgentContext({}, { user: null, requestId: 'anon' });
    // Deliberately invalid input; the answer must still be FORBIDDEN, so an
    // unauthorized caller learns nothing about the input contract.
    const res = await executeTool('getJob', { jobId: 'not valid', extra: true }, anonymous, { config });
    assert.strictEqual(res.error.code, 'TOOL_FORBIDDEN');
  });

  await testAsync('a client cannot elevate its role through the context', async () => {
    // AgentContext refuses server-owned keys outright.
    assert.throws(
      () => normalizeAgentContext({ userRole: 'SUPER_ADMIN' }, { user: recruiter }),
      (error) => error.code === 'AI_REQUEST_INVALID'
    );
    assert.throws(
      () => normalizeAgentContext({ userId: 'someone-else' }, { user: recruiter }),
      (error) => error.code === 'AI_REQUEST_INVALID'
    );

    // And the context that is built carries the session's identity, not a claim.
    const built = normalizeAgentContext({}, { user: recruiter });
    assert.strictEqual(built.userId, recruiter.id);
    assert.strictEqual(built.userRole, 'RECRUITER');
  });

  await testAsync('an admin sees exactly what a recruiter sees, and no more', async () => {
    // The application applies no role differentiation today (requireRole is
    // exported but used on no route), so the tool layer must not invent one.
    const asRecruiter = await executeTool('getCandidates', { jobId: job.id }, contextFor(recruiter), { config });
    const asAdmin = await executeTool('getCandidates', { jobId: job.id }, contextFor(admin), { config });

    assert.strictEqual(asRecruiter.success, true);
    assert.strictEqual(asAdmin.success, true);
    assert.deepStrictEqual(
      asRecruiter.data.candidates.map((c) => c.candidateId),
      asAdmin.data.candidates.map((c) => c.candidateId)
    );
    assert.deepStrictEqual(asRecruiter.data.candidates[0], asAdmin.data.candidates[0], 'no extra fields for an admin');
  });

  /* ------------------------------------------------------------ envelope - */

  suite.group('Response envelope and safety');

  await testAsync('a success carries data and metadata; a failure carries a code and message only', async () => {
    const success = await call('getJob', { jobId: job.id });
    assert.deepStrictEqual(Object.keys(success).sort(), ['data', 'metadata', 'success']);
    assert.strictEqual(success.metadata.toolName, 'getJob');
    assert.ok(Number.isFinite(success.metadata.durationMs));

    const failure = await call('getJob', { jobId: 'nope nope' });
    assert.deepStrictEqual(Object.keys(failure).sort(), ['error', 'success']);
    assert.deepStrictEqual(Object.keys(failure.error).sort(), ['code', 'message']);
  });

  await testAsync('no failure response carries a stack trace or an ORM message', async () => {
    const failures = [
      await call('getJob', { jobId: 'bad id' }),
      await call('getJob', { jobId: '2f8a1c4e-0b7d-4c3a-9f21-000000000000' }),
      await call('nonexistentTool', {}),
      await call('getCandidates', { jobId: job.id, limit: 9999 })
    ];

    for (const res of failures) {
      const serialized = JSON.stringify(res);
      assert.strictEqual(res.error.stack, undefined);
      assert.ok(!/at .*\(.*:\d+:\d+\)/.test(serialized), `stack leaked: ${serialized}`);
      assert.ok(!/prisma|PrismaClient|SELECT |invalid `prisma/i.test(serialized), `ORM detail leaked: ${serialized}`);
      assert.ok(!/[A-Z]:\\|\/home\/|node_modules/.test(serialized), `path leaked: ${serialized}`);
    }
  });

  test('the tool layer contains no eval, shell, or filesystem access', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'ai', 'tools');

    // Comments in these files legitimately discuss the hazards being checked
    // for, so they are stripped before scanning — otherwise a doc comment
    // explaining "there is no require() here" would itself trip the check.
    const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    for (const file of fs.readdirSync(dir)) {
      const source = stripComments(fs.readFileSync(path.join(dir, file), 'utf8'));

      assert.ok(!/\beval\s*\(/.test(source), `${file} contains eval(`);
      assert.ok(!/new Function\s*\(/.test(source), `${file} constructs a Function`);
      assert.ok(!/child_process|execSync|spawnSync|\.exec\s*\(/.test(source), `${file} touches a shell`);
      // Every require must take a literal path — never a variable or expression.
      assert.ok(!/require\s*\(\s*[^'")]/.test(source), `${file} builds a dynamic require`);
      assert.ok(!/\bfs\.(read|write|unlink|append)/.test(source), `${file} touches the filesystem`);
    }
  });

  test('no tool module imports Prisma directly', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'ai', 'tools');

    for (const file of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      assert.ok(
        !/require\(['"][^'"]*config\/prisma['"]\)/.test(source),
        `${file} imports the Prisma client — tools must go through a service`
      );
      assert.ok(!/\$queryRaw|\$executeRaw/.test(source), `${file} uses raw SQL`);
    }
  });

  test('the job mapper drops the JD text and internal fields', () => {
    const summary = toAIJobSummary({
      id: 'j1',
      title: 'A Job',
      status: 'OPEN',
      jdText: 'SECRET JD BODY',
      jdMimeType: 'text/plain',
      closedByUserId: 'user-9',
      requirements: { requiredSkills: ['React'] }
    });

    const serialized = JSON.stringify(summary);
    assert.ok(!serialized.includes('SECRET JD BODY'), 'JD text leaked');
    assert.strictEqual(summary.jdText, undefined);
    assert.strictEqual(summary.closedByUserId, undefined);
    assert.strictEqual(summary.jobDescription.characterCount, 14, 'a reference to the JD is kept');
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
