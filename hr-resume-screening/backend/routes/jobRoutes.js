const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
  createJob,
  getAllJobs,
  getJobById,
  updateJobSearchCriteria,
  searchOutlookEmailsForJob
} = require('../controllers/jobController');

// Route for creating a job with multipart file upload
router.post('/', upload.single('jdFile'), createJob);

// Route for getting all jobs (newest first)
router.get('/', getAllJobs);

// Route for getting individual job details
router.get('/:id', getJobById);

// Route for updating job search criteria & requirements
router.patch('/:id', updateJobSearchCriteria);
router.patch('/:id/search-criteria', updateJobSearchCriteria);

// Route for searching Outlook emails for job candidate applications
router.post('/:jobId/outlook/search', searchOutlookEmailsForJob);

module.exports = router;
