/**
 * Screening Agent unit & integration tests.
 */
const { createSuite, assert } = require('./harness');
const { runScreeningAgent } = require('../ai/modes/screening.agent');
const { MockAIProvider } = require('../ai/providers/MockAIProvider');
const {
  computeFitLevel,
  evaluateSkills,
  detectMandatoryGaps,
  evaluateExperience,
  evaluatePriorityInstruction,
  computeRecommendation
} = require('../ai/modes/analysis.helpers');

const suite = createSuite('Screening Agent — context validation, evidence, and deterministic analysis');
const { test, testAsync } = suite;

const provider = new MockAIProvider();

const mockContext = {
  requestId: 'req-screen-1',
  userId: 'user-1',
  jobId: 'job-101',
  candidateIds: ['cand-201'],
  filters: {}
};

const fixtureJob = {
  jobId: 'job-101',
  title: 'Senior React Developer',
  status: 'OPEN',
  requirements: {
    requiredSkills: ['React', 'TypeScript', 'JavaScript'],
    preferredSkills: ['Next.js', 'Tailwind CSS'],
    minimumExperience: 4,
    preferredLocations: ['Bengaluru', 'Remote'],
    salaryRange: { min: 1500000, max: 2500000, currency: 'INR' }
  }
};

const fixtureCandidate = {
  candidateId: 'cand-201',
  jobId: 'job-101',
  name: 'Rahul Sharma',
  skills: ['React', 'TypeScript', 'JavaScript', 'Next.js', 'Redux'],
  experience: { statedYears: 5, computedYears: 5.2 },
  location: { current: 'Bengaluru' },
  compensation: { expectedSalary: 2000000 },
  score: { isScored: true, overallScore: 88, alignmentLabel: 'Strong Match' }
};

const createMockToolRunner = (overrides = {}) => {
  return async (toolName, input) => {
    if (overrides[toolName]) return overrides[toolName](input);
    if (toolName === 'getJob') return { success: true, data: { job: fixtureJob } };
    if (toolName === 'getJobRequirements') return { success: true, data: { requirements: fixtureJob.requirements } };
    if (toolName === 'getCandidate') return { success: true, data: { candidate: fixtureCandidate } };
    if (toolName === 'getCandidateScore') return { success: true, data: fixtureCandidate.score };
    if (toolName === 'getScoringBreakdown') {
      return {
        success: true,
        data: {
          isScored: true,
          overallScore: 88,
          breakdown: { requiredSkills: { points: 36, maxPoints: 40 } },
          skills: { matched: ['React', 'TypeScript'], missingRequired: [] },
          strengths: ['Strong React experience'],
          gaps: []
        }
      };
    }
    return { success: false, error: { code: 'TOOL_NOT_FOUND', message: 'No mock for tool' } };
  };
};

const run = async () => {
  suite.group('Context validation');

  await testAsync('Refuses execution when jobId is missing', async () => {
    let thrown = null;
    try {
      await runScreeningAgent({
        message: 'Analyze',
        context: { candidateIds: ['cand-1'] },
        provider,
        toolRunner: createMockToolRunner()
      });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown, 'Must throw error');
    assert.strictEqual(thrown.code, 'SCREENING_JOB_REQUIRED');
  });

  await testAsync('Refuses execution when candidateIds is empty', async () => {
    let thrown = null;
    try {
      await runScreeningAgent({
        message: 'Analyze',
        context: { jobId: 'job-1', candidateIds: [] },
        provider,
        toolRunner: createMockToolRunner()
      });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown, 'Must throw error');
    assert.strictEqual(thrown.code, 'SCREENING_CANDIDATE_REQUIRED');
  });

  await testAsync('Refuses execution when candidateIds contains multiple candidates', async () => {
    let thrown = null;
    try {
      await runScreeningAgent({
        message: 'Analyze',
        context: { jobId: 'job-1', candidateIds: ['cand-1', 'cand-2'] },
        provider,
        toolRunner: createMockToolRunner()
      });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown, 'Must throw error');
    assert.strictEqual(thrown.code, 'SCREENING_INVALID_CANDIDATE_COUNT');
  });

  await testAsync('Refuses candidate from mismatched job', async () => {
    const mismatchedRunner = createMockToolRunner({
      getCandidate: async () => ({
        success: true,
        data: { candidate: { ...fixtureCandidate, jobId: 'different-job-999' } }
      })
    });

    let thrown = null;
    try {
      await runScreeningAgent({
        message: 'Analyze',
        context: mockContext,
        provider,
        toolRunner: mismatchedRunner
      });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown, 'Must throw on mismatch');
    assert.strictEqual(thrown.code, 'SCREENING_CANDIDATE_MISMATCH');
  });

  suite.group('Deterministic screening execution');

  await testAsync('Executes complete screening for qualified candidate', async () => {
    const result = await runScreeningAgent({
      message: 'Analyze fit',
      context: mockContext,
      provider,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(result.mode, 'screening');
    assert.strictEqual(result.provider, 'mock');
    assert.ok(result.structuredData, 'Must return structuredData');

    const data = result.structuredData;
    assert.strictEqual(data.candidateId, 'cand-201');
    assert.strictEqual(data.candidateName, 'Rahul Sharma');
    assert.strictEqual(data.jobId, 'job-101');
    assert.strictEqual(data.overallScore, 88);
    assert.strictEqual(data.fitLevel, 'STRONG');
    assert.strictEqual(data.recommendation, 'PROCEED_TO_REVIEW');
    assert.ok(data.strengths.length > 0, 'Must have strengths');
    assert.strictEqual(data.mandatoryGaps.length, 0, 'No mandatory gaps for qualified candidate');
    assert.ok(data.criteria.length >= 3, 'Must have evaluated criteria rows');
  });

  await testAsync('Prominently flags missing mandatory skill even with high score', async () => {
    const missingMandatoryRunner = createMockToolRunner({
      getCandidate: async () => ({
        success: true,
        data: {
          candidate: {
            ...fixtureCandidate,
            skills: ['React', 'JavaScript'], // Missing TypeScript
            score: { isScored: true, overallScore: 85 }
          }
        }
      }),
      getCandidateScore: async () => ({
        success: true,
        data: { isScored: true, overallScore: 85, alignmentLabel: 'Strong Match' }
      })
    });

    const result = await runScreeningAgent({
      message: 'Check candidate',
      context: mockContext,
      provider,
      toolRunner: missingMandatoryRunner
    });

    const data = result.structuredData;
    assert.strictEqual(data.overallScore, 85);
    assert.ok(data.mandatoryGaps.includes('TypeScript'), 'Must explicitly list TypeScript as mandatory gap');
    assert.strictEqual(data.recommendation, 'REVIEW_WITH_CAUTION', 'Must recommend review with caution when mandatory skill is missing');
    assert.ok(data.gaps.some((g) => g.includes('TypeScript')), 'Gaps list must contain TypeScript');
  });

  await testAsync('Handles unscored candidate with INSUFFICIENT_DATA and data warnings', async () => {
    const unscoredRunner = createMockToolRunner({
      getCandidate: async () => ({
        success: true,
        data: {
          candidate: {
            ...fixtureCandidate,
            score: { isScored: false, overallScore: null }
          }
        }
      }),
      getCandidateScore: async () => ({
        success: true,
        data: { isScored: false, overallScore: null }
      }),
      getScoringBreakdown: async () => ({
        success: true,
        data: { isScored: false, overallScore: null }
      })
    });

    const result = await runScreeningAgent({
      message: 'Screen new candidate',
      context: mockContext,
      provider,
      toolRunner: unscoredRunner
    });

    const data = result.structuredData;
    assert.strictEqual(data.overallScore, null);
    assert.strictEqual(data.fitLevel, 'INSUFFICIENT_DATA');
    assert.strictEqual(data.recommendation, 'NEEDS_MORE_INFORMATION');
    assert.ok(data.dataWarnings.some((w) => w.includes('matching engine') || w.includes('evaluated')), 'Must warn unscored');
  });

  await testAsync('Output is 100% deterministic across repeated runs', async () => {
    const runner = createMockToolRunner();
    const run1 = await runScreeningAgent({ message: 'Evaluate', context: mockContext, provider, toolRunner: runner });
    const run2 = await runScreeningAgent({ message: 'Evaluate', context: mockContext, provider, toolRunner: runner });

    assert.deepStrictEqual(run1.structuredData, run2.structuredData, 'Repeated screening calls must produce identical structured results');
  });

  suite.group('Analysis helper unit logic');

  test('computeFitLevel accurately classifies score bands', () => {
    assert.strictEqual(computeFitLevel(95), 'VERY_STRONG');
    assert.strictEqual(computeFitLevel(85), 'STRONG');
    assert.strictEqual(computeFitLevel(72), 'MODERATE');
    assert.strictEqual(computeFitLevel(50), 'WEAK');
    assert.strictEqual(computeFitLevel(null, false), 'INSUFFICIENT_DATA');
  });

  test('evaluateSkills splits matched vs missing mandatory and preferred skills', () => {
    const res = evaluateSkills(['React', 'TypeScript', 'Node.js'], ['AWS', 'Docker'], ['React', 'TypeScript', 'Docker']);
    assert.deepStrictEqual(res.matchedRequired, ['React', 'TypeScript']);
    assert.deepStrictEqual(res.missingRequired, ['Node.js']);
    assert.deepStrictEqual(res.matchedPreferred, ['Docker']);
    assert.deepStrictEqual(res.missingPreferred, ['AWS']);
    assert.strictEqual(res.hasMandatoryGaps, true);
  });

  test('evaluatePriorityInstruction parses recruiter instructions deterministically', () => {
    const res1 = evaluatePriorityInstruction('Please focus on AWS and Docker', { skills: ['AWS', 'React'] }, { requiredSkills: ['React'], preferredSkills: ['AWS'] });
    assert.strictEqual(res1.applied, true);
    assert.ok(res1.matches.includes('AWS'));

    const res2 = evaluatePriorityInstruction('Check communication skills', { skills: ['React'] }, { requiredSkills: ['React'] });
    assert.strictEqual(res2.applied, false);
  });

  const { failed } = suite.summary();
  process.exit(failed > 0 ? 1 : 0);
};

run();
