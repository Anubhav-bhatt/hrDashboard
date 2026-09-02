const { assertJobAcceptsCandidates, JobClosureError } = require('../services/jobClosureService');

/**
 * Blocks operations that must not run against a closed job.
 *
 * Applied as route middleware rather than checked inside each controller so the
 * rule holds for every ingestion path — direct upload, bulk upload, Outlook and
 * EML import — and cannot be missed by a future handler added to the same routes.
 * The UI disables these actions too, but this is the enforcement point: a client
 * calling the API directly is refused the same way.
 */
/**
 * Builds the guard, optionally with a reason written for the route it protects.
 *
 * The default message talks about candidate imports, which is right for the
 * upload and analysis routes and wrong everywhere else — a recruiter told
 * "imports are disabled" after trying to change a status has been answered a
 * question they did not ask. The code stays `JOB_CLOSED` either way, so clients
 * branch on one value regardless of which route refused them.
 *
 * @param {string|null} [message] Replaces the JOB_CLOSED message only.
 */
const buildRejectClosedJob = (message = null) => async (req, res, next) => {
  try {
    const jobId = req.params.jobId || req.params.id;
    if (!jobId) return next();

    await assertJobAcceptsCandidates(jobId);
    return next();
  } catch (error) {
    if (error instanceof JobClosureError) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: message && error.code === 'JOB_CLOSED' ? message : error.message
      });
    }
    return next(error);
  }
};

const rejectClosedJob = buildRejectClosedJob();

module.exports = { rejectClosedJob, buildRejectClosedJob };
