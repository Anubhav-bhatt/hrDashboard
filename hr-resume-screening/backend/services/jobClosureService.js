const prisma = require('../config/prisma');
const { recordActivityWithin } = require('./activityService');

/**
 * Job closure: recording the hire for a vacancy and retiring the job.
 *
 * The rules encoded here are recruitment rules, not UI conveniences, so they are
 * enforced on the server and the client is never trusted:
 *
 *   - a job can only be closed once, and only from OPEN;
 *   - the hire must be a candidate of *that* job who is currently SHORTLISTED;
 *   - the recruiter chooses the hire — score never decides it;
 *   - the other shortlisted candidates keep their status, because that is what
 *     actually happened during the process.
 *
 * Everything runs in one transaction so a job can never be CLOSED without a
 * selected candidate, and a candidate can never be SELECTED for a job that is
 * still open.
 */

/** Statuses that may be chosen as the hire. */
const SELECTABLE_FROM_STATUS = 'SHORTLISTED';

/**
 * Error carrying a stable machine-readable code.
 *
 * The code is what the API surfaces; the message is written for a recruiter, so
 * neither ever leaks Prisma internals, SQL or paths.
 */
class JobClosureError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'JobClosureError';
    this.code = code;
    this.statusCode = statusCode;
    this.expose = true;
  }
}

/** Fields needed to render a selected candidate on a card or dashboard row. */
const SELECTED_CANDIDATE_SELECT = {
  id: true,
  name: true,
  currentRole: true,
  totalExperience: true,
  overallScore: true,
  hrStatus: true,
  selectedAt: true
};

/**
 * Shortlisted candidates for a job, ordered best match first.
 *
 * Feeds the closure dialog. Ordering is a convenience for the recruiter reading
 * the list — it carries no authority over the choice, and the highest scorer is
 * never preselected.
 */
const getShortlistedCandidates = (jobId) =>
  prisma.candidate.findMany({
    where: { jobId, hrStatus: SELECTABLE_FROM_STATUS },
    select: {
      id: true,
      name: true,
      currentRole: true,
      totalExperience: true,
      overallScore: true,
      currentLocation: true
    },
    orderBy: [{ overallScore: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }]
  });

/**
 * Closes a job and records the selected candidate as the hire.
 *
 * @param {Object} params
 * @param {string} params.jobId
 * @param {string} params.selectedCandidateId Candidate chosen by the recruiter
 * @param {Object|null} [params.actor] Signed-in user ({ id, name })
 * @returns {Promise<Object>} The closed job with its selected candidate
 * @throws {JobClosureError}
 */
const closeJob = async ({ jobId, selectedCandidateId, actor = null }) => {
  if (!selectedCandidateId || typeof selectedCandidateId !== 'string' || !selectedCandidateId.trim()) {
    throw new JobClosureError(
      'SELECTED_CANDIDATE_REQUIRED',
      'Select the candidate hired for this position before closing the job.',
      400
    );
  }

  const candidateId = selectedCandidateId.trim();

  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true, status: true, closedAt: true, selectedCandidateId: true }
    });

    if (!job) {
      throw new JobClosureError('JOB_NOT_FOUND', 'Job not found.', 404);
    }

    if (job.status === 'CLOSED') {
      // Idempotency: a resubmitted request must not overwrite the recorded hire.
      throw new JobClosureError('JOB_ALREADY_CLOSED', 'This job has already been closed.', 409);
    }

    // Scoped by jobId, so a candidate belonging to another job is indistinguishable
    // from one that does not exist. This is deliberate: closure must not confirm
    // the existence of candidates outside the requested job.
    const candidate = await tx.candidate.findFirst({
      where: { id: candidateId, jobId },
      select: { id: true, name: true, hrStatus: true, overallScore: true, currentRole: true, totalExperience: true }
    });

    if (!candidate) {
      throw new JobClosureError('CANDIDATE_NOT_IN_JOB', 'Candidate not found for this job.', 404);
    }

    if (candidate.hrStatus !== SELECTABLE_FROM_STATUS) {
      throw new JobClosureError(
        'CANDIDATE_NOT_SHORTLISTED',
        'Only a shortlisted candidate can be selected as the hire for this job.',
        409
      );
    }

    // Compare-and-set on the status column. Two concurrent closures both read
    // OPEN above; only the one whose UPDATE matches a still-OPEN row proceeds,
    // so the loser is rejected rather than silently overwriting the winner.
    const claimed = await tx.job.updateMany({
      where: { id: jobId, status: 'OPEN' },
      data: {
        status: 'CLOSED',
        selectedCandidateId: candidate.id,
        closedAt: new Date(),
        closedByUserId: actor && actor.id ? actor.id : null
      }
    });

    if (claimed.count !== 1) {
      throw new JobClosureError('JOB_ALREADY_CLOSED', 'This job has already been closed.', 409);
    }

    await tx.candidate.update({
      where: { id: candidate.id },
      data: {
        hrStatus: 'SELECTED',
        selectedAt: new Date(),
        selectedByUserId: actor && actor.id ? actor.id : null
      }
    });

    // Audit trail. Written inside the transaction so history and state commit
    // together. Names only — no contact details reach the activity log.
    const candidateName = candidate.name || 'Candidate';
    await recordActivityWithin(tx, {
      candidateId: candidate.id,
      actor,
      type: 'CANDIDATE_SELECTED',
      description: `${candidateName} selected for ${job.title}.`,
      metadata: { jobId, previousStatus: SELECTABLE_FROM_STATUS }
    });
    await recordActivityWithin(tx, {
      candidateId: candidate.id,
      actor,
      type: 'JOB_CLOSED',
      description: `${job.title} closed.`,
      metadata: { jobId, selectedCandidateId: candidate.id }
    });

    return tx.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        status: true,
        closedAt: true,
        closedByUserId: true,
        selectedCandidateId: true,
        selectedCandidate: { select: SELECTED_CANDIDATE_SELECT }
      }
    });
  });
};

/**
 * Rejects an operation that may not run against a closed job.
 *
 * Used by every candidate-ingestion path so the rule holds regardless of which
 * screen or API client attempts it.
 *
 * @param {string} jobId
 * @returns {Promise<Object>} The job row when it is open
 * @throws {JobClosureError} JOB_NOT_FOUND or JOB_CLOSED
 */
const assertJobAcceptsCandidates = async (jobId) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, title: true, status: true }
  });

  if (!job) {
    throw new JobClosureError('JOB_NOT_FOUND', 'Job not found.', 404);
  }

  if (job.status === 'CLOSED') {
    throw new JobClosureError('JOB_CLOSED', 'This job is closed. Candidate imports are disabled for closed jobs.', 409);
  }

  return job;
};

module.exports = {
  closeJob,
  getShortlistedCandidates,
  assertJobAcceptsCandidates,
  JobClosureError,
  SELECTED_CANDIDATE_SELECT
};
