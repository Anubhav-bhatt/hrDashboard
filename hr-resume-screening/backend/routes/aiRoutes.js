const express = require('express');
const router = express.Router();
const { runAgent } = require('../controllers/aiController');

// Single AI entry point. Authentication is applied where this router is mounted
// (server.js), exactly as it is for jobs, candidates and analytics — there is no
// separate auth path for AI and no anonymous variant of this route.
//
// The route is mounted whether or not AI is enabled. A disabled installation
// answers with a controlled AI_DISABLED response rather than a 404, so a client
// can tell "switched off" apart from "wrong URL".
router.post('/run', runAgent);

module.exports = router;
