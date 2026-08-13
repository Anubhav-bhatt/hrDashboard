const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const upload = require('../middleware/upload');

// Manual Resume Upload (Single Candidate)
router.post('/:jobId/candidates/upload', upload.single('resume'), candidateController.uploadSingleCandidate);

// Manual Resume Upload (Bulk & Folder Candidates in Chunks)
router.post('/:jobId/candidates/bulk-upload', upload.array('resumes', 50), candidateController.uploadBulkCandidates);

// Batch process candidate applications retrieved from Outlook
router.post('/:jobId/candidates/process', candidateController.processApplications);

// Analyze candidate job relevance
router.post('/:jobId/candidates/analyze-all', candidateController.analyzeAllCandidates);
router.post('/:jobId/candidates/:candidateId/analyze', candidateController.analyzeCandidate);

// Candidate HR review status & recruiter notes
router.patch('/:jobId/candidates/:candidateId/status', candidateController.updateCandidateStatus);
router.patch('/:jobId/candidates/:candidateId/notes', candidateController.updateCandidateNotes);

// Append a timestamped recruiter note to the candidate's note history
router.post('/:jobId/candidates/:candidateId/notes', candidateController.addCandidateNote);

// Stream original candidate resume attachment on-demand from memory buffer
router.get('/:jobId/candidates/:candidateId/resume', candidateController.getCandidateResumeStream);

// List all candidate profiles for a job (supports search, minScore, experienceRange, skill, hrStatus, sort)
router.get('/:jobId/candidates', candidateController.getCandidatesByJob);

// Get individual candidate profile
router.get('/:jobId/candidates/:candidateId', candidateController.getCandidateById);

module.exports = router;
