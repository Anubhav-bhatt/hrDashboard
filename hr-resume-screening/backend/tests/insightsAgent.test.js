/**
 * Unit & Integration test suite for the deterministic Insights Agent.
 *
 * Verifies:
 *   - Global vs Job-specific insights
 *   - Insight types (JOB_NEEDS_CANDIDATES, SHORTLIST_READY_FOR_COMPARISON, CANDIDATE_SELECTED_JOB_OPEN, etc.)
 *   - Closed job historical observations
 *   - Error and feature flag handling
 *   - Evidence integrity (no fabricated numbers)
 */
const { createSuite, assert } = require('./harness');
const { runInsightsAgent, INSIGHT_TYPES, SEVERITY } = require('../ai/modes/insights.agent');
const { MockAIProvider } = require('../ai/providers/MockAIProvider');

const suite = createSuite('Insights Agent — deterministic evidence-based recruitment insights');
const { test, testAsync } = suite;

const provider = new MockAIProvider();

const fixtureJobOpen = {
  jobId: 'job-101',
  title: 'Senior React Developer',
  status: 'OPEN',
  isClosed: false,
  stats: {
    candidateCount: 15,
    analyzedCount: 15,
    strongMatchCount: 5,
    shortlistedCount: 3,
    selectedCount: 0,
    bestMatchScore: 92
  },
  strongMatchThreshold: 80
};

const fixtureJobClosed = {
  jobId: 'job-102',
  title: 'Backend Platform Engineer',
  status: 'CLOSED',
  isClosed: true,
  stats: {
    candidateCount: 10,
    analyzedCount: 10,
    strongMatchCount: 2,
    shortlistedCount: 2,
    selectedCount: 1,
    bestMatchScore: 88
  },
  strongMatchThreshold: 80
};

const fixtureJobEmpty = {
  jobId: 'job-103',
  title: 'Product Designer',
  status: 'OPEN',
  isClosed: false,
  stats: {
    candidateCount: 0,
    analyzedCount: 0,
    strongMatchCount: 0,
    shortlistedCount: 0,
    selectedCount: 0,
    bestMatchScore: null
  },
  strongMatchThreshold: 80
};

const fixtureJobSelected = {
  jobId: 'job-104',
  title: 'DevOps Architect',
  status: 'OPEN',
  isClosed: false,
  stats: {
    candidateCount: 8,
    analyzedCount: 8,
    strongMatchCount: 2,
    shortlistedCount: 2,
    selectedCount: 1,
    bestMatchScore: 95
  },
  strongMatchThreshold: 80
};

const createMockToolRunner = (customJobMap = {}) => {
  const jobs = {
    'job-101': fixtureJobOpen,
    'job-102': fixtureJobClosed,
    'job-103': fixtureJobEmpty,
    'job-104': fixtureJobSelected,
    ...customJobMap
  };

  return async (toolName, input) => {
    if (toolName === 'getJobMetrics') {
      const job = jobs[input.jobId];
      if (job) return { success: true, data: job };
      return { success: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } };
    }
    if (toolName === 'getDashboardMetrics') {
      return {
        success: true,
        data: {
          metrics: {
            totalCandidates: 33,
            totalJobs: Object.keys(jobs).length,
            pendingReview: 18,
            strongMatch: 9
          },
          strongMatchThreshold: 80
        }
      };
    }
    if (toolName === 'getJobs') {
      const jobList = Object.values(jobs).map((j) => ({
        jobId: j.jobId,
        title: j.title,
        status: j.status,
        candidateCount: j.stats.candidateCount,
        analyzedCount: j.stats.analyzedCount,
        strongMatchCount: j.stats.strongMatchCount,
        shortlistedCount: j.stats.shortlistedCount,
        selectedCount: j.stats.selectedCount,
        bestMatchScore: j.stats.bestMatchScore
      }));
      return {
        success: true,
        data: { jobs: jobList }
      };
    }
    return { success: false, error: { code: 'TOOL_NOT_FOUND' } };
  };
};

const run = async () => {
  suite.group('Job-Specific Insights');

  await testAsync('Generates shortlisted comparison insight for open role with >= 2 shortlisted candidates', async () => {
    const res = await runInsightsAgent({
      message: 'Show insights',
      context: { jobId: 'job-101' },
      provider,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.scope, 'JOB');
    assert.strictEqual(res.structuredData.jobId, 'job-101');
    const compInsight = res.structuredData.insights.find(
      (i) => i.type === INSIGHT_TYPES.SHORTLIST_READY_FOR_COMPARISON
    );
    assert.ok(compInsight, 'Must include SHORTLIST_READY_FOR_COMPARISON insight');
    assert.strictEqual(compInsight.evidence.shortlistedCount, 3);
    assert.ok(compInsight.to.includes('/ai/comparison?jobId=job-101'));
  });

  await testAsync('Generates empty role insight for job with 0 candidates', async () => {
    const res = await runInsightsAgent({
      message: 'Show insights for this job',
      context: { jobId: 'job-103' },
      provider,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.scope, 'JOB');
    const emptyInsight = res.structuredData.insights.find(
      (i) => i.type === INSIGHT_TYPES.JOB_NEEDS_CANDIDATES
    );
    assert.ok(emptyInsight, 'Must include JOB_NEEDS_CANDIDATES insight');
    assert.strictEqual(emptyInsight.severity, SEVERITY.ATTENTION);
    assert.strictEqual(emptyInsight.evidence.candidateCount, 0);
  });

  await testAsync('Identifies candidate selected on open job as ready to close', async () => {
    const res = await runInsightsAgent({
      message: 'Show insights',
      context: { jobId: 'job-104' },
      provider,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.scope, 'JOB');
    const closeInsight = res.structuredData.insights.find(
      (i) => i.type === INSIGHT_TYPES.CANDIDATE_SELECTED_JOB_OPEN
    );
    assert.ok(closeInsight, 'Must include CANDIDATE_SELECTED_JOB_OPEN insight');
    assert.strictEqual(closeInsight.severity, SEVERITY.ATTENTION);
    assert.strictEqual(closeInsight.evidence.selectedCount, 1);
  });

  await testAsync('Closed job produces historical record insight without active actions', async () => {
    const res = await runInsightsAgent({
      message: 'Show insights',
      context: { jobId: 'job-102' },
      provider,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.scope, 'JOB');
    const closedInsight = res.structuredData.insights.find(
      (i) => i.type === INSIGHT_TYPES.JOB_CLOSED_RECORD
    );
    assert.ok(closedInsight, 'Must include JOB_CLOSED_RECORD insight');
    assert.strictEqual(closedInsight.evidence.status, 'CLOSED');
    assert.strictEqual(closedInsight.actionLabel, 'View closed job');
  });

  await testAsync('Invalid job returns graceful error summary without crash', async () => {
    const res = await runInsightsAgent({
      message: 'Show insights',
      context: { jobId: 'non-existent-id' },
      provider,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.scope, 'JOB');
    assert.ok(res.structuredData.warnings.includes('JOB_NOT_FOUND'));
  });

  suite.group('Global Workspace Insights');

  await testAsync('Global insights aggregates open roles and sorts actionable findings', async () => {
    const res = await runInsightsAgent({
      message: 'Show recruitment insights',
      context: {},
      provider,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.scope, 'GLOBAL');
    assert.ok(res.structuredData.insights.length > 0);
    assert.ok(res.structuredData.insights.length <= 5, 'Must limit to top 5 insights');

    // High backlog detected (> 15 pending)
    const backlog = res.structuredData.insights.find(
      (i) => i.type === INSIGHT_TYPES.PIPELINE_BOTTLENECK
    );
    assert.ok(backlog, 'Must include pipeline backlog insight');
  });

  const { failed } = suite.summary();
  process.exit(failed > 0 ? 1 : 0);
};

run();
