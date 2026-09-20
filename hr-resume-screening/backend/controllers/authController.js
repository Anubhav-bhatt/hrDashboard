const prisma = require('../config/prisma');
const {
  verifyPassword,
  spendVerificationCost,
  issueAccessToken,
  createSession,
  rotateSession,
  revokeSession,
  setAuthCookies,
  clearAuthCookies,
  readRefreshToken,
  toPublicUser,
  getAccessTokenTtlMinutes,
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
 * @desc    Sign in a recruiter and issue access + rotating refresh session
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

    const invalid = () =>
      res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email address or password.'
      });

    if (!user || !user.isActive) {
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

    const accessToken = issueAccessToken(updated);
    const { rawRefreshToken } = await createSession(updated.id, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip
    });

    setAuthCookies(res, accessToken, rawRefreshToken);
    console.log(`[Auth] Sign-in succeeded for user ${updated.id}`);

    return res.status(200).json({
      success: true,
      data: {
        user: toPublicUser(updated),
        expiresInMinutes: getAccessTokenTtlMinutes(),
        expiresInHours: getSessionTtlHours() // Legacy compatibility
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Rotate refresh token and issue new access token
 * @route   POST /api/auth/refresh
 * @access  Public (credentials via HttpOnly cookie)
 */
const refresh = async (req, res, next) => {
  try {
    const rawRefreshToken = readRefreshToken(req);
    if (!rawRefreshToken) {
      return res.status(401).json({
        success: false,
        code: 'REFRESH_REQUIRED',
        message: 'No refresh token provided. Please sign in again.'
      });
    }

    const { user, accessToken, newRawRefreshToken } = await rotateSession(rawRefreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip
    });

    setAuthCookies(res, accessToken, newRawRefreshToken);

    return res.status(200).json({
      success: true,
      data: {
        user: toPublicUser(user),
        expiresInMinutes: getAccessTokenTtlMinutes()
      }
    });
  } catch (error) {
    clearAuthCookies(res);
    if (error.status && error.code) {
      return res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }
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
 * @desc    End the current session, revoking refresh token and clearing cookies
 * @route   POST /api/auth/logout
 * @access  Public (idempotent)
 */
const logout = async (req, res) => {
  try {
    const rawRefreshToken = readRefreshToken(req);
    if (rawRefreshToken) {
      await revokeSession(rawRefreshToken);
    }
  } catch (err) {
    console.warn('[Auth] Error revoking session during logout:', err.message);
  } finally {
    clearAuthCookies(res);
  }
  return res.status(200).json({ success: true, message: 'Signed out successfully.' });
};

module.exports = { login, refresh, me, logout };
