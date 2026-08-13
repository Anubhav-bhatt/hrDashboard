const express = require('express');
const router = express.Router();
const { getOverview } = require('../controllers/analyticsController');

// Dashboard KPI metrics, hiring pipeline, score distribution & recent activity
router.get('/overview', getOverview);

module.exports = router;
