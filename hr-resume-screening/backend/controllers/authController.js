const prisma = require('../config/prisma');
const {
  verifyPassword,
  spendVerificationCost,
  issueToken,
  setSessionCookie,
  clearSessionCookie,
  toPublicUser,
  getSessionTtlHours
} = require('../services/authService');

/** Masks an email for logs: r****l@example.com */
const maskEmail = (email = '') => {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  const visible = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : '***';
  return `${visible}@${domain}`;
};

/**
 * @desc    Sign in a recruiter and start a session
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Email address and password are both required.'
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }
    });

    // Identical response for unknown email and wrong password so the endpoint
    // cannot be used to enumerate valid recruiter accounts.
    const invalid = () =>
      res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email address or password.'
      });

    if (!user || !user.isActive) {
      // Spend the same verification cost as a real attempt so response timing
      // does not reveal whether the account exists.
      await spendVerificationCost();
      console.warn(`[Auth] Failed sign-in attempt for ${maskEmail(email)}`);
      return invalid();
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      console.warn(`[Auth] Failed sign-in attempt for ${maskEmail(email)}`);
      return invalid();
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    setSessionCookie(res, issueToken(updated));
    console.log(`[Auth] Sign-in succeeded for user ${updated.id}`);

    return res.status(200).json({
      success: true,
      data: { user: toPublicUser(updated), expiresInHours: getSessionTtlHours() }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Return the signed-in recruiter
 * @route   GET /api/auth/me
 * @access  Private
 */
const me = async (req, res) =>
  res.status(200).json({ success: true, data: { user: req.user } });

/**
 * @desc    End the current session
 * @route   POST /api/auth/logout
 * @access  Public (idempotent)
 */
const logout = async (req, res) => {
  clearSessionCookie(res);
  return res.status(200).json({ success: true, message: 'Signed out successfully.' });
};

module.exports = { login, me, logout };
