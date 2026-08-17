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
const rejectClosedJob = async (req, res, next) => {
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
        message: error.message
      });
    }
    return next(error);
  }
};

module.exports = { rejectClosedJob };
