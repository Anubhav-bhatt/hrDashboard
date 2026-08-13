const express = require('express');
const router = express.Router();
const { getOverview } = require('../controllers/analyticsController');

// Dashboard KPI metrics, hiring pipeline, score distribution, top candidates,
// jobs overview and recent activity.
// Pass ?jobId=<id> to scope every figure to a single job.
router.get('/overview', getOverview);

module.exports = router;
