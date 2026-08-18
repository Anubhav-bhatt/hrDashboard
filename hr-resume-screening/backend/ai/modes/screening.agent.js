/**
 * Screening Agent mode logic.
 *
 * Coordinates deep evaluation for a single candidate against a specific job using
 * controlled read-only tools:
 *   - getJob
 *   - getJobRequirements
 *   - getCandidate
 *   - getCandidateScore
 *   - getScoringBreakdown
 *
 * Constructs a normalized evidence model and delegates deterministic reasoning
 * to the active AI provider.
 */
const { executeTool } = require('../tools/toolRegistry');
const {
  screeningJobRequired,
  screeningCandidateRequired,
  screeningInvalidCandidateCount,
  screeningCandidateMismatch,
  aiRequestInvalid
} = require('../errors/ai.errors');

/**
 * Validates screening context and retrieves evidence.
 *
 * @param {Object} params
 * @param {string} params.message
 * @param {import('../types/ai.types').AgentContext} params.context
 * @param {import('../providers/AIProvider').AIProvider} params.provider
 * @param {Object} [params.config]
 * @param {Function} [params.toolRunner] Injectable for tests
 */
const runScreeningAgent = async ({
  message,
  context,
  provider,
  config,
  toolRunner = executeTool
}) => {
  if (!context || !context.jobId) {
    throw screeningJobRequired();
  }

  const candidateIds = context.candidateIds || [];
  if (candidateIds.length === 0) {
    throw screeningCandidateRequired();
  }
  if (candidateIds.length > 1) {
    throw screeningInvalidCandidateCount();
  }

  const jobId = context.jobId;
  const candidateId = candidateIds[0];

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

  // 3. Retrieve Candidate Profile
  const candidateResult = await toolRunner('getCandidate', { candidateId, jobId }, context, { config });
  if (!candidateResult.success) {
    throw aiRequestInvalid(candidateResult.error?.message || 'Failed to retrieve candidate profile.');
  }

  const candidate = candidateResult.data.candidate;
  if (candidate.jobId && candidate.jobId !== jobId) {
    throw screeningCandidateMismatch();
  }

  // 4. Retrieve Existing Score Record
  const scoreResult = await toolRunner('getCandidateScore', { candidateId, jobId }, context, { config });
  const scoreData = scoreResult.success ? scoreResult.data : null;

  // 5. Retrieve Score Breakdown
  const breakdownResult = await toolRunner('getScoringBreakdown', { candidateId, jobId }, context, { config });
  const breakdownData = breakdownResult.success ? breakdownResult.data : null;

  // 6. Assemble Normalized Screening Evidence Input Model
  const evidence = {
    job: {
      id: jobResult.data.job.jobId,
      title: jobResult.data.job.title,
      status: jobResult.data.job.status,
      requirements: reqsResult.data.requirements || {},
      jobDescription: reqsResult.data.jobDescription || {}
    },
    candidate: {
      id: candidate.candidateId,
      name: candidate.name,
      skills: candidate.skills || [],
      experience: candidate.experience || {},
      education: candidate.education || [],
      qualification: candidate.qualification || null,
      location: candidate.location || {},
      compensation: candidate.compensation || {},
      status: candidate.status || {}
    },
    score: {
      isScored: scoreData?.isScored || candidate.score?.isScored || false,
      overall: scoreData?.overallScore ?? candidate.score?.overallScore ?? null,
      alignmentLabel: scoreData?.alignmentLabel || candidate.score?.alignmentLabel || null,
      band: scoreData?.band || null,
      breakdown: breakdownData?.breakdown || null,
      skills: breakdownData?.skills || null,
      strengths: breakdownData?.strengths || [],
      gaps: breakdownData?.gaps || []
    },
    instruction: message && typeof message === 'string' && message.trim() ? message.trim() : null
  };

  // 7. Execute through provider
  const providerResult = await provider.run({
    mode: 'screening',
    message,
    context,
    evidence,
    metadata: {
      readOnly: true,
      jobId,
      candidateId
    }
  });

  return providerResult;
};

module.exports = {
  runScreeningAgent
};
