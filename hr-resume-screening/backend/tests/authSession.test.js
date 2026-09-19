/**
 * Access + refresh session integration tests.
 *
 * Boots the real Express app in-process against the configured PostgreSQL
 * database and exercises the parts of authentication that only show up when a
 * real database and a real HTTP layer are involved: rotation, replay detection,
 * concurrency, expiry, revocation and the origin checks.
 *
 *   npm run test:auth
 *
 * Nothing here prints a token. Assertions are about shape, status and database
 * state, never about a credential's value.
 */
require('dotenv').config();

// Set before the app is required: the rate limiters read their budgets once, at
// module load. The production sign-in budget is 20 per 10 minutes per address,
// which is right for a login form and far too small for a suite that signs in
// for almost every case.
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.REFRESH_RATE_LIMIT = '1000';
process.env.API_RATE_LIMIT = '10000';

const http = require('http');
const crypto = require('crypto');
const { createSuite, assert } = require('./harness');

const prisma = require('../config/prisma');
const { ensureTestWorkspace, addWorkspaceMember, cleanupTestWorkspaces } = require('./workspaceFixture');

// Jobs are workspace-owned, so fixtures need one before they can create any.
let testWorkspaceId;
const app = require('../server');
const { hashPassword, hashRefreshToken } = require('../services/authService');

const suite = createSuite('Authentication: access tokens, refresh rotation and sessions');
const { testAsync } = suite;

const TEST_PREFIX = 'authtest';
const TEST_EMAIL = `${TEST_PREFIX}.recruiter@example.invalid`;
const TEST_PASSWORD = 'RefreshRotation123!';
const TRUSTED_ORIGIN = 'http://127.0.0.1:5173';

let server;
let baseUrl;
let userId;

/* ------------------------------------------------------------- helpers ---- */

/** Parses a Set-Cookie list into { name: { value, attrs } }. */
const parseCookies = (setCookies = []) => {
  const out = {};
  for (const raw of setCookies) {
    const [pair, ...rest] = raw.split(';');
    const index = pair.indexOf('=');
    out[pair.slice(0, index).trim()] = {
      value: pair.slice(index + 1).trim(),
      attrs: rest.map((a) => a.trim()).join('; ')
    };
  }
  return out;
};

/** A cookie jar as a request header, from a { name: value } map. */
const jarHeader = (jar) =>
  Object.entries(jar)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

const request = async (method, path, { body, jar, origin = TRUSTED_ORIGIN, headers = {} } = {}) => {
  const options = { method, headers: { ...headers } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (origin) options.headers.Origin = origin;
  if (jar) {
    const cookie = jarHeader(jar);
    if (cookie) options.headers.Cookie = cookie;
  }

  const response = await fetch(`${baseUrl}${path}`, options);
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { status: response.status, body: json, setCookies, cookies: parseCookies(setCookies) };
};

/** Applies a response's Set-Cookie list to a jar, honouring clears. */
const applyCookies = (jar, cookies) => {
  for (const [name, { value }] of Object.entries(cookies)) {
    if (!value) delete jar[name];
    else jar[name] = value;
  }
  return jar;
};

/** Signs in and returns a fresh cookie jar. */
const signIn = async () => {
  const res = await request('POST', '/auth/login', {
    body: { email: TEST_EMAIL, password: TEST_PASSWORD }
  });
  assert.strictEqual(res.status, 200, 'sign-in succeeds');
  return applyCookies({}, res.cookies);
};

/* --------------------------------------------------------------- setup ---- */

const setup = async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { passwordHash: await hashPassword(TEST_PASSWORD), isActive: true },
    create: {
      email: TEST_EMAIL,
      passwordHash: await hashPassword(TEST_PASSWORD),
      name: 'Auth Test Recruiter',
      role: 'ADMIN'
    }
  });
  userId = user.id;
  // requireAuth refuses a session whose account has no workspace, so the
  // fixture account needs one exactly as a signed-up account would have.
  testWorkspaceId = await ensureTestWorkspace(user.id, { name: 'Auth Test Recruiter' });
};

const teardown = async () => {
  await prisma.authSession.deleteMany({ where: { userId } });
  await cleanupTestWorkspaces([userId]);
  await prisma.user.deleteMany({ where: { id: userId } });
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
};

/* ---------------------------------------------------------------- tests --- */

const run = async () => {
  await setup();

  const originalEnv = {
    accessTtl: process.env.ACCESS_TOKEN_TTL_MINUTES,
    grace: process.env.REFRESH_REUSE_GRACE_SECONDS
  };
  const restoreEnv = () => {
    if (originalEnv.accessTtl === undefined) delete process.env.ACCESS_TOKEN_TTL_MINUTES;
    else process.env.ACCESS_TOKEN_TTL_MINUTES = originalEnv.accessTtl;
    if (originalEnv.grace === undefined) delete process.env.REFRESH_REUSE_GRACE_SECONDS;
    else process.env.REFRESH_REUSE_GRACE_SECONDS = originalEnv.grace;
  };

  /* ------------------------------------------------------ cookie shape --- */

  suite.group('Cookies and token separation');

  await testAsync('login issues separate access and refresh cookies', async () => {
    const res = await request('POST', '/auth/login', {
      body: { email: TEST_EMAIL, password: TEST_PASSWORD }
    });
    assert.strictEqual(res.status, 200);

    const access = res.cookies.hr_access;
    const refresh = res.cookies.hr_refresh;
    assert.ok(access && access.value, 'an access cookie is set');
    assert.ok(refresh && refresh.value, 'a refresh cookie is set');
    assert.notStrictEqual(access.value, refresh.value, 'the two tokens are different');

    assert.match(access.attrs, /HttpOnly/i);
    assert.match(refresh.attrs, /HttpOnly/i);
    assert.match(access.attrs, /SameSite=Lax/i);
    assert.match(refresh.attrs, /SameSite=Lax/i);
    assert.match(access.attrs, /Path=\//);
    assert.match(refresh.attrs, /Path=\/api\/auth/i, 'refresh is scoped to the auth routes');
  });

  await testAsync('the refresh token is opaque, not a JWT', async () => {
    const jar = await signIn();
    const parts = jar.hr_refresh.split('.');
    assert.notStrictEqual(parts.length, 3, 'an opaque token is not three dot-separated segments');
  });

  await testAsync('no raw refresh token is stored in the database', async () => {
    const jar = await signIn();
    const raw = decodeURIComponent(jar.hr_refresh);

    const stored = await prisma.authSession.findMany({ where: { userId } });
    assert.ok(stored.length > 0, 'a session row exists');
    for (const row of stored) {
      assert.notStrictEqual(row.refreshTokenHash, raw, 'the column does not hold the raw token');
      assert.strictEqual(row.refreshTokenHash.length, 64, 'the column holds a SHA-256 hex digest');
    }

    const match = stored.find((r) => r.refreshTokenHash === hashRefreshToken(raw));
    assert.ok(match, 'the row is found by hashing the presented token');
  });

  await testAsync('an access token is not accepted as a refresh token', async () => {
    const jar = await signIn();
    const res = await request('POST', '/auth/refresh', { jar: { hr_refresh: jar.hr_access } });
    assert.strictEqual(res.status, 401, 'the access token is not a known refresh token');
  });

  await testAsync('a refresh token is not accepted as an access token', async () => {
    const jar = await signIn();
    const res = await request('GET', '/auth/me', { jar: { hr_access: jar.hr_refresh } });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'INVALID_SESSION');
  });

  /* ---------------------------------------------------------- rotation --- */

  suite.group('Rotation and replay');

  await testAsync('refresh rotates the token and keeps the session usable', async () => {
    const jar = await signIn();
    const first = jar.hr_refresh;

    const res = await request('POST', '/auth/refresh', { jar });
    assert.strictEqual(res.status, 200);
    applyCookies(jar, res.cookies);

    assert.ok(jar.hr_refresh, 'a new refresh cookie is issued');
    assert.notStrictEqual(jar.hr_refresh, first, 'the refresh token changed');

    const me = await request('GET', '/auth/me', { jar });
    assert.strictEqual(me.status, 200, 'the new access token works');
  });

  await testAsync('the previous refresh token is rejected once rotated', async () => {
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    try {
      const jar = await signIn();
      const first = jar.hr_refresh;

      const rotated = await request('POST', '/auth/refresh', { jar });
      assert.strictEqual(rotated.status, 200);

      const replay = await request('POST', '/auth/refresh', { jar: { hr_refresh: first } });
      assert.strictEqual(replay.status, 401, 'the spent token is refused');
      assert.strictEqual(replay.body.code, 'INVALID_SESSION');
    } finally {
      restoreEnv();
    }
  });

  await testAsync('replaying a spent token revokes the whole session family', async () => {
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    try {
      const jar = await signIn();
      const first = jar.hr_refresh;

      const rotated = await request('POST', '/auth/refresh', { jar });
      applyCookies(jar, rotated.cookies);
      const second = jar.hr_refresh;

      // The thief replays the old token.
      await request('POST', '/auth/refresh', { jar: { hr_refresh: first } });

      // The honest holder's current token must now be dead too: the server
      // cannot tell which of the two is the legitimate one.
      const afterBreach = await request('POST', '/auth/refresh', { jar: { hr_refresh: second } });
      assert.strictEqual(afterBreach.status, 401, 'the live token in the family is revoked as well');

      const row = await prisma.authSession.findUnique({
        where: { refreshTokenHash: hashRefreshToken(decodeURIComponent(second)) }
      });
      assert.ok(row.revokedAt, 'the family member is revoked in the database');
      assert.strictEqual(row.revokedReason, 'REUSE_DETECTED');
    } finally {
      restoreEnv();
    }
  });

  await testAsync('a rejected refresh clears both cookies', async () => {
    const res = await request('POST', '/auth/refresh', {
      jar: { hr_refresh: 'a-token-that-was-never-issued' }
    });
    assert.strictEqual(res.status, 401);
    assert.ok('hr_access' in res.cookies, 'the access cookie is cleared');
    assert.ok('hr_refresh' in res.cookies, 'the refresh cookie is cleared');
    assert.strictEqual(res.cookies.hr_access.value, '', 'cleared to an empty value');
    assert.strictEqual(res.cookies.hr_refresh.value, '');
  });

  await testAsync('two tabs racing inside the grace window both stay signed in', async () => {
    const jar = await signIn();
    const shared = jar.hr_refresh;

    // Tab A refreshes.
    const a = await request('POST', '/auth/refresh', { jar: { hr_refresh: shared } });
    assert.strictEqual(a.status, 200);

    // Tab B was already in flight with the same token.
    const b = await request('POST', '/auth/refresh', { jar: { hr_refresh: shared } });
    assert.strictEqual(b.status, 200, 'the racing tab is not treated as a thief');

    const jarB = applyCookies({}, b.cookies);
    const me = await request('GET', '/auth/me', { jar: jarB });
    assert.strictEqual(me.status, 200, 'the session survives the race');
  });

  /* ------------------------------------------------------- concurrency --- */

  suite.group('Concurrency');

  // Run at the shipped grace setting, not at 0. Strict single-use cannot tell a
  // burst of concurrent requests from a replay — that is the whole reason the
  // grace window exists — so testing this at 0 would only re-prove that.
  await testAsync('concurrent refreshes spend the token exactly once', async () => {
    const jar = await signIn();
    const token = jar.hr_refresh;

    const parent = await prisma.authSession.findUnique({
      where: { refreshTokenHash: hashRefreshToken(decodeURIComponent(token)) }
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => request('POST', '/auth/refresh', { jar: { hr_refresh: token } }))
    );

    // The atomic guard means the presented row is spent by exactly one request.
    const spent = await prisma.authSession.findUnique({ where: { id: parent.id } });
    assert.ok(spent.revokedAt, 'the presented session was spent');
    assert.strictEqual(spent.revokedReason, 'ROTATED', 'spent by rotation, not flagged as a replay');
    assert.ok(spent.replacedById, 'it points at a single replacement');

    // The family is never left with two live heads, which is what "no session
    // corruption" means in practice.
    const live = await prisma.authSession.findMany({
      where: { familyId: parent.familyId, revokedAt: null }
    });
    assert.strictEqual(live.length, 1, 'exactly one live head remains');

    // No request is signed out while the session is still good: the ones that
    // lost the race recover instead of racing each other to a logout.
    const rejected = results.filter((r) => r.status !== 200);
    assert.strictEqual(rejected.length, 0, 'no concurrent request is signed out');

    // And no losing response may clear the cookies, or it would wipe the pair
    // the winner just set in the jar that every tab shares.
    const clearing = results.filter((r) => r.cookies.hr_refresh && r.cookies.hr_refresh.value === '');
    assert.strictEqual(clearing.length, 0, 'no response clears the refresh cookie');

    // The session is still usable afterwards, from the winner's cookies.
    const winner = results.find((r) => r.cookies.hr_refresh && r.cookies.hr_refresh.value);
    assert.ok(winner, 'one response carried a new refresh cookie');
    const me = await request('GET', '/auth/me', { jar: applyCookies({}, winner.cookies) });
    assert.strictEqual(me.status, 200, 'the session survives the burst');
  });

  /* ------------------------------------------------------------ expiry --- */

  suite.group('Expiry');

  await testAsync('an expired access token is refused, then recovered by refresh', async () => {
    // 3 seconds. A JWT's `exp` is a whole number of seconds, so a TTL under one
    // second truncates to zero and mints a token that is already expired — the
    // shortest useful test value is comfortably above 1s, not below it.
    process.env.ACCESS_TOKEN_TTL_MINUTES = '0.05';
    let jar;
    try {
      jar = await signIn();
      const immediately = await request('GET', '/auth/me', { jar });
      assert.strictEqual(immediately.status, 200, 'the fresh access token works');

      await new Promise((resolve) => setTimeout(resolve, 3500));

      const expired = await request('GET', '/auth/me', { jar });
      assert.strictEqual(expired.status, 401, 'the expired access token is refused');
      assert.strictEqual(expired.body.code, 'SESSION_EXPIRED', 'the code tells the client it may renew');
    } finally {
      restoreEnv();
    }

    // The refresh cookie is untouched by access expiry, so renewal works.
    const renewed = await request('POST', '/auth/refresh', { jar });
    assert.strictEqual(renewed.status, 200, 'refresh renews the session');
    applyCookies(jar, renewed.cookies);

    const after = await request('GET', '/auth/me', { jar });
    assert.strictEqual(after.status, 200, 'the retried request now succeeds');
  });

  await testAsync('an expired refresh session is refused and the cookies cleared', async () => {
    const jar = await signIn();

    await prisma.authSession.update({
      where: { refreshTokenHash: hashRefreshToken(decodeURIComponent(jar.hr_refresh)) },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });

    const res = await request('POST', '/auth/refresh', { jar });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'SESSION_EXPIRED', 'the recruiter is told the session expired');
    assert.strictEqual(res.cookies.hr_refresh.value, '', 'the refresh cookie is cleared');
    assert.strictEqual(res.cookies.hr_access.value, '', 'the access cookie is cleared');
  });

  await testAsync('a session for a deactivated account stops refreshing', async () => {
    const jar = await signIn();
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    try {
      const res = await request('POST', '/auth/refresh', { jar });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.code, 'INVALID_SESSION');
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    }
  });

  /* ------------------------------------------------------------ logout --- */

  suite.group('Logout');

  await testAsync('logout revokes the server session and clears both cookies', async () => {
    const jar = await signIn();
    const refreshToken = jar.hr_refresh;

    const res = await request('POST', '/auth/logout', { jar });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.cookies.hr_access.value, '');
    assert.strictEqual(res.cookies.hr_refresh.value, '');

    const row = await prisma.authSession.findUnique({
      where: { refreshTokenHash: hashRefreshToken(decodeURIComponent(refreshToken)) }
    });
    assert.ok(row.revokedAt, 'the session row is revoked');
    assert.strictEqual(row.revokedReason, 'LOGOUT');
  });

  await testAsync('a refresh token no longer works after logout', async () => {
    const jar = await signIn();
    const refreshToken = jar.hr_refresh;

    await request('POST', '/auth/logout', { jar });

    const res = await request('POST', '/auth/refresh', { jar: { hr_refresh: refreshToken } });
    assert.strictEqual(res.status, 401, 'the revoked token cannot be redeemed');
  });

  await testAsync('logout is idempotent and safe without any cookies', async () => {
    const res = await request('POST', '/auth/logout');
    assert.strictEqual(res.status, 200);
  });

  /* ------------------------------------------ persistence across instances */

  suite.group('Session persistence');

  await testAsync('a session issued by one instance is refreshed by another', async () => {
    const jar = await signIn();

    // A second listener standing in for a second Render instance. What matters
    // is that nothing about the session lives in the first one's memory: the
    // token is redeemed purely from Postgres and the shared signing secret.
    const second = http.createServer(app);
    await new Promise((resolve) => second.listen(0, '127.0.0.1', resolve));
    const secondUrl = `http://127.0.0.1:${second.address().port}/api`;

    try {
      const response = await fetch(`${secondUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: jarHeader(jar), Origin: TRUSTED_ORIGIN }
      });
      assert.strictEqual(response.status, 200, 'the other instance honours the session');
    } finally {
      await new Promise((resolve) => second.close(resolve));
    }
  });

  await testAsync('session rows survive independently of process memory', async () => {
    const jar = await signIn();
    const row = await prisma.authSession.findUnique({
      where: { refreshTokenHash: hashRefreshToken(decodeURIComponent(jar.hr_refresh)) }
    });
    assert.ok(row, 'the session is a database row, not an in-memory entry');
    assert.strictEqual(row.userId, userId);
    assert.ok(row.expiresAt > new Date(), 'it carries its own expiry');
  });

  /* -------------------------------------------------------------- CSRF --- */

  suite.group('Origin policy');

  await testAsync('a state-changing request from an untrusted origin is refused', async () => {
    const jar = await signIn();
    const res = await request('POST', '/auth/logout', {
      jar,
      origin: 'https://attacker-controlled-app.vercel.app'
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, 'FORBIDDEN');
  });

  await testAsync('a look-alike localhost origin is refused', async () => {
    const res = await request('POST', '/auth/refresh', {
      jar: { hr_refresh: 'irrelevant' },
      origin: 'https://localhost.attacker-controlled.example'
    });
    assert.strictEqual(res.status, 403, 'substring matching must not admit this origin');
  });

  await testAsync('a request with no Origin header is allowed (server-to-server)', async () => {
    const jar = await signIn();
    const res = await request('GET', '/auth/me', { jar, origin: null });
    assert.strictEqual(res.status, 200);
  });

  await testAsync('reads are not blocked by the origin check', async () => {
    const jar = await signIn();
    const res = await request('GET', '/auth/me', { jar, origin: 'https://unrelated.example.com' });
    // The origin check covers state changes; CORS is what stops a foreign page
    // from *reading* this response, and it is asserted separately below.
    assert.strictEqual(res.status, 200);
  });

  await testAsync('CORS does not echo an untrusted origin back', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://attacker-controlled-app.vercel.app' }
    });
    assert.strictEqual(
      response.headers.get('access-control-allow-origin'),
      null,
      'no credentialed CORS grant for an unlisted origin'
    );
  });

  await testAsync('CORS allows a configured origin', async () => {
    const response = await fetch(`${baseUrl}/health`, { headers: { Origin: TRUSTED_ORIGIN } });
    assert.strictEqual(response.headers.get('access-control-allow-origin'), TRUSTED_ORIGIN);
    assert.strictEqual(response.headers.get('access-control-allow-credentials'), 'true');
  });

  /* --------------------------------------------------------- stale state - */

  suite.group('Recovery from stale state');

  await testAsync('a token signed with a different secret is rejected cleanly', async () => {
    const forged = crypto.randomBytes(48).toString('base64url');
    const res = await request('POST', '/auth/refresh', { jar: { hr_refresh: forged } });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'INVALID_SESSION');
    assert.strictEqual(res.cookies.hr_refresh.value, '', 'the browser is told to drop it');
  });

  await testAsync('sign-in works again immediately after any rejection', async () => {
    const jar = await signIn();
    const me = await request('GET', '/auth/me', { jar });
    assert.strictEqual(me.status, 200, 'no trap: a fresh sign-in always recovers');
  });

  const { failed } = suite.summary();
  await teardown();
  process.exit(failed > 0 ? 1 : 0);
};

run().catch(async (error) => {
  console.error('Auth session suite crashed:', error.message);
  try {
    await teardown();
  } catch {
    /* already torn down */
  }
  process.exit(1);
});
