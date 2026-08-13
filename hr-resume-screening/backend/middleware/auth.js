const prisma = require('../config/prisma');
const { readToken, verifyToken } = require('../services/authService');

/**
 * Rejects the request unless it carries a valid, unexpired session for an
 * active user. Every candidate/job/analytics route sits behind this because
 * candidate records contain personal data.
 */
const requireAuth = async (req, res, next) => {
  const token = readToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required. Please sign in to continue.'
    });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      code: expired ? 'SESSION_EXPIRED' : 'INVALID_SESSION',
      message: expired
        ? 'Your session has expired. Please sign in again.'
        : 'Your session is no longer valid. Please sign in again.'
    });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_SESSION',
        message: 'Your account is no longer active. Please contact an administrator.'
      });
    }

    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * Restricts a route to the listed roles. Used for destructive operations that a
 * standard recruiter should not perform.
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required. Please sign in to continue.'
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.'
    });
  }

  return next();
};

module.exports = { requireAuth, requireRole };
