const prisma = require('../config/prisma');
const { readAccessToken, verifyAccessToken } = require('../services/authService');

/**
 * Rejects the request unless it carries a valid, unexpired access token for an
 * active user. Every candidate/job/analytics route sits behind this because
 * candidate records contain personal data.
 *
 * The `code` on a 401 is load-bearing: the browser client refreshes on
 * SESSION_EXPIRED and only on SESSION_EXPIRED. AUTH_REQUIRED (no credential at
 * all) and INVALID_SESSION (a credential that will never work again) both mean
 * "stop and sign in", and a refresh attempt for either would be a wasted round
 * trip at best and a redirect loop at worst.
 */
const requireAuth = async (req, res, next) => {
  const token = readAccessToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required. Please sign in to continue.'
    });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
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
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        // Resolved here rather than per query: requireAuth already loads the
        // user, so the tenant costs no extra round trip.
        memberships: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          // The name comes along on a query that already runs, so the app shell
          // can say which workspace the recruiter is in without a second call.
          select: { workspaceId: true, role: true, workspace: { select: { id: true, name: true } } }
        }
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_SESSION',
        message: 'Your account is no longer active. Please contact an administrator.'
      });
    }

    const membership = user.memberships && user.memberships[0];

    // No workspace means no records — never every record. An account can only
    // reach this state if it was created outside signup and outside the seeding
    // paths, so it is a misconfiguration worth naming rather than a silent
    // empty dashboard.
    if (!membership) {
      console.warn(`[Auth] User ${user.id} has no workspace membership; refusing scoped access.`);
      return res.status(403).json({
        success: false,
        code: 'NO_WORKSPACE',
        message: 'Your account is not attached to a workspace yet. Please contact an administrator.'
      });
    }

    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    req.workspaceId = membership.workspaceId;
    req.workspaceRole = membership.role;
    req.workspace = membership.workspace ? { ...membership.workspace, role: membership.role } : null;
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * Restricts a route to the listed roles. Used for destructive operations that a
 * standard recruiter should not perform.
 *
 * This answers "may you", not "who are you", so it returns 403 and never 401 —
 * refreshing a token cannot turn a recruiter into an administrator, and a client
 * that retried this after a refresh would loop forever.
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
