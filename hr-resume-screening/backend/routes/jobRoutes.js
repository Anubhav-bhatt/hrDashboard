const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
  createJob,
  getAllJobs,
  getJobsSummary,
  getJobById,
  updateJobSearchCriteria,
  searchOutlookEmailsForJob
} = require('../controllers/jobController');
const { getJobSummary } = require('../controllers/analyticsController');

// Route for creating a job with multipart file upload
router.post('/', upload.single('jdFile'), createJob);

// Aggregated job statistics for the jobs portal and dashboard overview.
// Registered before /:id so "summary" is not read as a job ID.
router.get('/summary', getJobsSummary);

// Route for getting all jobs (supports ?search, ?sort, ?limit)
router.get('/', getAllJobs);

// Candidate statistics for one job (job workspace header & KPI row)
router.get('/:jobId/summary', getJobSummary);

// Route for getting individual job details
router.get('/:id', getJobById);

// Route for updating job search criteria & requirements
router.patch('/:id', updateJobSearchCriteria);
router.patch('/:id/search-criteria', updateJobSearchCriteria);

// Route for searching Outlook emails for job candidate applications
router.post('/:jobId/outlook/search', searchOutlookEmailsForJob);

module.exports = router;
