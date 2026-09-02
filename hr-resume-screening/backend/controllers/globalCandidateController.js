const prisma = require('../config/prisma');
const {
  listCandidatesAcrossJobs,
  getCandidateDetail,
  getCandidateFilterOptions
} = require('../services/candidateService');

/**
 * Cross-job candidate listing.
 *
 * The job-scoped route (GET /api/jobs/:jobId/candidates) is unchanged and still
 * serves the job workspace. This endpoint exists so dashboard cards can link to
 * a filtered candidate view that spans every open role — e.g.
 * /api/candidates?hrStatus=SHORTLISTED. Both share the same query builder, so
 * filtering, sorting and pagination behave identically.
 *
 * @desc    List candidates across all jobs
 * @route   GET /api/candidates
 * @access  Private
 */
const listCandidates = async (req, res, next) => {
  try {
    const { candidates, pagination, facets } = await listCandidatesAcrossJobs(req.query);

    return res.status(200).json({
      success: true,
      data: candidates,
      pagination,
      facets
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Full candidate profile by ID, without needing the job ID
 * @route   GET /api/candidates/:candidateId
 * @access  Private
 */
const getCandidate = async (req, res, next) => {
  try {
    const data = await getCandidateDetail(req.params.candidateId, { includeResumeText: true });

    if (!data) {
      return res.status(404).json({
        success: false,
        code: 'CANDIDATE_NOT_FOUND',
        message: 'This candidate profile could not be found.'
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Distinct filter values (skills, locations, qualifications) present in
 *          the candidate pool, so filter controls only offer real options
 * @route   GET /api/candidates/filters
 * @access  Private
 */
const getFilterOptions = async (req, res, next) => {
  try {
    /*
     * Scope comes from the job named in the request, not from the client.
     *
     * A `?jobId=` is resolved to its actual lifecycle here, so a caller cannot
     * pass `scope=archived` to read a closed pool's facets through the active
     * endpoint. Without a jobId this is the global active talent pool.
     */
    const jobId = typeof req.query.jobId === 'string' && req.query.jobId.trim() ? req.query.jobId.trim() : null;
    let scope = 'active';

    if (jobId) {
      const job = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
      if (!job) {
        return res.status(404).json({ success: false, code: 'JOB_NOT_FOUND', message: 'Job not found.' });
      }
      scope = job.status === 'CLOSED' ? 'archived' : 'active';
    }

    return res.status(200).json({ success: true, data: await getCandidateFilterOptions({ scope, jobId }) });
  } catch (error) {
    next(error);
  }
};

module.exports = { listCandidates, getCandidate, getFilterOptions };
