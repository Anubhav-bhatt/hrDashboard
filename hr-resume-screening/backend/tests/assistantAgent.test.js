/**
 * AI Assistant Agent unit & orchestration integration tests.
 */
const { createSuite, assert } = require('./harness');
const { runAssistantAgent, parseIntent } = require('../ai/modes/assistant.agent');
const { MockAIProvider } = require('../ai/providers/MockAIProvider');

const suite = createSuite('AI Assistant Orchestrator — intent routing, context resolution & specialist delegation');
const { test, testAsync } = suite;

const provider = new MockAIProvider();

const fixtureJobOpen = {
  jobId: 'job-101',
  title: 'Senior React Developer',
  status: 'OPEN',
  requirements: {
    requiredSkills: ['React', 'TypeScript', 'Redux'],
    preferredSkills: ['Next.js', 'Tailwind CSS', 'AWS'],
    minimumExperience: 4,
    preferredLocations: ['Bengaluru']
  }
};

const fixtureJobClosed = {
  jobId: 'job-102',
  title: 'Backend Lead (Closed)',
  status: 'CLOSED',
  requirements: {
    requiredSkills: ['Node.js', 'PostgreSQL'],
    minimumExperience: 6
  }
};

const fixtureCandidates = [
  {
    candidateId: 'cand-1',
    name: 'Rahul Sharma',
    skills: ['React', 'TypeScript', 'Redux', 'Next.js'],
    experience: { statedYears: 5 },
    status: { hrStatus: 'SHORTLISTED', isShortlisted: true },
    score: { isScored: true, overallScore: 92 }
  },
  {
    candidateId: 'cand-2',
    name: 'Rahul Verma',
    skills: ['React', 'TypeScript', 'AWS'],
    experience: { statedYears: 4 },
    status: { hrStatus: 'SHORTLISTED', isShortlisted: true },
    score: { isScored: true, overallScore: 88 }
  },
  {
    candidateId: 'cand-3',
    name: 'Priya Patel',
    skills: ['React', 'Redux', 'AWS'],
    experience: { statedYears: 6 },
    status: { hrStatus: 'SHORTLISTED', isShortlisted: true },
    score: { isScored: true, overallScore: 85 }
  }
];

const mockConfigEnabled = {
  enabled: true,
  provider: 'mock',
  modes: {
    assistant: true,
    screening: true,
    ranking: true,
    comparison: true,
    insights: true
  }
};

const createMockToolRunner = (job = fixtureJobOpen, candidates = fixtureCandidates) => {
  return async (toolName, input) => {
    if (toolName === 'getJob') {
      if (input.jobId === job.jobId) return { success: true, data: { job } };
      return { success: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } };
    }
    if (toolName === 'getJobRequirements') {
      return { success: true, data: { requirements: job.requirements } };
    }
    if (toolName === 'getCandidate') {
      const found = candidates.find((c) => c.candidateId === input.candidateId);
      if (found) return { success: true, data: { candidate: { ...found, jobId: job.jobId } } };
      return { success: false, error: { code: 'CANDIDATE_NOT_FOUND', message: 'Candidate not found' } };
    }
    if (toolName === 'getCandidates' || toolName === 'searchCandidates') {
      let filtered = candidates.map((c) => ({ ...c, jobId: job.jobId }));
      if (input.search) {
        const query = input.search.toLowerCase();
        filtered = filtered.filter((c) => c.name.toLowerCase().includes(query));
      }
      return {
        success: true,
        data: { candidates: filtered },
        metadata: { totalMatching: filtered.length, limit: input.limit || 50 }
      };
    }
    if (toolName === 'getCandidateScore' || toolName === 'getScoringBreakdown') {
      const found = candidates.find((c) => c.candidateId === input.candidateId);
      if (found) {
        return {
          success: true,
          data: {
            isScored: true,
            overallScore: found.score.overallScore,
            alignmentLabel: 'STRONG',
            breakdown: {}
          }
        };
      }
      return { success: false, error: { code: 'SCORE_NOT_FOUND' } };
    }
    return { success: false, error: { code: 'TOOL_NOT_FOUND', message: 'No mock' } };
  };
};

const run = async () => {
  suite.group('Deterministic Intent Parsing');

  test('Parses RANK_CANDIDATES intent', () => {
    assert.strictEqual(parseIntent('Rank candidates').intent, 'RANK_CANDIDATES');
    assert.strictEqual(parseIntent('Rank candidate pool for this role').intent, 'RANK_CANDIDATES');
  });

  test('Parses COMPARE_CANDIDATES intent', () => {
    const p1 = parseIntent('Compare top 2');
    assert.strictEqual(p1.intent, 'COMPARE_CANDIDATES');
    assert.strictEqual(p1.targetCount, 2);

    const p2 = parseIntent('Compare top 3 candidates');
    assert.strictEqual(p2.intent, 'COMPARE_CANDIDATES');
    assert.strictEqual(p2.targetCount, 3);
  });

  test('Parses RANK_AND_COMPARE intent', () => {
    const p = parseIntent('Rank candidates and compare top 3');
    assert.strictEqual(p.intent, 'RANK_AND_COMPARE');
    assert.strictEqual(p.targetCount, 3);
  });

  test('Parses SCREEN_CANDIDATE intent', () => {
    const p1 = parseIntent('Screen Rahul');
    assert.strictEqual(p1.intent, 'SCREEN_CANDIDATE');
    assert.strictEqual(p1.targetCandidate.name.toLowerCase(), 'rahul');

    const p2 = parseIntent('Screen the first candidate');
    assert.strictEqual(p2.intent, 'SCREEN_CANDIDATE');
    assert.strictEqual(p2.position || p2.targetCandidate?.position, 1);
  });

  test('Parses GENERAL_HELP intent', () => {
    assert.strictEqual(parseIntent('What can you help me with?').intent, 'GENERAL_HELP');
    assert.strictEqual(parseIntent('help').intent, 'GENERAL_HELP');
  });

  suite.group('Orchestration Scenarios & Context Resolution');

  await testAsync('Scenario A: Current job + "Rank candidates" -> invokes Ranking directly without clarification', async () => {
    const res = await runAssistantAgent({
      message: 'Rank candidates for this role',
      context: { jobId: 'job-101' },
      provider,
      config: mockConfigEnabled,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.intent, 'RANK_CANDIDATES');
    assert.strictEqual(res.structuredData.status, 'SUCCESS');
    assert.strictEqual(res.structuredData.specialistMode, 'ranking');
    assert.strictEqual(res.structuredData.candidateIds.length, 3);
    assert.ok(res.content.includes('Ranking complete for'));
    assert.ok(res.structuredData.suggestedActions.some((a) => a.action === 'compare_candidates'));
  });

  await testAsync('Scenario B: Ranking -> "Compare top 2" using lastRankingCandidateIds', async () => {
    const res = await runAssistantAgent({
      message: 'Compare top 2',
      context: {
        jobId: 'job-101',
        lastRankingCandidateIds: ['cand-1', 'cand-2', 'cand-3']
      },
      provider,
      config: mockConfigEnabled,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.intent, 'COMPARE_CANDIDATES');
    assert.strictEqual(res.structuredData.status, 'SUCCESS');
    assert.strictEqual(res.structuredData.specialistMode, 'comparison');
    assert.deepStrictEqual(res.structuredData.candidateIds, ['cand-1', 'cand-2']);
    assert.ok(res.content.includes('Compared'));
  });

  await testAsync('Scenario C: "Rank candidates and compare top 3"', async () => {
    const res = await runAssistantAgent({
      message: 'Rank candidates and compare top 3',
      context: { jobId: 'job-101' },
      provider,
      config: mockConfigEnabled,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.intent, 'RANK_AND_COMPARE');
    assert.strictEqual(res.structuredData.status, 'SUCCESS');
    assert.strictEqual(res.structuredData.specialistMode, 'comparison');
    assert.deepStrictEqual(res.structuredData.candidateIds, ['cand-1', 'cand-2', 'cand-3']);
  });

  await testAsync('Scenario D: Comparison -> "Screen first candidate" resolves lastComparisonCandidateIds[0]', async () => {
    const res = await runAssistantAgent({
      message: 'Screen the first candidate',
      context: {
        jobId: 'job-101',
        lastComparisonCandidateIds: ['cand-3', 'cand-1']
      },
      provider,
      config: mockConfigEnabled,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.intent, 'SCREEN_CANDIDATE');
    assert.strictEqual(res.structuredData.status, 'SUCCESS');
    assert.strictEqual(res.structuredData.specialistMode, 'screening');
    assert.deepStrictEqual(res.structuredData.candidateIds, ['cand-3']);
    assert.ok(res.content.includes('Priya Patel'));
  });

  await testAsync('Scenario E: No job + "Rank candidates" -> asks for clarification', async () => {
    const res = await runAssistantAgent({
      message: 'Rank candidates',
      context: {},
      provider,
      config: mockConfigEnabled,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.intent, 'RANK_CANDIDATES');
    assert.strictEqual(res.structuredData.status, 'CLARIFICATION_REQUIRED');
    assert.ok(res.content.includes('Choose a job'));
  });

  await testAsync('Scenario F: Ambiguous candidate name ("Rahul") -> presents candidate selector', async () => {
    const res = await runAssistantAgent({
      message: 'Screen Rahul',
      context: { jobId: 'job-101' },
      provider,
      config: mockConfigEnabled,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.intent, 'SCREEN_CANDIDATE');
    assert.strictEqual(res.structuredData.status, 'CLARIFICATION_REQUIRED');
    assert.ok(/Multiple candidates match "rahul"/i.test(res.content));
    assert.strictEqual(res.structuredData.suggestedActions.length, 2);
    assert.strictEqual(res.structuredData.suggestedActions[0].label, 'Screen Rahul Sharma');
    assert.strictEqual(res.structuredData.suggestedActions[1].label, 'Screen Rahul Verma');
  });

  await testAsync('Scenario G: Invalid / non-existent candidate ("Screen NonExistent") -> safe not-found response', async () => {
    const res = await runAssistantAgent({
      message: 'Screen NonExistent',
      context: { jobId: 'job-101' },
      provider,
      config: mockConfigEnabled,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.intent, 'SCREEN_CANDIDATE');
    assert.strictEqual(res.structuredData.status, 'NOT_FOUND');
    assert.ok(/Candidate "NonExistent" was not found/i.test(res.content));
  });

  await testAsync('Scenario I: Closed job + "Rank candidates" -> restricted action message', async () => {
    const res = await runAssistantAgent({
      message: 'Rank candidates',
      context: { jobId: 'job-102' },
      provider,
      config: mockConfigEnabled,
      toolRunner: createMockToolRunner(fixtureJobClosed)
    });

    assert.strictEqual(res.structuredData.intent, 'RANK_CANDIDATES');
    assert.strictEqual(res.structuredData.status, 'RESTRICTED');
    assert.ok(res.content.includes('closed'));
  });

  await testAsync('Scenario J & K: Feature flag disabled -> returns clear unavailable message', async () => {
    const disabledConfig = {
      enabled: true,
      provider: 'mock',
      modes: {
        assistant: true,
        screening: true,
        ranking: false,
        comparison: false,
        insights: true
      }
    };

    const resRank = await runAssistantAgent({
      message: 'Rank candidates',
      context: { jobId: 'job-101' },
      provider,
      config: disabledConfig,
      toolRunner: createMockToolRunner()
    });
    assert.strictEqual(resRank.structuredData.status, 'UNAVAILABLE');
    assert.ok(resRank.content.includes('Ranking capability is currently disabled'));

    const resComp = await runAssistantAgent({
      message: 'Compare top 2',
      context: { jobId: 'job-101' },
      provider,
      config: disabledConfig,
      toolRunner: createMockToolRunner()
    });
    assert.strictEqual(resComp.structuredData.status, 'UNAVAILABLE');
    assert.ok(resComp.content.includes('Comparison capability is currently disabled'));
  });

  const { failed } = suite.summary();
  process.exit(failed > 0 ? 1 : 0);
};

run();
