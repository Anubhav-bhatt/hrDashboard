/**
 * Insights Agent mode logic.
 *
 * Coordinates deterministic evidence-based recruitment insights using controlled
 * read-only tools:
 *   - getJobMetrics
 *   - getDashboardMetrics
 *   - getPipelineMetrics
 *   - getJobs
 *
 * Does not use speculative LLM text or ungrounded predictions.
 * Every insight is backed by authoritative counts and system thresholds.
 */
const { executeTool } = require('../tools/toolRegistry');

/** Supported deterministic insight category constants */
const INSIGHT_TYPES = Object.freeze({
  JOB_NEEDS_CANDIDATES: 'JOB_NEEDS_CANDIDATES',
  JOB_READY_FOR_REVIEW: 'JOB_READY_FOR_REVIEW',
  STRONG_MATCHES_AVAILABLE: 'STRONG_MATCHES_AVAILABLE',
  SHORTLIST_READY_FOR_COMPARISON: 'SHORTLIST_READY_FOR_COMPARISON',
  CANDIDATE_SELECTED_JOB_OPEN: 'CANDIDATE_SELECTED_JOB_OPEN',
  LOW_MATCH_POOL: 'LOW_MATCH_POOL',
  PIPELINE_BOTTLENECK: 'PIPELINE_BOTTLENECK',
  JOB_CLOSED_RECORD: 'JOB_CLOSED_RECORD',
  NO_ACTION_REQUIRED: 'NO_ACTION_REQUIRED'
});

/** Severity classification */
const SEVERITY = Object.freeze({
  INFO: 'INFO',
  ATTENTION: 'ATTENTION',
  HIGH: 'HIGH'
});

/**
 * Builds deterministic insights for a single job based on its authoritative summary.
 *
 * @param {Object} jobData Job summary payload from getJobMetrics
 * @returns {Array<Object>} List of structured insights
 */
const evaluateJobInsights = (jobData) => {
  const insights = [];
  const { jobId, title, status, isClosed, stats, strongMatchThreshold = 80 } = jobData;

  const candidateCount = stats?.candidateCount ?? 0;
  const analyzedCount = stats?.analyzedCount ?? 0;
  const strongMatchCount = stats?.strongMatchCount ?? 0;
  const shortlistedCount = stats?.shortlistedCount ?? 0;
  const selectedCount = stats?.selectedCount ?? 0;
  const bestMatchScore = stats?.bestMatchScore ?? null;

  // Closed job: historical observation only
  if (status === 'CLOSED' || isClosed) {
    insights.push({
      type: INSIGHT_TYPES.JOB_CLOSED_RECORD,
      severity: SEVERITY.INFO,
      title: `${title} is closed`,
      message: 'This role is closed. Historical records, candidate evaluations and outcomes are preserved.',
      jobId,
      jobTitle: title,
      evidence: {
        status: 'CLOSED',
        candidateCount,
        selectedCount
      },
      recommendedAction: 'VIEW_CLOSED_JOB',
      actionLabel: 'View closed job',
      to: `/jobs/${jobId}`
    });
    return insights;
  }

  // 1. Candidate selected on open job -> Priority Attention to close
  if (selectedCount > 0) {
    insights.push({
      type: INSIGHT_TYPES.CANDIDATE_SELECTED_JOB_OPEN,
      severity: SEVERITY.ATTENTION,
      title: `${title} is ready to close`,
      message: `${selectedCount} candidate(s) have been selected for this role. Review the selection and close the job.`,
      jobId,
      jobTitle: title,
      evidence: {
        selectedCount,
        candidateCount
      },
      recommendedAction: 'CLOSE_JOB',
      actionLabel: 'Close job',
      to: `/jobs/${jobId}`
    });
    return insights;
  }

  // 2. Shortlisted candidates ready for comparison or decision
  if (shortlistedCount >= 2) {
    insights.push({
      type: INSIGHT_TYPES.SHORTLIST_READY_FOR_COMPARISON,
      severity: SEVERITY.INFO,
      title: `${title} has shortlisted candidates ready to compare`,
      message: `${shortlistedCount} shortlisted candidates are ready for side-by-side trade-off comparison.`,
      jobId,
      jobTitle: title,
      evidence: {
        shortlistedCount,
        candidateCount
      },
      recommendedAction: 'COMPARE_SHORTLISTED',
      actionLabel: 'Compare shortlisted',
      to: `/ai/comparison?jobId=${jobId}`
    });
  } else if (shortlistedCount === 1) {
    insights.push({
      type: INSIGHT_TYPES.SHORTLIST_READY_FOR_COMPARISON,
      severity: SEVERITY.INFO,
      title: `${title} has 1 shortlisted candidate`,
      message: '1 shortlisted candidate is ready for final review and hiring decision.',
      jobId,
      jobTitle: title,
      evidence: {
        shortlistedCount: 1,
        candidateCount
      },
      recommendedAction: 'REVIEW_SHORTLIST',
      actionLabel: 'Review shortlist',
      to: `/jobs/${jobId}/candidates?hrStatus=SHORTLISTED`
    });
  }

  // 3. Open role with 0 candidates
  if (candidateCount === 0) {
    insights.push({
      type: INSIGHT_TYPES.JOB_NEEDS_CANDIDATES,
      severity: SEVERITY.ATTENTION,
      title: `${title} has no candidates yet`,
      message: 'No resumes have been imported for this active role. Add candidates to begin screening.',
      jobId,
      jobTitle: title,
      evidence: {
        candidateCount: 0
      },
      recommendedAction: 'ADD_CANDIDATES',
      actionLabel: 'Add candidates',
      to: `/jobs/${jobId}/import`
    });
  }

  // 4. Candidates waiting to be scored
  if (candidateCount > 0 && analyzedCount === 0) {
    insights.push({
      type: INSIGHT_TYPES.JOB_READY_FOR_REVIEW,
      severity: SEVERITY.ATTENTION,
      title: `${title} has unscored candidates`,
      message: `${candidateCount} candidate(s) are waiting to be matched and scored against job criteria.`,
      jobId,
      jobTitle: title,
      evidence: {
        candidateCount,
        unanalyzedCount: candidateCount
      },
      recommendedAction: 'SCORE_CANDIDATES',
      actionLabel: 'Score candidates',
      to: `/jobs/${jobId}`
    });
  }

  // 5. Strong matches available for review (when not yet shortlisted)
  if (strongMatchCount > 0 && shortlistedCount === 0) {
    insights.push({
      type: INSIGHT_TYPES.STRONG_MATCHES_AVAILABLE,
      severity: SEVERITY.INFO,
      title: `${title} has ${strongMatchCount} strong match(es)`,
      message: `${strongMatchCount} candidate(s) scored ${strongMatchThreshold}% or higher against requirements.`,
      jobId,
      jobTitle: title,
      evidence: {
        strongMatchCount,
        strongMatchThreshold,
        bestMatchScore
      },
      recommendedAction: 'REVIEW_STRONG_MATCHES',
      actionLabel: 'Review strong matches',
      to: `/jobs/${jobId}/candidates?minScore=${strongMatchThreshold}`
    });
  }

  // 6. Scored pool with no strong matches
  if (analyzedCount > 0 && strongMatchCount === 0 && shortlistedCount === 0) {
    insights.push({
      type: INSIGHT_TYPES.LOW_MATCH_POOL,
      severity: SEVERITY.INFO,
      title: `${title} candidate pool has no strong matches`,
      message: `All ${analyzedCount} candidates scored below the ${strongMatchThreshold}% threshold. Consider reviewing candidates or adjusting criteria.`,
      jobId,
      jobTitle: title,
      evidence: {
        analyzedCount,
        strongMatchCount: 0,
        strongMatchThreshold,
        bestMatchScore
      },
      recommendedAction: 'REVIEW_ALL_CANDIDATES',
      actionLabel: 'Review candidates',
      to: `/jobs/${jobId}/candidates`
    });
  }

  return insights;
};

/**
 * Runs the deterministic Insights Agent.
 *
 * @param {Object} params
 * @param {string} params.message
 * @param {import('../types/ai.types').AgentContext} params.context
 * @param {import('../providers/AIProvider').AIProvider} params.provider
 * @param {Object} [params.config]
 * @param {Function} [params.toolRunner] Injectable for tests
 */
const runInsightsAgent = async ({
  message,
  context = {},
  provider,
  config,
  toolRunner = executeTool
}) => {
  const generatedAt = new Date().toISOString();
  const jobId = context.jobId || null;

  // Case 1: Job-specific insights
  if (jobId) {
    const jobRes = await toolRunner('getJobMetrics', { jobId }, context, { config });
    if (!jobRes.success || !jobRes.data) {
      return {
        mode: 'insights',
        content: `Could not retrieve insights for job "${jobId}". The job may not exist or has been deleted.`,
        structuredData: {
          scope: 'JOB',
          jobId,
          generatedAt,
          summary: 'Job not found.',
          insights: [],
          warnings: ['JOB_NOT_FOUND']
        },
        provider: provider?.name || 'mock',
        model: provider?.model || 'mock-v1'
      };
    }

    const jobData = jobRes.data;
    const insights = evaluateJobInsights(jobData);

    const summaryText =
      insights.length > 0
        ? `Recruitment insights for **${jobData.title}**:\n\n` +
          insights.map((ins) => `• **${ins.title}**: ${ins.message}`).join('\n')
        : `**${jobData.title}** is currently up to date with no pending actions required.`;

    return {
      mode: 'insights',
      content: summaryText,
      structuredData: {
        scope: 'JOB',
        jobId,
        jobTitle: jobData.title,
        generatedAt,
        summary: summaryText,
        insights,
        warnings: []
      },
      provider: provider?.name || 'mock',
      model: provider?.model || 'mock-v1'
    };
  }

  // Case 2: Global Workspace Insights
  const [dashboardRes, jobsRes] = await Promise.all([
    toolRunner('getDashboardMetrics', {}, context, { config }),
    toolRunner('getJobs', { limit: 50, status: 'OPEN' }, context, { config })
  ]);

  const dashboardData = dashboardRes.success ? dashboardRes.data : null;
  const openJobs = jobsRes.success && Array.isArray(jobsRes.data?.jobs) ? jobsRes.data.jobs : [];

  const allInsights = [];

  for (const job of openJobs) {
    const stats = {
      candidateCount: job.candidateCount ?? 0,
      analyzedCount: job.analyzedCount ?? 0,
      strongMatchCount: job.strongMatchCount ?? 0,
      shortlistedCount: job.shortlistedCount ?? 0,
      selectedCount: job.selectedCount ?? 0,
      bestMatchScore: job.bestMatchScore ?? null
    };

    const jobInsights = evaluateJobInsights({
      jobId: job.jobId || job.id,
      title: job.title,
      status: job.status || 'OPEN',
      isClosed: false,
      stats,
      strongMatchThreshold: dashboardData?.strongMatchThreshold ?? 80
    });

    allInsights.push(...jobInsights);
  }

  // Check for global pipeline backlog
  const pendingReviewTotal = dashboardData?.metrics?.pendingReview ?? 0;
  if (pendingReviewTotal >= 15) {
    allInsights.unshift({
      type: INSIGHT_TYPES.PIPELINE_BOTTLENECK,
      severity: SEVERITY.ATTENTION,
      title: 'High review backlog across roles',
      message: `${pendingReviewTotal} total candidates are currently awaiting review or scoring across open roles.`,
      evidence: {
        pendingReviewTotal
      },
      recommendedAction: 'REVIEW_BACKLOG',
      actionLabel: 'View open roles',
      to: '/jobs'
    });
  }

  // Sort: ATTENTION first, then INFO; limit to top 5 most actionable
  const severityRank = { HIGH: 0, ATTENTION: 1, INFO: 2 };
  allInsights.sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));
  const topInsights = allInsights.slice(0, 5);

  let summaryText = '';
  if (topInsights.length === 0) {
    summaryText = 'All active roles are up to date. No immediate bottlenecks or pending recruitment actions detected.';
  } else {
    summaryText =
      `Recruitment Insights (Workspace Overview):\n\n` +
      topInsights.map((ins) => `• **${ins.title}**: ${ins.message}`).join('\n') +
      `\n\n${topInsights.length} item(s) currently highlighted for recruiter attention.`;
  }

  return {
    mode: 'insights',
    content: summaryText,
    structuredData: {
      scope: 'GLOBAL',
      generatedAt,
      summary: summaryText,
      insights: topInsights,
      warnings: []
    },
    provider: provider?.name || 'mock',
    model: provider?.model || 'mock-v1'
  };
};

module.exports = {
  runInsightsAgent,
  evaluateJobInsights,
  INSIGHT_TYPES,
  SEVERITY
};
