/**
 * Ranking Agent mode logic.
 *
 * Coordinates candidate ranking for a job using controlled read-only tools:
 *   - getJob
 *   - getJobRequirements
 *   - getCandidates / searchCandidates
 *   - getJobRankingData
 *
 * Enforces candidate limits (default 50, max 100), preserves authoritative match scores,
 * and delegates deterministic ranking with tie-breaking to the active AI provider.
 */
const { executeTool } = require('../tools/toolRegistry');
const {
  rankingJobRequired,
  rankingInvalidScope,
  aiRequestInvalid
} = require('../errors/ai.errors');

const VALID_SCOPES = Object.freeze(['ALL', 'SHORTLISTED']);

/**
 * Validates ranking context and retrieves candidate pool.
 *
 * @param {Object} params
 * @param {string} params.message
 * @param {import('../types/ai.types').AgentContext} params.context
 * @param {import('../providers/AIProvider').AIProvider} params.provider
 * @param {Object} [params.config]
 * @param {Function} [params.toolRunner] Injectable for tests
 */
const runRankingAgent = async ({
  message,
  context,
  provider,
  config,
  toolRunner = executeTool
}) => {
  if (!context || !context.jobId) {
    throw rankingJobRequired();
  }

  const jobId = context.jobId;
  const rawFilters = context.filters || {};
  const scope = (rawFilters.candidateScope || context.candidateScope || 'ALL').toUpperCase();

  if (!VALID_SCOPES.includes(scope)) {
    throw rankingInvalidScope(scope);
  }

  // 1. Retrieve Job Details
  const jobResult = await toolRunner('getJob', { jobId }, context, { config });
  if (!jobResult.success) {
    throw aiRequestInvalid(jobResult.error?.message || 'Failed to retrieve job details.');
  }

  // 2. Retrieve Job Requirements
  const reqsResult = await toolRunner('getJobRequirements', { jobId }, context, { config });
  if (!reqsResult.success) {
    throw aiRequestInvalid(reqsResult.error?.message || 'Failed to retrieve job requirements.');
  }

  // 3. Determine Candidate Search / Retrieval
  const limit = Math.min(
    typeof rawFilters.limit === 'number' && rawFilters.limit > 0 ? rawFilters.limit : 100,
    100
  );

  let candidatesResult;
  const statusFilter = scope === 'SHORTLISTED' ? 'SHORTLISTED' : rawFilters.status || undefined;

  // Use searchCandidates if filters like minimumScore or skills are present, otherwise getCandidates
  const hasAdvancedFilters =
    rawFilters.minimumScore !== undefined ||
    (Array.isArray(rawFilters.skills) && rawFilters.skills.length > 0) ||
    rawFilters.location ||
    rawFilters.qualification;

  if (hasAdvancedFilters) {
    candidatesResult = await toolRunner(
      'searchCandidates',
      {
        jobId,
        status: statusFilter,
        minimumScore: typeof rawFilters.minimumScore === 'number' ? rawFilters.minimumScore : undefined,
        skills: Array.isArray(rawFilters.skills) ? rawFilters.skills : undefined,
        location: typeof rawFilters.location === 'string' ? rawFilters.location : undefined,
        qualification: typeof rawFilters.qualification === 'string' ? rawFilters.qualification : undefined,
        limit,
        offset: 0
      },
      context,
      { config }
    );
  } else {
    candidatesResult = await toolRunner(
      'getCandidates',
      {
        jobId,
        status: statusFilter,
        limit,
        offset: 0
      },
      context,
      { config }
    );
  }

  if (!candidatesResult.success) {
    throw aiRequestInvalid(candidatesResult.error?.message || 'Failed to retrieve candidates for ranking.');
  }

  const rawCandidates = candidatesResult.data.candidates || [];
  const totalMatching = candidatesResult.metadata?.totalMatching ?? rawCandidates.length;

  // 4. Assemble Evidence Model
  const evidence = {
    job: {
      id: jobResult.data.job.jobId,
      title: jobResult.data.job.title,
      status: jobResult.data.job.status,
      requirements: reqsResult.data.requirements || {},
      jobDescription: reqsResult.data.jobDescription || {}
    },
    candidateScope: scope,
    filters: rawFilters,
    totalCandidatesConsidered: totalMatching,
    returnedCount: rawCandidates.length,
    context: {
      jobId: context.jobId,
      candidateIds: context.candidateIds || [],
      filters: rawFilters
    },
    candidates: rawCandidates.map((c) => ({
      candidateId: c.candidateId,
      name: c.name,
      skills: c.skills || [],
      experience: c.experience || {},
      education: c.education || [],
      qualification: c.qualification || null,
      location: c.location || {},
      compensation: c.compensation || {},
      status: c.status || {},
      score: c.score || { overallScore: null, isScored: false }
    })),
    instruction: message && typeof message === 'string' && message.trim() ? message.trim() : null
  };

  // 5. Execute through provider
  const providerResult = await provider.run({
    mode: 'ranking',
    message,
    context,
    evidence,
    metadata: {
      readOnly: true,
      jobId,
      candidateScope: scope,
      candidateCount: rawCandidates.length
    }
  });

  return providerResult;
};

module.exports = {
  runRankingAgent,
  VALID_SCOPES
};
