const express = require('express');
const router = express.Router();
const { listCandidates, getCandidate, getFilterOptions } = require('../controllers/globalCandidateController');

// Static path is registered before the :candidateId parameter so "filters" is
// never treated as a candidate ID.
router.get('/filters', getFilterOptions);

// Cross-job candidate listing (supports search, filters, sort, page & limit)
router.get('/', listCandidates);

// Full candidate profile by ID
router.get('/:candidateId', getCandidate);

module.exports = router;
