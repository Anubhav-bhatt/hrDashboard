const { getDashboardOverview, getJobSummaryData, PIPELINE_STAGES } = require('../services/analyticsService');

/**
 * @desc    Dashboard KPI metrics, hiring pipeline and recent activity.
 *          Pass ?jobId=<id> to scope every figure to a single job.
 * @route   GET /api/dashboard/overview
 * @route   GET /api/analytics/overview  (original path, retained)
 * @access  Private
 *
 * The aggregation itself lives in `services/analyticsService.js` so the same
 * figures can be served to a non-HTTP caller. This handler only maps the result
 * onto a status code.
 */
const getOverview = async (req, res, next) => {
  try {
    const data = await getDashboardOverview({ jobId: req.query.jobId });

    if (!data) {
      return res.status(404).json({
        success: false,
        code: 'JOB_NOT_FOUND',
        message: 'That job could not be found, so its dashboard cannot be shown.'
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Candidate statistics for one job, used by the job workspace header
 *          and the job-scoped candidate list's KPI row
 * @route   GET /api/jobs/:jobId/summary
 * @access  Private
 */
const getJobSummary = async (req, res, next) => {
  try {
    const data = await getJobSummaryData(req.params.jobId);

    if (!data) {
      return res.status(404).json({ success: false, code: 'JOB_NOT_FOUND', message: 'Job not found.' });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = { getOverview, getJobSummary, PIPELINE_STAGES };
