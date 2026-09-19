const crypto = require('crypto');
const prisma = require('../config/prisma');
const {
  verifyPassword,
  hashPassword,
  spendVerificationCost,
  issueAccessToken,
  hashRefreshToken,
  createRefreshSession,
  revokeFamily,
  revokeSession,
  summarizeUserAgent,
  setAccessCookie,
  setAuthCookies,
  clearAuthCookies,
  readRefreshToken,
  getReuseGraceSeconds,
  toPublicUser,
  getSessionTtlHours,
  getAccessTtlMinutes
} = require('../services/authService');
const { createWorkspaceForUser } = require('../services/workspaceService');

/** Masks an email for logs: r***l@example.com */
const maskEmail = (email = '') => {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  const visible = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : '***';
  return `${visible}@${domain}`;
};

/**
 * Issues a fresh access + refresh pair and writes both cookies.
 *
 * `familyId` carries the rotation lineage forward: every pair minted from one
 * sign-in shares it, so a replayed token can be traced to the family it came
 * from and that whole lineage revoked.
 */
const issuePair = async ({ res, user, familyId, req, client }) => {
  const { token: refreshToken, session } = await createRefreshSession({
    userId: user.id,
    familyId,
    userAgent: summarizeUserAgent(req),
    client
  });

  setAuthCookies(res, { accessToken: issueAccessToken(user), refreshToken });
  return session;
};

const MIN_PASSWORD_LENGTH = 10;

/**
 * A handful of passwords that are genuinely guessed first, not a policy.
 *
 * Deliberately tiny. A long checklist of character-class rules makes people
 * write Password1! and reuse it everywhere; a length floor plus a check that the
 * password is not the obvious one for *this* account buys more than symbols do.
 */
const OBVIOUS_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '1234567890',
  '12345678901',
  'qwertyuiop',
  'letmein123',
  'welcome123',
  'iloveyou123',
  'admin12345'
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates a signup submission.
 *
 * Returns a map of field -> message so the client can put each message beside
 * the input it belongs to rather than showing one banner for everything.
 */
const validateSignup = ({ name, email, password }) => {
  const errors = {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.name = 'Enter your full name.';
  } else if (name.trim().length > 120) {
    errors.name = 'That name is too long.';
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    errors.email = 'Enter your work email address.';
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (!password || typeof password !== 'string') {
    errors.password = 'Choose a password.';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (OBVIOUS_PASSWORDS.has(password.toLowerCase())) {
    errors.password = 'That password is too easy to guess. Try something less common.';
  } else if (new Set(password).size < 4) {
    errors.password = 'That password is too repetitive. Try something less predictable.';
  } else {
    const local = String(email || '').split('@')[0].toLowerCase();
    if (local.length >= 3 && password.toLowerCase().includes(local)) {
      errors.password = 'Your password should not contain your email address.';
    }
  }

  return errors;
};

/**
 * @desc    Create an account, its workspace, and sign the person straight in
 * @route   POST /api/auth/signup
 * @access  Public
 *
 * Everything happens in one transaction: the account, the workspace it owns, the
 * membership that links them and the refresh session. A half-made account — one
 * that can authenticate but has no workspace — would sign in successfully and
 * then be refused by every scoped query, which reads as a broken product rather
 * than a missing row.
 *
 * `role` is not accepted from the request. A public caller cannot choose to be
 * an administrator, so the field is not read at all rather than read and
 * filtered.
 */
const signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    const errors = validateSignup({ name, email, password });
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Please check the highlighted fields.',
        errors
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const displayName = name.trim();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      // Sign-in deliberately hides whether an account exists; signup cannot —
      // the person has to be told the address is taken, or they cannot proceed.
      // Nothing beyond that fact is revealed.
      return res.status(409).json({
        success: false,
        code: 'EMAIL_IN_USE',
        message: 'An account already exists with this email.',
        errors: { email: 'An account already exists with this email.' }
      });
    }

    const passwordHash = await hashPassword(password);
    const userAgent = summarizeUserAgent(req);
    const familyId = crypto.randomUUID();

    const { user, refreshToken } = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: displayName,
          // The least-privileged ordinary role. Elevation is an administrative
          // act, never a signup-form choice.
          role: 'RECRUITER',
          lastLoginAt: new Date()
        }
      });

      await createWorkspaceForUser(tx, {
        userId: created.id,
        userName: displayName,
        email: normalizedEmail
      });

      const { token } = await createRefreshSession({
        userId: created.id,
        familyId,
        userAgent,
        client: tx
      });

      return { user: created, refreshToken: token };
    });

    // Cookies are written only once the transaction has committed. Setting them
    // inside would leave the browser holding a session for an account that was
    // rolled away.
    setAuthCookies(res, { accessToken: issueAccessToken(user), refreshToken });

    console.log(`[Auth] Account created for user ${user.id} with a new workspace.`);

    return res.status(201).json({
      success: true,
      data: {
        user: toPublicUser(user),
        expiresInHours: getSessionTtlHours(),
        accessTokenTtlMinutes: getAccessTtlMinutes()
      }
    });
  } catch (error) {
    // A unique-constraint violation here means two signups for the same address
    // raced. The loser is told the same thing it would have been told above.
    if (error && error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        code: 'EMAIL_IN_USE',
        message: 'An account already exists with this email.',
        errors: { email: 'An account already exists with this email.' }
      });
    }
    next(error);
  }
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

    // A new sign-in opens a new lineage rather than joining an existing one, so
    // signing in on a second device cannot revoke the first.
    const session = await issuePair({ res, user: updated, familyId: crypto.randomUUID(), req });

    console.log(`[Auth] Sign-in succeeded for user ${updated.id} (session ${session.id})`);

    return res.status(200).json({
      success: true,
      data: {
        user: toPublicUser(updated),
        expiresInHours: getSessionTtlHours(),
        accessTokenTtlMinutes: getAccessTtlMinutes()
      }
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
  res.status(200).json({ success: true, data: { user: req.user, workspace: req.workspace || null } });

/**
 * @desc    Exchange a refresh token for a new access + refresh pair
 * @route   POST /api/auth/refresh
 * @access  Public (the refresh cookie is the credential)
 *
 * Rotation is unconditional: a refresh token is redeemable exactly once. The
 * old row is kept rather than deleted, because a revoked row is what lets a
 * replay be recognised as a replay instead of merely being unknown.
 */
const refresh = async (req, res, next) => {
  const presented = readRefreshToken(req);

  const reject = (code, message) => {
    clearAuthCookies(res);
    return res.status(401).json({ success: false, code, message });
  };

  if (!presented) {
    return reject('AUTH_REQUIRED', 'Please sign in to continue.');
  }

  try {
    const presentedHash = hashRefreshToken(presented);
    const existing = await prisma.authSession.findUnique({ where: { refreshTokenHash: presentedHash } });

    if (!existing) {
      // Either never issued here, or issued before a secret/database change.
      // Nothing to revoke; clear the cookies so the browser stops resending it.
      console.warn('[Auth] Refresh presented an unrecognised token.');
      return reject('INVALID_SESSION', 'Your session is no longer valid. Please sign in again.');
    }

    if (existing.revokedAt) {
      const graceMs = getReuseGraceSeconds() * 1000;
      const withinGrace =
        existing.replacedById && Date.now() - existing.revokedAt.getTime() <= graceMs;

      if (!withinGrace) {
        // A token that was already spent is being presented again outside any
        // plausible race. Treat the whole lineage as compromised: the holder of
        // the newer token cannot be distinguished from the thief, so neither
        // keeps the session.
        await revokeFamily(existing.familyId, 'REUSE_DETECTED');
        console.warn(
          `[Auth] Refresh token reuse detected for user ${existing.userId}; revoked family ${existing.familyId}.`
        );
        return reject('INVALID_SESSION', 'Your session is no longer valid. Please sign in again.');
      }

      // Inside the grace window this is two tabs waking together, not a thief.
      // Converge on the live head of the family instead of revoking it.
      const head = await findFamilyHead(existing.familyId);

      if (!head) {
        return reject('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
      }

      const user = await prisma.user.findUnique({ where: { id: head.userId } });
      if (!user || !user.isActive) {
        await revokeFamily(existing.familyId, 'USER_INACTIVE');
        return reject('INVALID_SESSION', 'Your account is no longer active. Please contact an administrator.');
      }

      const rotated = await rotateOrConverge({ req, res, current: head, user });
      if (!rotated) {
        return rejectWithoutClearing(res, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
      }

      console.log(
        `[Auth] Concurrent refresh ${rotated.outcome} for user ${user.id} (session ${rotated.sessionId}).`
      );
      return res.status(200).json({
        success: true,
        data: { user: toPublicUser(user), accessTokenTtlMinutes: getAccessTtlMinutes() }
      });
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      await revokeSession(existing.id, 'EXPIRED');
      return reject('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    }

    const user = await prisma.user.findUnique({ where: { id: existing.userId } });
    if (!user || !user.isActive) {
      await revokeFamily(existing.familyId, 'USER_INACTIVE');
      return reject('INVALID_SESSION', 'Your account is no longer active. Please contact an administrator.');
    }

    const rotated = await rotateOrConverge({ req, res, current: existing, user });
    if (!rotated) {
      console.warn(`[Auth] Refresh could not converge on a live session for user ${user.id}.`);
      return rejectWithoutClearing(res, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    }

    console.log(`[Auth] Refresh ${rotated.outcome} for user ${user.id} (session ${rotated.sessionId}).`);
    return res.status(200).json({
      success: true,
      data: { user: toPublicUser(user), accessTokenTtlMinutes: getAccessTtlMinutes() }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Atomically spends one session and mints its replacement.
 *
 * The guard is `revokedAt: null` inside an `updateMany`, which Postgres executes
 * as a single conditional UPDATE. Two requests arriving together therefore see
 * exactly one row updated and one row not: the loser gets `count === 0` and is
 * told so, rather than both minting a token from the same parent.
 *
 * Returns the new session, or null if this caller lost the race.
 */
const rotate = async ({ req, current, user }) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.authSession.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'ROTATED' }
    });

    if (count === 0) return null;

    const { token: refreshToken, session } = await createRefreshSession({
      userId: user.id,
      familyId: current.familyId,
      userAgent: summarizeUserAgent(req),
      client: tx
    });

    await tx.authSession.update({
      where: { id: current.id },
      data: { replacedById: session.id, lastUsedAt: new Date() }
    });

    return { session, refreshToken };
  });

/** The live, unexpired session at the end of a rotation chain, if any. */
const findFamilyHead = (familyId) =>
  prisma.authSession.findFirst({
    where: { familyId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' }
  });

/**
 * Spends the session, or recovers cleanly if a concurrent request spent it.
 *
 * Losing the race is not a failure. Two tabs waking together present the same
 * cookie, one of them spends it first, and the other finds the row already
 * revoked. The session is alive — it has simply moved on.
 *
 * The loser deliberately does *not* rotate again. It cannot: it only ever held
 * the digest of the winner's new token, never the token itself. What it can do
 * is confirm the family still has a live head and mint a fresh access token,
 * which is all its caller actually needed. The winner has already written the
 * new refresh cookie to the jar both tabs share.
 *
 * So exactly one rotation happens per spent token however many requests arrive,
 * and no request is told to sign in while the session is still good.
 *
 * Returns 'rotated', 'converged', or null when the family is genuinely gone.
 */
const rotateOrConverge = async ({ req, res, current, user }) => {
  const rotated = await rotate({ req, current, user });
  if (rotated) {
    commitRotation(res, user, rotated);
    return { outcome: 'rotated', sessionId: rotated.session.id };
  }

  const head = await findFamilyHead(current.familyId);
  if (!head) return null;

  setAccessCookie(res, issueAccessToken(user));
  return { outcome: 'converged', sessionId: head.id };
};

/**
 * Refuses the request without touching the cookies.
 *
 * Used where the session may well still be alive and another response is
 * carrying the good cookies. Clearing here would be actively harmful: tabs share
 * one cookie jar, so this response would wipe the pair the winning request just
 * set and sign out a recruiter who did nothing wrong.
 */
const rejectWithoutClearing = (res, code, message) =>
  res.status(401).json({ success: false, code, message });

/**
 * Writes the cookies for a completed rotation.
 *
 * Deliberately outside the transaction. Setting them inside would mean a commit
 * that failed after the fact still left Set-Cookie headers on the response, and
 * the browser would walk away holding a refresh token whose row had been rolled
 * back — a session that looks fine until the next renewal fails.
 */
const commitRotation = (res, user, { refreshToken }) =>
  setAuthCookies(res, { accessToken: issueAccessToken(user), refreshToken });

/**
 * @desc    End the current session
 * @route   POST /api/auth/logout
 * @access  Public (idempotent)
 *
 * Revokes the whole lineage, not just the presented token: the point of signing
 * out is that nothing minted from this sign-in keeps working.
 *
 * The access token is not revoked and stays cryptographically valid for the
 * remainder of its TTL (15 minutes by default). That is the accepted cost of
 * stateless access tokens, and is why the access TTL is measured in minutes.
 */
const logout = async (req, res) => {
  const presented = readRefreshToken(req);

  if (presented) {
    try {
      const session = await prisma.authSession.findUnique({
        where: { refreshTokenHash: hashRefreshToken(presented) }
      });
      if (session) {
        await revokeFamily(session.familyId, 'LOGOUT');
        console.log(`[Auth] Signed out user ${session.userId} (family ${session.familyId}).`);
      }
    } catch (error) {
      // Signing out must always succeed from the recruiter's point of view; the
      // cookies are cleared below whatever the database did.
      console.error('[Auth] Could not revoke session on logout:', error.message);
    }
  }

  clearAuthCookies(res);
  return res.status(200).json({ success: true, message: 'Signed out successfully.' });
};

module.exports = { signup, login, me, refresh, logout };
