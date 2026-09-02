const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const upload = require('../middleware/upload');
const { rejectClosedJob, buildRejectClosedJob } = require('../middleware/jobLifecycle');

// Candidate intake and re-analysis are closed once the job is closed: a filled
// vacancy must not gain new applicants, and historical scores must stay as they
// were when the hiring decision was made. `rejectClosedJob` runs before the
// upload handlers so a closed job never even buffers the incoming files.

// Manual Resume Upload (Single Candidate)
router.post('/:jobId/candidates/upload', rejectClosedJob, upload.single('resume'), candidateController.uploadSingleCandidate);

// Manual Resume Upload (Bulk & Folder Candidates in Chunks)
router.post(
  '/:jobId/candidates/bulk-upload',
  rejectClosedJob,
  upload.array('resumes', 50),
  candidateController.uploadBulkCandidates
);

// Batch process candidate applications retrieved from Outlook
router.post('/:jobId/candidates/process', rejectClosedJob, candidateController.processApplications);

// Analyze candidate job relevance
router.post('/:jobId/candidates/analyze-all', rejectClosedJob, candidateController.analyzeAllCandidates);
router.post('/:jobId/candidates/:candidateId/analyze', rejectClosedJob, candidateController.analyzeCandidate);

/*
 * Candidate HR review status.
 *
 * Closed to a closed job. The controller already refused to move the recorded
 * hire off SELECTED, but every other candidate on a filled role could still be
 * shortlisted or rejected after the fact — rewriting what the pipeline looked
 * like when the decision was made. A closed job is the history of a hiring
 * cycle, so its statuses are read-only.
 */
router.patch(
  '/:jobId/candidates/:candidateId/status',
  buildRejectClosedJob(
    'This job is closed. Candidate statuses on a closed job are part of its hiring history and cannot be changed.'
  ),
  candidateController.updateCandidateStatus
);

/*
 * Notes are the deliberate exception and stay writable after closure.
 *
 * They are commentary about what happened rather than part of the record of
 * what happened, and a recruiter still needs to be able to add context to a
 * finished cycle — an outcome, a reason, a note for whoever reads it next.
 */
router.patch('/:jobId/candidates/:candidateId/notes', candidateController.updateCandidateNotes);
router.post('/:jobId/candidates/:candidateId/notes', candidateController.addCandidateNote);

// Stream original candidate resume attachment on-demand from memory buffer
router.get('/:jobId/candidates/:candidateId/resume', candidateController.getCandidateResumeStream);

// List all candidate profiles for a job (supports search, minScore, experienceRange, skill, hrStatus, sort)
router.get('/:jobId/candidates', candidateController.getCandidatesByJob);

// Get individual candidate profile
router.get('/:jobId/candidates/:candidateId', candidateController.getCandidateById);

module.exports = router;
