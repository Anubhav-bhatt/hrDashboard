const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { ensureWorkspaceForUser } = require('./workspaceService');

/**
 * Authentication tokens.
 *
 * Two tokens with two different jobs, deliberately not interchangeable:
 *
 *   access   short-lived signed JWT, carried in the `hr_access` cookie, proves
 *            who the caller is on every request. Stateless, so verifying it
 *            costs no database round trip.
 *   refresh  long-lived opaque random string, carried in the `hr_refresh`
 *            cookie, redeemable exactly once for a new pair. Only its SHA-256
 *            is stored, in `AuthSession`, so the server can revoke a session and
 *            recognise a replayed token.
 *
 * The split is what makes revocation possible without paying for a database
 * lookup on every API call: the stateless half expires in minutes, the stateful
 * half is only consulted when it is redeemed.
 */

const ACCESS_COOKIE = 'hr_access';
const REFRESH_COOKIE = 'hr_refresh';

/**
 * Cookie written by the previous single-token design. It is never read as a
 * credential — honouring it would mean accepting a 12-hour token minted before
 * purpose claims existed — but it is cleared wherever cookies are set or
 * cleared, so an upgrading browser is not left carrying a dead cookie.
 */
const LEGACY_SESSION_COOKIE = 'hr_session';

/**
 * The refresh cookie is scoped to the auth routes, so it is not attached to the
 * hundreds of ordinary API calls that have no use for it. Both endpoints that
 * need it — refresh and logout — live under this prefix.
 */
const REFRESH_COOKIE_PATH = '/api/auth';

const DEFAULT_ACCESS_TTL_MINUTES = 15;
const DEFAULT_REFRESH_TTL_DAYS = 14;
const DEFAULT_REUSE_GRACE_SECONDS = 15;

const TOKEN_PURPOSE_ACCESS = 'access';

/* ------------------------------------------------------------------ config -- */

const positiveNumber = (raw, fallback) => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Signing secret for access tokens.
 *
 * ACCESS_TOKEN_SECRET is preferred; JWT_SECRET is accepted so an existing
 * deployment keeps booting without a configuration change. Production still
 * refuses to run on a short secret.
 */
const getAccessSecret = () => {
  const secret = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ACCESS_TOKEN_SECRET (or JWT_SECRET) must be at least 32 characters in production.');
    }
    // Development-only fallback so a fresh clone can boot without configuration.
    return 'development-only-insecure-jwt-secret-change-me';
  }
  return secret;
};

/** Access token lifetime in minutes. Short by design: it cannot be revoked. */
const getAccessTtlMinutes = () =>
  positiveNumber(process.env.ACCESS_TOKEN_TTL_MINUTES, DEFAULT_ACCESS_TTL_MINUTES);

/**
 * Refresh session lifetime in days.
 *
 * Default 14. No business requirement for session length was recorded anywhere
 * in this repository, so this is a stated default rather than a discovered one:
 * a recruiter working a hiring cycle should sign in about once a fortnight
 * rather than twice a day, and a fortnight is short enough that a device which
 * quietly leaves the company's hands stops working within one pay cycle.
 * Configurable per deployment.
 */
const getRefreshTtlDays = () =>
  positiveNumber(process.env.REFRESH_TOKEN_TTL_DAYS, DEFAULT_REFRESH_TTL_DAYS);

/**
 * How long a just-rotated refresh token still counts as an honest race rather
 * than a replay.
 *
 * Two tabs waking at the same moment legitimately present the same token. With
 * no window at all, one of them would revoke the family and sign the recruiter
 * out for doing nothing wrong. Set to 0 for strict single-use.
 */
const getReuseGraceSeconds = () => {
  const raw = process.env.REFRESH_REUSE_GRACE_SECONDS;
  if (raw === undefined || raw === '') return DEFAULT_REUSE_GRACE_SECONDS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_REUSE_GRACE_SECONDS;
};

/** Total session length in hours — part of the login response contract. */
const getSessionTtlHours = () => getRefreshTtlDays() * 24;

/* ---------------------------------------------------------------- password -- */

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
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

/** Spends the same work as a real verification, always failing. */
const spendVerificationCost = () => bcrypt.compare('password-that-never-matches', DUMMY_PASSWORD_HASH);

/* ------------------------------------------------------------ access token -- */

/**
 * Signs an access token. `typ` states what the token is for, so a token minted
 * for one purpose cannot be presented for another even if two secrets were ever
 * configured to the same value.
 */
const issueAccessToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion || 1,
      typ: TOKEN_PURPOSE_ACCESS
    },
    getAccessSecret(),
    { expiresIn: `${getAccessTtlMinutes()}m` }
  );

/**
 * Verifies an access token and rejects anything that is not one.
 *
 * Throws with `name = 'TokenExpiredError'` for an expired token so callers can
 * tell "your session lapsed" from "this is not a valid credential at all".
 */
const verifyAccessToken = (token) => {
  const payload = jwt.verify(token, getAccessSecret());
  if (payload.typ !== TOKEN_PURPOSE_ACCESS) {
    const error = new Error('Token is not an access token.');
    error.name = 'InvalidTokenPurposeError';
    throw error;
  }
  return payload;
};

/* ----------------------------------------------------------- refresh token -- */

/** 48 random bytes, URL-safe. Opaque: it carries no claims and means nothing offline. */
const generateRefreshToken = () => crypto.randomBytes(48).toString('base64url');

/**
 * SHA-256, hex.
 *
 * A fast hash is the right choice here and bcrypt is not: the token is 384 bits
 * of machine-generated entropy rather than a human-chosen password, so there is
 * no dictionary to slow an attacker down, and a deterministic digest is what
 * lets the lookup be a single indexed query instead of a scan over every row.
 */
const hashRefreshToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Trimmed so a session row carries a hint for review, not a device fingerprint. */
const summarizeUserAgent = (req) => {
  const raw = req && req.headers ? req.headers['user-agent'] : null;
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 180) : null;
};

/**
 * Creates a refresh session row and returns the raw token.
 *
 * The raw token is handed back exactly once, to be written straight into a
 * cookie. It is never logged, never persisted and never serialized into a
 * response body.
 */
const createRefreshSession = async ({ userId, familyId, userAgent = null, client = prisma }) => {
  const token = generateRefreshToken();
  const expiresAt = new Date(Date.now() + getRefreshTtlDays() * 24 * 60 * 60 * 1000);

  const session = await client.authSession.create({
    data: {
      userId,
      refreshTokenHash: hashRefreshToken(token),
      familyId: familyId || crypto.randomUUID(),
      expiresAt,
      userAgent
    }
  });

  return { token, session };
};

/** Revokes every live session in a lineage. Used when a replay is detected. */
const revokeFamily = (familyId, reason, client = prisma) =>
  client.authSession.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason }
  });

/** Revokes one session by id, if it is still live. */
const revokeSession = (id, reason, client = prisma) =>
  client.authSession.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason }
  });

/** Revokes every live session for a user. Used when an account is disabled. */
const revokeAllUserSessions = (userId, reason = 'REVOKED', client = prisma) =>
  client.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason }
  });

/** Revokes other sessions for a user, keeping the current family active. Used on password change. */
const revokeOtherUserSessions = (userId, currentFamilyId, reason = 'PASSWORD_CHANGED', client = prisma) =>
  client.authSession.updateMany({
    where: { userId, familyId: { not: currentFamilyId }, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason }
  });

/* ---------------------------------------------------------------- cookies --- */

/**
 * Shared cookie attributes.
 *
 * `sameSite=lax` is correct now that the browser reaches the API on its own
 * origin through the Vercel rewrite: the cookie is first-party, which is what
 * makes Safari store it at all. A deployment that genuinely still needs
 * cross-site cookies can set COOKIE_SAME_SITE=none, which forces secure=true —
 * but that is precisely the configuration Safari's tracking prevention blocks,
 * so it is no longer the default and should not be used with the proxy in place.
 */
const baseCookieOptions = () => {
  const sameSite = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  return {
    httpOnly: true,
    sameSite,
    secure: sameSite === 'none' ? true : process.env.NODE_ENV === 'production'
  };
};

const accessCookieOptions = () => ({
  ...baseCookieOptions(),
  path: '/',
  maxAge: getAccessTtlMinutes() * 60 * 1000
});

const refreshCookieOptions = () => ({
  ...baseCookieOptions(),
  path: REFRESH_COOKIE_PATH,
  maxAge: getRefreshTtlDays() * 24 * 60 * 60 * 1000
});

const withoutMaxAge = (options) => {
  const copy = { ...options };
  delete copy.maxAge;
  return copy;
};

const setAccessCookie = (res, token) => res.cookie(ACCESS_COOKIE, token, accessCookieOptions());

const setRefreshCookie = (res, token) => res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());

/**
 * Clears both cookies, plus the legacy one.
 *
 * `maxAge` is dropped and every remaining attribute is kept identical to the
 * ones used when setting. A browser only discards a cookie when path, domain,
 * secure and sameSite all match, so a mismatch here would quietly leave the
 * cookie in place and make logout look like it had worked when it had not.
 */
const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE, withoutMaxAge(accessCookieOptions()));
  res.clearCookie(REFRESH_COOKIE, withoutMaxAge(refreshCookieOptions()));
  res.clearCookie(LEGACY_SESSION_COOKIE, withoutMaxAge(accessCookieOptions()));
};

/** Writes a freshly issued pair. */
const setAuthCookies = (res, { accessToken, refreshToken }) => {
  setAccessCookie(res, accessToken);
  setRefreshCookie(res, refreshToken);
  // A browser upgrading from the previous design carries a cookie that will
  // never be honoured again; drop it rather than leave it to expire on its own.
  res.clearCookie(LEGACY_SESSION_COOKIE, withoutMaxAge(accessCookieOptions()));
};

/* ----------------------------------------------------------------- reading -- */

/**
 * Reads the access token from its cookie, falling back to an Authorization
 * header so server-to-server API tooling can still authenticate. The bearer
 * value is verified as an access token like any other, so a refresh token
 * presented this way is rejected on its purpose claim.
 */
const readAccessToken = (req) => {
  if (req.cookies && req.cookies[ACCESS_COOKIE]) return req.cookies[ACCESS_COOKIE];
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

const readRefreshToken = (req) => (req.cookies && req.cookies[REFRESH_COOKIE]) || null;

/* -------------------------------------------------------------------- user -- */

/** Shape a user record for API responses — never exposes the password hash. */
const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  isActive: user.isActive !== undefined ? Boolean(user.isActive) : true,
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

  // Safety invariant: never overwrite an existing user account if one already exists with this email
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { created: false };

  const name = process.env.SEED_ADMIN_NAME || 'HR Administrator';

  // The account and its workspace are created together. An account with no
  // workspace can sign in and then be refused by every scoped query, which looks
  // like a broken install rather than a missing row.
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, passwordHash: await hashPassword(password), name, role: 'ADMIN' }
    });
    await ensureWorkspaceForUser(tx, { userId: user.id, userName: name, email });
  });

  return { created: true, email };
};

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  LEGACY_SESSION_COOKIE,
  REFRESH_COOKIE_PATH,
  TOKEN_PURPOSE_ACCESS,

  getAccessTtlMinutes,
  getRefreshTtlDays,
  getReuseGraceSeconds,
  getSessionTtlHours,

  hashPassword,
  verifyPassword,
  spendVerificationCost,

  issueAccessToken,
  verifyAccessToken,

  generateRefreshToken,
  hashRefreshToken,
  createRefreshSession,
  revokeFamily,
  revokeSession,
  revokeAllUserSessions,
  revokeOtherUserSessions,
  summarizeUserAgent,

  accessCookieOptions,
  refreshCookieOptions,
  setAccessCookie,
  setRefreshCookie,
  setAuthCookies,
  clearAuthCookies,

  readAccessToken,
  readRefreshToken,

  toPublicUser,
  ensureSeedUser
};
