/**
 * Comparison Agent mode logic.
 *
 * Coordinates side-by-side comparative evaluation for 2–5 candidates against a specific job
 * using controlled read-only tools:
 *   - getJob
 *   - getJobRequirements
 *   - getCandidate
 *   - getCandidateScore
 *   - getScoringBreakdown
 *
 * Enforces candidate count constraints (2–5 candidates, unique), preserves authoritative
 * stored match scores, and delegates deterministic trade-off analysis to the active AI provider.
 */
const { executeTool } = require('../tools/toolRegistry');
const {
  comparisonJobRequired,
  comparisonCandidatesRequired,
  comparisonTooFewCandidates,
  comparisonTooManyCandidates,
  comparisonDuplicateCandidate,
  comparisonCandidateMismatch,
  comparisonCandidateNotFound,
  aiRequestInvalid
} = require('../errors/ai.errors');

const MIN_COMPARISON_CANDIDATES = 2;
const MAX_COMPARISON_CANDIDATES = 5;

/**
 * Validates comparison context and retrieves evidence for all selected candidates.
 *
 * @param {Object} params
 * @param {string} params.message
 * @param {import('../types/ai.types').AgentContext} params.context
 * @param {import('../providers/AIProvider').AIProvider} params.provider
 * @param {Object} [params.config]
 * @param {Function} [params.toolRunner] Injectable for tests
 */
const runComparisonAgent = async ({
  message,
  context,
  provider,
  config,
  toolRunner = executeTool
}) => {
  if (!context || !context.jobId) {
    throw comparisonJobRequired();
  }

  const candidateIds = context.candidateIds;
  if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
    throw comparisonCandidatesRequired();
  }

  if (candidateIds.length < MIN_COMPARISON_CANDIDATES) {
    throw comparisonTooFewCandidates();
  }

  if (candidateIds.length > MAX_COMPARISON_CANDIDATES) {
    throw comparisonTooManyCandidates();
  }

  const uniqueIds = new Set(candidateIds);
  if (uniqueIds.size !== candidateIds.length) {
    throw comparisonDuplicateCandidate();
  }

  const jobId = context.jobId;

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

  // 3. Retrieve Candidate Profiles, Scores, and Breakdowns (Preserving selection order)
  const candidatesEvidence = [];
  for (const candidateId of candidateIds) {
    const candidateResult = await toolRunner('getCandidate', { candidateId, jobId }, context, { config });
    if (!candidateResult.success) {
      throw comparisonCandidateNotFound(candidateId);
    }

    const candidate = candidateResult.data.candidate;
    if (candidate.jobId && candidate.jobId !== jobId) {
      throw comparisonCandidateMismatch();
    }

    const scoreResult = await toolRunner('getCandidateScore', { candidateId, jobId }, context, { config });
    const scoreData = scoreResult.success ? scoreResult.data : null;

    const breakdownResult = await toolRunner('getScoringBreakdown', { candidateId, jobId }, context, { config });
    const breakdownData = breakdownResult.success ? breakdownResult.data : null;

    candidatesEvidence.push({
      candidate: {
        candidateId: candidate.candidateId,
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
      }
    });
  }

  // 4. Assemble Evidence Model
  const evidence = {
    job: {
      id: jobResult.data.job.jobId,
      title: jobResult.data.job.title,
      status: jobResult.data.job.status,
      requirements: reqsResult.data.requirements || {},
      jobDescription: reqsResult.data.jobDescription || {}
    },
    candidates: candidatesEvidence,
    candidateCount: candidatesEvidence.length,
    instruction: message && typeof message === 'string' && message.trim() ? message.trim() : null
  };

  // 5. Execute through provider
  const providerResult = await provider.run({
    mode: 'comparison',
    message,
    context,
    evidence,
    metadata: {
      readOnly: true,
      jobId,
      candidateCount: candidatesEvidence.length
    }
  });

  return providerResult;
};

module.exports = {
  runComparisonAgent,
  MIN_COMPARISON_CANDIDATES,
  MAX_COMPARISON_CANDIDATES
};
