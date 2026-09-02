const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { runAgent, getConfig } = require('../controllers/aiController');

// Throttle AI agent requests to protect provider quota and prevent runaway client loops.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.AI_RATE_LIMIT || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'AI_RATE_LIMITED',
    message: 'Too many AI requests. Please slow down and try again shortly.'
  }
});

// Single AI entry point. Authentication is applied where this router is mounted
// (server.js), exactly as it is for jobs, candidates and analytics — there is no
// separate auth path for AI and no anonymous variant of this route.
//
// The route is mounted whether or not AI is enabled. A disabled installation
// answers with a controlled AI_DISABLED response rather than a 404, so a client
// can tell "switched off" apart from "wrong URL".
router.post('/run', aiLimiter, runAgent);

// Feature-flag state for the browser, so the UI can decide whether to offer AI
// navigation. Authenticated like everything else here — the set of features an
// installation runs is not something an anonymous caller needs to enumerate.
router.get('/config', getConfig);

module.exports = router;
