const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { login, me, logout } = require('../controllers/authController');
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

router.post('/login', loginLimiter, login);
router.get('/me', requireAuth, me);
router.post('/logout', logout);

module.exports = router;
