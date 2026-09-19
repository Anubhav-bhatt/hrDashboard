const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { signup, login, me, refresh, logout } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Throttle credential submissions to blunt password guessing.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many sign-in attempts. Please wait a few minutes and try again.'
  }
});

/**
 * Refresh gets its own, much larger budget.
 *
 * It is not a credential-guessing surface — the token is 384 bits of entropy,
 * so a limiter is not what stops a brute force. What it does stop is a client
 * bug spinning on the endpoint. The budget has to clear honest traffic
 * comfortably: an office behind one NAT address shares this counter, and each
 * recruiter refreshes roughly four times an hour per browser. Sharing the
 * sign-in limit of 20 would sign a whole team out mid-afternoon.
 */
const refreshLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.REFRESH_RATE_LIMIT || '300', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please wait a moment and try again.'
  }
});

/**
 * Signup is the one endpoint that creates rows for an unauthenticated caller, so
 * it gets the tightest budget of the three. It is sized for people, not scripts:
 * an office behind one address might legitimately register a handful of
 * colleagues in an afternoon, and nobody signs up twenty times.
 */
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.SIGNUP_RATE_LIMIT || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many accounts created from this network. Please try again later.'
  }
});

router.post('/signup', signupLimiter, signup);
router.post('/login', loginLimiter, login);
router.post('/refresh', refreshLimiter, refresh);
router.get('/me', requireAuth, me);
router.post('/logout', logout);

module.exports = router;
