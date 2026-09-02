/**
 * Ranking Agent unit & integration tests.
 */
const { createSuite, assert } = require('./harness');
const { runRankingAgent } = require('../ai/modes/ranking.agent');
const { MockAIProvider } = require('../ai/providers/MockAIProvider');

const suite = createSuite('Ranking Agent — score integrity, deterministic tie-breaks, and filters');
const { test, testAsync } = suite;

const provider = new MockAIProvider();

const fixtureJob = {
  jobId: 'job-101',
  title: 'Senior React Developer',
  status: 'OPEN',
  requirements: {
    requiredSkills: ['React', 'TypeScript', 'Redux'],
    preferredSkills: ['Next.js', 'Tailwind CSS', 'AWS'],
    minimumExperience: 4,
    preferredLocations: ['Bengaluru'],
    salaryRange: { min: 1500000, max: 2500000, currency: 'INR' }
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
    name: 'Priya Patel',
    skills: ['React', 'Redux', 'AWS'], // Missing TypeScript (mandatory gap)
    experience: { statedYears: 6 },
    status: { hrStatus: 'SHORTLISTED', isShortlisted: true },
    score: { isScored: true, overallScore: 88 }
  },
  {
    candidateId: 'cand-3',
    name: 'Amit Kumar',
    skills: ['React', 'TypeScript', 'Redux', 'AWS'],
    experience: { statedYears: 4 },
    status: { hrStatus: 'APPLIED', isShortlisted: false },
    score: { isScored: true, overallScore: 88 }
  },
  {
    candidateId: 'cand-4',
    name: 'Sneha Verma',
    skills: ['React', 'JavaScript'],
    experience: { statedYears: 2 },
    status: { hrStatus: 'APPLIED', isShortlisted: false },
    score: { isScored: true, overallScore: 60 }
  },
  {
    candidateId: 'cand-5',
    name: 'Vikram Singh',
    skills: ['React'],
    experience: { statedYears: null },
    status: { hrStatus: 'APPLIED', isShortlisted: false },
    score: { isScored: false, overallScore: null }
  }
];

const createMockToolRunner = (candidates = fixtureCandidates) => {
  return async (toolName, input) => {
    if (toolName === 'getJob') return { success: true, data: { job: fixtureJob } };
    if (toolName === 'getJobRequirements') return { success: true, data: { requirements: fixtureJob.requirements } };
    if (toolName === 'getCandidates' || toolName === 'searchCandidates') {
      let filtered = [...candidates];
      if (input.status === 'SHORTLISTED') {
        filtered = filtered.filter((c) => c.status?.isShortlisted);
      }
      if (input.minimumScore !== undefined && input.minimumScore !== null) {
        filtered = filtered.filter((c) => c.score?.isScored && c.score.overallScore >= input.minimumScore);
      }
      return {
        success: true,
        data: { candidates: filtered },
        metadata: { totalMatching: filtered.length, limit: input.limit }
      };
    }
    return { success: false, error: { code: 'TOOL_NOT_FOUND', message: 'No mock' } };
  };
};

const run = async () => {
  suite.group('Validation');

  await testAsync('Refuses ranking without jobId', async () => {
    let thrown = null;
    try {
      await runRankingAgent({
        message: '',
        context: {},
        provider,
        toolRunner: createMockToolRunner()
      });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown);
    assert.strictEqual(thrown.code, 'RANKING_JOB_REQUIRED');
  });

  await testAsync('Refuses invalid candidateScope', async () => {
    let thrown = null;
    try {
      await runRankingAgent({
        message: '',
        context: { jobId: 'job-101', candidateScope: 'INVALID_SCOPE' },
        provider,
        toolRunner: createMockToolRunner()
      });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown);
    assert.strictEqual(thrown.code, 'RANKING_INVALID_SCOPE');
  });

  await testAsync('Safely defaults candidateScope to ALL when absent or null', async () => {
    const resultNull = await runRankingAgent({
      message: '',
      context: { jobId: 'job-101', candidateScope: null },
      provider,
      toolRunner: createMockToolRunner()
    });
    assert.strictEqual(resultNull.structuredData.candidateScope, 'ALL');

    const resultAbsent = await runRankingAgent({
      message: '',
      context: { jobId: 'job-101' },
      provider,
      toolRunner: createMockToolRunner()
    });
    assert.strictEqual(resultAbsent.structuredData.candidateScope, 'ALL');
  });

  suite.group('Score integrity and ranking order');

  await testAsync('Preserves exact stored match scores without modification', async () => {
    const result = await runRankingAgent({
      message: '',
      context: { jobId: 'job-101', candidateScope: 'ALL' },
      provider,
      toolRunner: createMockToolRunner()
    });

    const ranked = result.structuredData.rankedCandidates;
    assert.strictEqual(ranked.length, 5);

    // Assert every candidate's matchScore matches their stored score exactly
    for (const item of ranked) {
      const original = fixtureCandidates.find((c) => c.candidateId === item.candidateId);
      assert.ok(original, `Candidate ${item.candidateId} must exist in original list`);
      assert.strictEqual(
        item.matchScore,
        original.score.overallScore,
        `Match score for ${item.candidateName} must match stored score (${original.score.overallScore})`
      );
    }
  });

  await testAsync('Orders candidates primarily by match score descending with unscored last', async () => {
    const result = await runRankingAgent({
      message: '',
      context: { jobId: 'job-101', candidateScope: 'ALL' },
      provider,
      toolRunner: createMockToolRunner()
    });

    const ranked = result.structuredData.rankedCandidates;
    assert.strictEqual(ranked[0].candidateId, 'cand-1', '#1 should be highest score (92)');
    assert.strictEqual(ranked[0].rank, 1);
    assert.strictEqual(ranked[0].matchScore, 92);

    // Last candidate should be unscored
    const last = ranked[ranked.length - 1];
    assert.strictEqual(last.candidateId, 'cand-5', 'Unscored candidate must be ranked last');
    assert.strictEqual(last.matchScore, null);
    assert.strictEqual(last.fitLevel, 'INSUFFICIENT_DATA');
  });

  await testAsync('Breaks ties using mandatory requirement gaps (fewer gaps ranks higher)', async () => {
    // cand-2 (score 88, missing TypeScript) vs cand-3 (score 88, has TypeScript)
    const result = await runRankingAgent({
      message: '',
      context: { jobId: 'job-101', candidateScope: 'ALL' },
      provider,
      toolRunner: createMockToolRunner()
    });

    const ranked = result.structuredData.rankedCandidates;
    const cand3Rank = ranked.find((c) => c.candidateId === 'cand-3').rank;
    const cand2Rank = ranked.find((c) => c.candidateId === 'cand-2').rank;

    assert.ok(
      cand3Rank < cand2Rank,
      `cand-3 (no mandatory gaps) must rank higher than cand-2 (missing TypeScript) when scores are equal`
    );

    const cand2Item = ranked.find((c) => c.candidateId === 'cand-2');
    assert.ok(cand2Item.mandatoryGaps.includes('TypeScript'), 'cand-2 must display mandatory gap: TypeScript');
  });

  suite.group('Candidate scopes and filters');

  await testAsync('Filters to SHORTLISTED candidates only when scope is SHORTLISTED', async () => {
    const result = await runRankingAgent({
      message: '',
      context: { jobId: 'job-101', candidateScope: 'SHORTLISTED' },
      provider,
      toolRunner: createMockToolRunner()
    });

    const ranked = result.structuredData.rankedCandidates;
    assert.strictEqual(ranked.length, 2, 'Only shortlisted candidates returned');
    assert.ok(ranked.every((c) => c.isShortlisted));
  });

  await testAsync('Filters candidates by minimumScore', async () => {
    const result = await runRankingAgent({
      message: '',
      context: { jobId: 'job-101', candidateScope: 'ALL', filters: { minimumScore: 80 } },
      provider,
      toolRunner: createMockToolRunner()
    });

    const ranked = result.structuredData.rankedCandidates;
    assert.strictEqual(ranked.length, 3, 'Only candidates with score >= 80');
    assert.ok(ranked.every((c) => c.matchScore >= 80));
  });

  suite.group('Recruiter instruction & priority signals');

  await testAsync('Applies priority instruction without changing authoritative scores', async () => {
    const result = await runRankingAgent({
      message: 'Prioritize candidates with AWS experience',
      context: { jobId: 'job-101', candidateScope: 'ALL' },
      provider,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(result.structuredData.instructionApplied, true);

    const cand2 = result.structuredData.rankedCandidates.find((c) => c.candidateId === 'cand-2');
    assert.strictEqual(cand2.matchScore, 88, 'Score must remain 88');
    assert.strictEqual(cand2.priorityMatch, true, 'Priority match flag must be true');
    assert.ok(cand2.prioritySignals.some((s) => s.includes('AWS')));
  });

  suite.group('Deterministic Repeatability');

  await testAsync('Same evidence and instruction produces 100% identical ranking results', async () => {
    const runner = createMockToolRunner();
    const run1 = await runRankingAgent({
      message: 'Focus on AWS',
      context: { jobId: 'job-101', candidateScope: 'ALL' },
      provider,
      toolRunner: runner
    });
    const run2 = await runRankingAgent({
      message: 'Focus on AWS',
      context: { jobId: 'job-101', candidateScope: 'ALL' },
      provider,
      toolRunner: runner
    });

    assert.deepStrictEqual(run1.structuredData, run2.structuredData, 'Ranking outputs must be identical');
  });

  const { failed } = suite.summary();
  process.exit(failed > 0 ? 1 : 0);
};

run();
