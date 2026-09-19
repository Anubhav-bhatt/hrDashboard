const { jobBelongsToWorkspace } = require('../services/workspaceService');

/**
 * Ownership gate for every `/api/jobs/:jobId/...` route.
 *
 * Almost the entire candidate surface — listings, profiles, resumes, notes,
 * status changes, uploads, analysis, shortlist, closure — hangs off a job id in
 * the URL. Checking the job once, here, closes all of it at a single point
 * rather than asking three dozen handlers each to remember.
 *
 * The answer to "someone else's job id" is 404, not 403. A 403 would confirm
 * that the id names a real job, which is a membership oracle: try ids, keep the
 * ones that come back 403, and you have learned another workspace's job list
 * without ever reading a record.
 */
const requireJobInWorkspace = async (req, res, next) => {
  const jobId = req.params.jobId || req.params.id;

  // Routes that carry no job id — the collection routes — are scoped by their
  // own queries instead.
  if (!jobId) return next();

  try {
    if (await jobBelongsToWorkspace(jobId, req.workspaceId)) return next();

    return res.status(404).json({
      success: false,
      code: 'JOB_NOT_FOUND',
      message: 'This job could not be found.'
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { requireJobInWorkspace };
