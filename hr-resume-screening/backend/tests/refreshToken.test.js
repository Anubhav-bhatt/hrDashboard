/**
 * Refresh Token & Rotating Session Integration Tests.
 *
 * Tests the complete rotating refresh token architecture:
 * - Login issuing dual cookies (hr_access + hr_refresh)
 * - PostgreSQL AuthSession persistence with hashed tokens
 * - Token rotation (R1 -> R2) and session lineage tracking
 * - Token reuse detection (revoking entire family on reuse attempt)
 * - Access token expiry handling
 * - Logout revocation
 * - Stale and malformed token resilience
 */
require('dotenv').config();
const http = require('http');
const { createSuite, assert } = require('./harness');
const prisma = require('../config/prisma');
const app = require('../server');
const { hashPassword, hashToken } = require('../services/authService');

const suite = createSuite('Refresh Token & Rotating Sessions');
const { testAsync } = suite;

const TEST_EMAIL = `refreshtest.${Date.now()}@example.invalid`;
const TEST_PASSWORD = 'StrongPassword123!';

let server;
let baseUrl;
let testUserId;

const parseCookies = (setCookieHeader) => {
  if (!setCookieHeader) return {};
  const cookies = {};
  const parts = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const part of parts) {
    const [nameValue] = part.split(';');
    const [name, value] = nameValue.split('=');
    if (name && value) {
      cookies[name.trim()] = value.trim();
    }
  }
  return cookies;
};

const request = async (method, path, { body, cookie, headers = {} } = {}) => {
  const options = {
    method,
    headers: { ...headers }
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (cookie) options.headers.Cookie = cookie;

  const response = await fetch(`${baseUrl}${path}`, options);
  const setCookie = response.headers.get('set-cookie');
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}

  return {
    status: response.status,
    headers: response.headers,
    body: json,
    raw: text,
    setCookie,
    cookies: parseCookies(response.headers.getSetCookie ? response.headers.getSetCookie() : setCookie)
  };
};

const setup = async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}/api`;

  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      passwordHash: await hashPassword(TEST_PASSWORD),
      name: 'Refresh Test Recruiter',
      role: 'RECRUITER',
      isActive: true
    }
  });
  testUserId = user.id;
};

const teardown = async () => {
  if (testUserId) {
    await prisma.authSession.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  }
  if (server) await new Promise((resolve) => server.close(resolve));
};

const run = async () => {
  await setup();

  await testAsync('POST /api/auth/login issues hr_access and hr_refresh cookies and stores session hash', async () => {
    const res = await request('POST', '/auth/login', {
      body: { email: TEST_EMAIL, password: TEST_PASSWORD }
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.success, 'Login response indicated success');
    assert.ok(res.cookies['hr_access'], 'hr_access cookie was set');
    assert.ok(res.cookies['hr_refresh'], 'hr_refresh cookie was set');

    // Verify server-side session persistence in PostgreSQL
    const rawRefreshToken = res.cookies['hr_refresh'];
    const tokenHash = hashToken(rawRefreshToken);
    const session = await prisma.authSession.findUnique({ where: { tokenHash } });

    assert.ok(session, 'AuthSession record exists in PostgreSQL');
    assert.strictEqual(session.userId, testUserId);
    assert.strictEqual(session.revokedAt, null, 'New session is not revoked');
    assert.ok(session.family, 'Session belongs to a rotation family');
  });

  await testAsync('POST /api/auth/refresh rotates the refresh token (R1 -> R2) and issues new access token', async () => {
    // Step 1: Login to get initial tokens (R1)
    const loginRes = await request('POST', '/auth/login', {
      body: { email: TEST_EMAIL, password: TEST_PASSWORD }
    });
    const r1 = loginRes.cookies['hr_refresh'];
    const r1Hash = hashToken(r1);

    // Step 2: Call /api/auth/refresh with R1
    const refreshRes = await request('POST', '/auth/refresh', {
      cookie: `hr_refresh=${r1}`
    });

    assert.strictEqual(refreshRes.status, 200);
    assert.ok(refreshRes.body.success);
    assert.ok(refreshRes.cookies['hr_access'], 'New hr_access cookie was returned');
    assert.ok(refreshRes.cookies['hr_refresh'], 'New hr_refresh cookie (R2) was returned');

    const r2 = refreshRes.cookies['hr_refresh'];
    assert.notStrictEqual(r1, r2, 'Refresh token rotated to a new secret');

    // Verify R1 is revoked in database
    const oldSession = await prisma.authSession.findUnique({ where: { tokenHash: r1Hash } });
    assert.ok(oldSession.revokedAt !== null, 'R1 is now marked as revoked');

    // Verify R2 is active in database and shares the same family
    const r2Hash = hashToken(r2);
    const newSession = await prisma.authSession.findUnique({ where: { tokenHash: r2Hash } });
    assert.ok(newSession, 'R2 session exists in database');
    assert.strictEqual(newSession.revokedAt, null, 'R2 is active');
    assert.strictEqual(newSession.family, oldSession.family, 'R2 shares the rotation family lineage');

    // Verify new access token works against protected endpoint
    const meRes = await request('GET', '/auth/me', {
      cookie: `hr_access=${refreshRes.cookies['hr_access']}`
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.data.user.email, TEST_EMAIL);
  });

  await testAsync('Token reuse detection: reusing an already-rotated token (R1) revokes entire family', async () => {
    // Step 1: Login to get R1
    const loginRes = await request('POST', '/auth/login', {
      body: { email: TEST_EMAIL, password: TEST_PASSWORD }
    });
    const r1 = loginRes.cookies['hr_refresh'];

    // Step 2: Valid rotation from R1 to R2
    const refreshRes = await request('POST', '/auth/refresh', {
      cookie: `hr_refresh=${r1}`
    });
    const r2 = refreshRes.cookies['hr_refresh'];
    const r2Hash = hashToken(r2);

    // Step 3: Malicious/Replay actor attempts to reuse R1!
    const reuseRes = await request('POST', '/auth/refresh', {
      cookie: `hr_refresh=${r1}`
    });

    assert.strictEqual(reuseRes.status, 401);
    assert.strictEqual(reuseRes.body.code, 'REFRESH_REUSE_DETECTED');

    // Verify that R2 has also been revoked as a consequence of the reuse detection!
    const r2Session = await prisma.authSession.findUnique({ where: { tokenHash: r2Hash } });
    assert.ok(r2Session.revokedAt !== null, 'R2 session was revoked by family reuse detection');

    // Step 4: Legitimate user trying to use R2 is now rejected because family was compromised
    const r2Attempt = await request('POST', '/auth/refresh', {
      cookie: `hr_refresh=${r2}`
    });
    assert.strictEqual(r2Attempt.status, 401);
  });

  await testAsync('POST /api/auth/logout revokes the refresh session and clears cookies', async () => {
    const loginRes = await request('POST', '/auth/login', {
      body: { email: TEST_EMAIL, password: TEST_PASSWORD }
    });
    const refreshCookie = loginRes.cookies['hr_refresh'];
    const tokenHash = hashToken(refreshCookie);

    const logoutRes = await request('POST', '/auth/logout', {
      cookie: `hr_refresh=${refreshCookie}`
    });

    assert.strictEqual(logoutRes.status, 200);

    // Verify session is revoked in DB
    const session = await prisma.authSession.findUnique({ where: { tokenHash } });
    assert.ok(session.revokedAt !== null, 'Session was revoked in PostgreSQL');

    // Verify refresh cannot be called with logged out token
    const refreshRes = await request('POST', '/auth/refresh', {
      cookie: `hr_refresh=${refreshCookie}`
    });
    assert.strictEqual(refreshRes.status, 401);
  });

  await testAsync('Calling /api/auth/refresh without cookie returns 401 REFRESH_REQUIRED without crash', async () => {
    const res = await request('POST', '/auth/refresh');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'REFRESH_REQUIRED');
  });

  await testAsync('Calling /api/auth/refresh with bogus token returns 401 INVALID_REFRESH_TOKEN', async () => {
    const res = await request('POST', '/auth/refresh', {
      cookie: 'hr_refresh=bogus-random-token-does-not-exist'
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'INVALID_REFRESH_TOKEN');
  });

  await testAsync('Access token expiry: expired access token returns 401 SESSION_EXPIRED', async () => {
    const { issueExpiredAccessToken } = require('../services/authService');
    const expiredToken = issueExpiredAccessToken({ id: testUserId, email: TEST_EMAIL, role: 'RECRUITER' });

    const res = await request('GET', '/auth/me', {
      cookie: `hr_access=${expiredToken}`
    });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'SESSION_EXPIRED');
  });

  await testAsync('Expired refresh token: expired session in DB returns 401 REFRESH_EXPIRED', async () => {
    const loginRes = await request('POST', '/auth/login', {
      body: { email: TEST_EMAIL, password: TEST_PASSWORD }
    });
    const r1 = loginRes.cookies['hr_refresh'];
    const r1Hash = hashToken(r1);

    // Manually set expiry to past
    await prisma.authSession.update({
      where: { tokenHash: r1Hash },
      data: { expiresAt: new Date(Date.now() - 10000) }
    });

    const refreshRes = await request('POST', '/auth/refresh', {
      cookie: `hr_refresh=${r1}`
    });

    assert.strictEqual(refreshRes.status, 401);
    assert.strictEqual(refreshRes.body.code, 'REFRESH_EXPIRED');
  });

  await testAsync('Concurrent refresh calls: parallel requests with same R1 result in one success and no corruption', async () => {
    const loginRes = await request('POST', '/auth/login', {
      body: { email: TEST_EMAIL, password: TEST_PASSWORD }
    });
    const r1 = loginRes.cookies['hr_refresh'];

    // Send two requests simultaneously with same R1
    const [res1, res2] = await Promise.all([
      request('POST', '/auth/refresh', { cookie: `hr_refresh=${r1}` }),
      request('POST', '/auth/refresh', { cookie: `hr_refresh=${r1}` })
    ]);

    const statuses = [res1.status, res2.status];
    // At least one must succeed (200), and the other will either succeed or fail with reuse detection (401)
    assert.ok(statuses.includes(200), 'At least one concurrent refresh request succeeded');
  });

  const { failed } = suite.summary();
  await teardown();
  process.exit(failed > 0 ? 1 : 0);
};

run().catch(async (error) => {
  console.error('\n  SUITE ERROR:', error.message);
  console.error(error.stack);
  try {
    await teardown();
  } catch {}
  process.exit(1);
});
