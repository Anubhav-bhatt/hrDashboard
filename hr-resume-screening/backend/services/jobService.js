/**
 * Single-job detail.
 *
 * Extracted verbatim from `controllers/jobController.getJobById` so the same
 * record can be read by something that is not an Express handler.
 *
 * One behaviour needed a seam. The original handler back-fills requirements for
 * legacy jobs that were stored before the extractor existed: if `requiredSkills`
 * is empty it re-parses the JD and *writes* the result. That is a sensible repair
 * on a recruiter's page load, but it makes a GET a mutation, and a read-only
 * caller must not trigger it. `backfillRequirements` keeps the HTTP route doing
 * exactly what it did while letting a read-only caller ask for the same data
 * without writing. The default is `true`, so the existing path is unchanged.
 */
const prisma = require('../config/prisma');
const { extractJDRequirements } = require('./jdRequirementExtractor');
const { SELECTED_CANDIDATE_SELECT } = require('./jobClosureService');

/**
 * @param {string} jobId
 * @param {Object} [options]
 * @param {boolean} [options.backfillRequirements=true] Repair and persist missing
 *   requirements on legacy records. Pass false for a guaranteed read-only call.
 * @param {boolean} [options.includeJdText=true] Include the full JD text. The
 *   text can be many kilobytes, so callers that only need structured fields can
 *   leave it out.
 * @returns {Promise<Object|null>} Null when the job does not exist.
 */
const getJobDetails = async (jobId, { backfillRequirements = true, includeJdText = true } = {}) => {
  let job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job) return null;

  // Lazy load requirements if missing from legacy records
  if (!job.requiredSkills || job.requiredSkills.length === 0) {
    const reqs = extractJDRequirements(job.jdText, job.title);

    if (backfillRequirements) {
      job = await prisma.job.update({
        where: { id: job.id },
        data: {
          requiredSkills: reqs.requiredSkills || [],
          preferredSkills: reqs.preferredSkills || [],
          roleKeywords: reqs.roleKeywords || [],
          minimumExperience: reqs.minimumExperience || 0,
          preferredEducation: reqs.preferredEducation || []
        }
      });
    } else {
      // Same values, computed in memory and not persisted. A read-only caller
      // sees what the route would have shown without causing the write.
      job = {
        ...job,
        requiredSkills: reqs.requiredSkills || [],
        preferredSkills: reqs.preferredSkills || [],
        roleKeywords: reqs.roleKeywords || [],
        minimumExperience: reqs.minimumExperience || 0,
        preferredEducation: reqs.preferredEducation || []
      };
    }
  }

  // Compute Metrics & Score Tier Distribution
  const candidatesCount = await prisma.candidate.count({ where: { jobId: job.id } });
  const analyzedCount = await prisma.candidate.count({
    where: { jobId: job.id, overallScore: { not: null } }
  });

  const tier90 = await prisma.candidate.count({ where: { jobId: job.id, overallScore: { gte: 90 } } });
  const tier80_89 = await prisma.candidate.count({ where: { jobId: job.id, overallScore: { gte: 80, lt: 90 } } });
  const tier70_79 = await prisma.candidate.count({ where: { jobId: job.id, overallScore: { gte: 70, lt: 80 } } });
  const tierBelow70 = await prisma.candidate.count({ where: { jobId: job.id, overallScore: { lt: 70 } } });

  // Aggregate Import Sessions
  const importSessions = await prisma.importSession.findMany({ where: { jobId: job.id } });
  const applicationsFound = importSessions.reduce((acc, sess) => acc + (sess.emailsFound || 0), 0);

  // Operational processing badge, distinct from the persisted OPEN/CLOSED
  // lifecycle returned as `status` below.
  let processingStatus = 'NEW';
  if (candidatesCount > 0 && analyzedCount === 0) processingStatus = 'IMPORTING';
  else if (candidatesCount > 0 && analyzedCount < candidatesCount) processingStatus = 'READY_FOR_ANALYSIS';
  else if (candidatesCount > 0 && analyzedCount === candidatesCount) processingStatus = 'COMPLETED';

  const shortlistedCount = await prisma.candidate.count({
    where: { jobId: job.id, hrStatus: 'SHORTLISTED' }
  });

  // Projection only: enough to render the closed-job banner, never the resume.
  const selectedCandidate = job.selectedCandidateId
    ? await prisma.candidate.findUnique({
        where: { id: job.selectedCandidateId },
        select: SELECTED_CANDIDATE_SELECT
      })
    : null;

  return {
    _id: job.id,
    id: job.id,
    title: job.title,
    status: job.status,
    isClosed: job.status === 'CLOSED',
    closedAt: job.closedAt,
    selectedCandidateId: job.selectedCandidateId,
    selectedCandidate,
    // Drives whether the Close Job action is offered.
    canClose: job.status === 'OPEN' && shortlistedCount > 0,
    shortlistedCount,
    jdFileName: job.jdFileName,
    jdMimeType: job.jdMimeType,
    ...(includeJdText ? { jdText: job.jdText } : {}),
    requirements: {
      requiredSkills: job.requiredSkills || [],
      preferredSkills: job.preferredSkills || [],
      searchKeywords: job.searchKeywords || [],
      minimumExperience: job.minimumExperience || 0,
      maximumExperience: job.maximumExperience || null,
      salaryMin: job.salaryMin || null,
      salaryMax: job.salaryMax || null,
      salaryCurrency: job.salaryCurrency || 'INR',
      preferredLocations: job.preferredLocations || [],
      qualifications: job.qualifications || [],
      preferredEducation: job.preferredEducation || [],
      roleKeywords: job.roleKeywords || []
    },
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    metrics: {
      applicationsFound: applicationsFound || candidatesCount,
      candidatesCount,
      analyzedCount,
      shortlistedCount,
      processingStatus,
      scoreTiers: {
        tier90,
        tier80_89,
        tier70_79,
        tierBelow70
      }
    }
  };
};

module.exports = { getJobDetails };
