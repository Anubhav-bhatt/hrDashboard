const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
  createJob,
  getAllJobs,
  getJobsSummary,
  getJobById,
  getJobShortlist,
  closeJobById,
  deleteJobById,
  getJobDeletionPreview,
  updateJobSearchCriteria,
  searchOutlookEmailsForJob
} = require('../controllers/jobController');
const { getJobSummary } = require('../controllers/analyticsController');
const { requireRole } = require('../middleware/auth');

// Route for creating a job with multipart file upload
router.post('/', upload.single('jdFile'), createJob);

// Aggregated job statistics for the jobs portal and dashboard overview.
// Registered before /:id so "summary" is not read as a job ID.
router.get('/summary', getJobsSummary);

// Route for getting all jobs (supports ?search, ?sort, ?limit)
router.get('/', getAllJobs);

// Candidate statistics for one job (job workspace header & KPI row)
router.get('/:jobId/summary', getJobSummary);

// Shortlisted candidates eligible for selection, and the closure action itself.
router.get('/:jobId/shortlist', getJobShortlist);
router.post('/:jobId/close', closeJobById);

/*
 * Permanent deletion of a closed job — the only destructive route in the API.
 *
 * Restricted to ADMIN on top of the requireAuth applied at the mount point in
 * server.js. Closing a job is ordinary recruitment work and any signed-in
 * recruiter may do it; destroying the record of one is not, and it cannot be
 * undone. requireRole already existed for exactly this purpose and had no
 * callers — this is its first, and no other route's authorisation changes.
 */
router.get('/:jobId/deletion-preview', requireRole('ADMIN'), getJobDeletionPreview);
router.delete('/:jobId', requireRole('ADMIN'), deleteJobById);

// Route for getting individual job details
router.get('/:id', getJobById);

// Route for updating job search criteria & requirements
router.patch('/:id', updateJobSearchCriteria);
router.patch('/:id/search-criteria', updateJobSearchCriteria);

// Route for searching Outlook emails for job candidate applications
router.post('/:jobId/outlook/search', searchOutlookEmailsForJob);

module.exports = router;
