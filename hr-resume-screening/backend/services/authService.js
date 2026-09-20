const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const ACCESS_COOKIE = 'hr_access';
const REFRESH_COOKIE = 'hr_refresh';
const SESSION_COOKIE = 'hr_session'; // Legacy alias

const DEFAULT_ACCESS_TTL_MINUTES = 15;
const DEFAULT_REFRESH_TTL_DAYS = 7;
const DEFAULT_LEGACY_TTL_HOURS = 12;

/**
 * Resolves the signing secret for access tokens. Refuses to boot insecurely in production.
 */
const getJwtSecret = () => {
  const secret = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set to at least 32 characters in production.');
    }
    return 'development-only-insecure-jwt-secret-change-me';
  }
  return secret;
};

const getAccessTokenTtlMinutes = () => {
  const parsed = parseInt(process.env.ACCESS_TOKEN_TTL_MINUTES || String(DEFAULT_ACCESS_TTL_MINUTES), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ACCESS_TTL_MINUTES;
};

const getRefreshTokenTtlDays = () => {
  const parsed = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || String(DEFAULT_REFRESH_TTL_DAYS), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REFRESH_TTL_DAYS;
};

const getSessionTtlHours = () => {
  const parsed = parseInt(process.env.SESSION_TTL_HOURS || String(DEFAULT_LEGACY_TTL_HOURS), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LEGACY_TTL_HOURS;
};

const BCRYPT_ROUNDS = 10;
const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
const spendVerificationCost = () => bcrypt.compare('password-that-never-matches', DUMMY_PASSWORD_HASH);

/**
 * Hashes an opaque token with SHA-256 for secure database storage.
 */
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/**
 * Generates an unguessable 320-bit (40-byte) cryptographically random refresh token.
 */
const generateRefreshToken = () => crypto.randomBytes(40).toString('hex');

/**
 * Signs a short-lived access JWT containing identity claims and an explicit token type.
 */
const issueAccessToken = (user) =>
  jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    getJwtSecret(),
    { expiresIn: `${getAccessTokenTtlMinutes()}m` }
  );

const issueExpiredAccessToken = (user) =>
  jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    getJwtSecret(),
    { expiresIn: '-1s' }
  );

/**
 * Verifies and validates an access JWT. Enforces purpose claim check.
 */
const verifyAccessToken = (token) => {
  const payload = jwt.verify(token, getJwtSecret());
  if (payload.type && payload.type !== 'access') {
    const err = new Error('Invalid token type');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return payload;
};

// Legacy alias for backwards compatibility with tests
const issueToken = (user) => issueAccessToken(user);
const verifyToken = (token) => verifyAccessToken(token);

/**
 * Base cookie options helper.
 */
const baseCookieOptions = ({ maxAge, path = '/' } = {}) => {
  const sameSite = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  return {
    httpOnly: true,
    sameSite,
    secure: sameSite === 'none' ? true : process.env.NODE_ENV === 'production',
    maxAge,
    path
  };
};

const accessCookieOptions = () =>
  baseCookieOptions({ maxAge: getAccessTokenTtlMinutes() * 60 * 1000, path: '/' });

const refreshCookieOptions = () =>
  baseCookieOptions({ maxAge: getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000, path: '/' });

/**
 * Sets both access and refresh cookies simultaneously.
 */
const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions());
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  }
  // Set legacy cookie for existing clients/tests expecting hr_session
  res.cookie(SESSION_COOKIE, accessToken, accessCookieOptions());
};

/**
 * Clears all authentication cookies across the board.
 */
const clearAuthCookies = (res) => {
  const clearOpts = { ...baseCookieOptions({ path: '/' }), maxAge: undefined };
  res.clearCookie(ACCESS_COOKIE, clearOpts);
  res.clearCookie(REFRESH_COOKIE, clearOpts);
  res.clearCookie(SESSION_COOKIE, clearOpts);
};

// Legacy aliases
const setSessionCookie = (res, token) => setAuthCookies(res, token, null);
const clearSessionCookie = (res) => clearAuthCookies(res);

/**
 * Reads access token from cookies (hr_access or hr_session) or Authorization header.
 */
const readAccessToken = (req) => {
  if (req.cookies) {
    if (req.cookies[ACCESS_COOKIE]) return req.cookies[ACCESS_COOKIE];
    if (req.cookies[SESSION_COOKIE]) return req.cookies[SESSION_COOKIE];
  }
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

const readToken = (req) => readAccessToken(req);

/**
 * Reads refresh token from hr_refresh cookie.
 */
const readRefreshToken = (req) => {
  if (req.cookies && req.cookies[REFRESH_COOKIE]) {
    return req.cookies[REFRESH_COOKIE];
  }
  return null;
};

/**
 * Creates a new refresh session in the database.
 */
const createSession = async (userId, { userAgent = null, ipAddress = null, family = null } = {}) => {
  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashToken(rawRefreshToken);
  const sessionFamily = family || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000);

  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash,
      family: sessionFamily,
      expiresAt,
      userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
      ipAddress: ipAddress ? String(ipAddress).slice(0, 100) : null
    }
  });

  return { rawRefreshToken, session };
};

/**
 * Rotates a refresh token: invalidates the old token, issues a new token in the same family,
 * checks for token reuse attacks, and issues a fresh access token.
 */
const rotateSession = async (oldRawRefreshToken, { userAgent = null, ipAddress = null } = {}) => {
  if (!oldRawRefreshToken || typeof oldRawRefreshToken !== 'string') {
    const err = new Error('Refresh token required.');
    err.code = 'REFRESH_REQUIRED';
    err.status = 401;
    throw err;
  }

  const oldTokenHash = hashToken(oldRawRefreshToken);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: oldTokenHash },
    include: { user: true }
  });

  if (!session) {
    const err = new Error('Session is invalid. Please sign in again.');
    err.code = 'INVALID_REFRESH_TOKEN';
    err.status = 401;
    throw err;
  }

  // SUSPECTED REUSE DETECTED: Someone attempted to use a refresh token that has already been revoked.
  // Invalidate the entire rotation family to protect the user from session hijacking.
  if (session.revokedAt) {
    console.warn(`[Auth Security] Refresh reuse detected for family ${session.family}! Revoking session family.`);
    await prisma.authSession.updateMany({
      where: { family: session.family, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    const err = new Error('Session reuse detected. All sessions in this chain have been revoked. Please sign in again.');
    err.code = 'REFRESH_REUSE_DETECTED';
    err.status = 401;
    throw err;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    const err = new Error('Refresh token expired. Please sign in again.');
    err.code = 'REFRESH_EXPIRED';
    err.status = 401;
    throw err;
  }

  if (!session.user || !session.user.isActive) {
    const err = new Error('Your account is no longer active.');
    err.code = 'ACCOUNT_DISABLED';
    err.status = 401;
    throw err;
  }

  // Atomic rotation inside a database transaction
  const newRawRefreshToken = generateRefreshToken();
  const newTokenHash = hashToken(newRawRefreshToken);
  const newExpiresAt = new Date(Date.now() + getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() }
    }),
    prisma.authSession.create({
      data: {
        userId: session.userId,
        tokenHash: newTokenHash,
        family: session.family,
        expiresAt: newExpiresAt,
        userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
        ipAddress: ipAddress ? String(ipAddress).slice(0, 100) : null
      }
    })
  ]);

  const newAccessToken = issueAccessToken(session.user);
  return { user: session.user, accessToken: newAccessToken, newRawRefreshToken };
};

/**
 * Revokes a session on user sign out.
 */
const revokeSession = async (rawRefreshToken) => {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') return;
  const tokenHash = hashToken(rawRefreshToken);
  await prisma.authSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
};

const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  lastLoginAt: user.lastLoginAt || null
});

const ensureSeedUser = async () => {
  const count = await prisma.user.count();
  if (count > 0) return { created: false };

  const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || '';

  if (!email || password.length < 8) {
    return {
      created: false,
      warning:
        'No recruiter accounts exist. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min 8 chars) and restart, or run: npm run seed:user'
    };
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      name: process.env.SEED_ADMIN_NAME || 'HR Administrator',
      role: 'ADMIN'
    }
  });

  return { created: true, email };
};

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  getAccessTokenTtlMinutes,
  getRefreshTokenTtlDays,
  getSessionTtlHours,
  hashPassword,
  verifyPassword,
  spendVerificationCost,
  hashToken,
  generateRefreshToken,
  issueAccessToken,
  issueExpiredAccessToken,
  verifyAccessToken,
  issueToken,
  verifyToken,
  setAuthCookies,
  clearAuthCookies,
  setSessionCookie,
  clearSessionCookie,
  readAccessToken,
  readRefreshToken,
  readToken,
  createSession,
  rotateSession,
  revokeSession,
  toPublicUser,
  ensureSeedUser
};
