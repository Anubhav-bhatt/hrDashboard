const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const SESSION_COOKIE = 'hr_session';
const DEFAULT_TTL_HOURS = 12;

/**
 * Resolves the signing secret. The server refuses to start without one in
 * production so a deployment can never fall back to a guessable default.
 */
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set to at least 32 characters in production.');
    }
    // Development-only fallback so a fresh clone can boot without configuration.
    return 'development-only-insecure-jwt-secret-change-me';
  }
  return secret;
};

const getSessionTtlHours = () => {
  const parsed = parseInt(process.env.SESSION_TTL_HOURS || String(DEFAULT_TTL_HOURS), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_HOURS;
};

const BCRYPT_ROUNDS = 10;

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);

const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

/**
 * A real hash of a random secret, computed once at startup.
 *
 * The sign-in handler compares against this when the account does not exist, so
 * the unknown-email path costs the same as the wrong-password path and cannot be
 * used to enumerate accounts by response time. It must be a *valid* hash — a
 * hand-written placeholder returns almost immediately and equalizes nothing.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(require('crypto').randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

/** Spends the same work as a real verification, always failing. */
const spendVerificationCost = () => bcrypt.compare('password-that-never-matches', DUMMY_PASSWORD_HASH);

/**
 * Signs a short-lived session token. Only non-sensitive claims are embedded.
 */
const issueToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email, role: user.role }, getJwtSecret(), {
    expiresIn: `${getSessionTtlHours()}h`
  });

const verifyToken = (token) => jwt.verify(token, getJwtSecret());

/**
 * Cookie options for the session cookie. httpOnly keeps the token out of reach
 * of any script on the page; sameSite=lax stops cross-site form posts from
 * riding along on state-changing requests. Cross-site production deployments can
 * configure COOKIE_SAME_SITE=none (which enforces secure=true).
 */
const cookieOptions = () => {
  const sameSite = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  return {
    httpOnly: true,
    sameSite,
    secure: sameSite === 'none' ? true : process.env.NODE_ENV === 'production',
    maxAge: getSessionTtlHours() * 60 * 60 * 1000,
    path: '/'
  };
};

const setSessionCookie = (res, token) => res.cookie(SESSION_COOKIE, token, cookieOptions());

const clearSessionCookie = (res) =>
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });

/**
 * Reads the bearer token from the session cookie, falling back to the
 * Authorization header so API clients and tests can authenticate too.
 */
const readToken = (req) => {
  if (req.cookies && req.cookies[SESSION_COOKIE]) return req.cookies[SESSION_COOKIE];
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

/** Shape a user record for API responses — never exposes the password hash. */
const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  lastLoginAt: user.lastLoginAt || null
});

/**
 * Creates the first recruiter account when the users table is empty so a fresh
 * install is reachable. Credentials come from the environment only.
 */
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
  SESSION_COOKIE,
  getSessionTtlHours,
  hashPassword,
  verifyPassword,
  spendVerificationCost,
  issueToken,
  verifyToken,
  setSessionCookie,
  clearSessionCookie,
  readToken,
  toPublicUser,
  ensureSeedUser
};
