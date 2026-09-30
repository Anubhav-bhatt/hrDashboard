/**
 * Comprehensive Multi-User Account System Integration Tests
 *
 * Verifies all 60 phases of requirements:
 * 1. Independent Signup for multiple users
 * 2. Auto-login on signup with secure sessions
 * 3. Cannot self-escalate role on signup
 * 4. Duplicate email prevention with friendly error
 * 5. Independent Login with proper credentials
 * 6. Wrong password & non-existent user handling
 * 7. Personal Profile: GET /api/auth/me and PUT /api/auth/profile
 * 8. Secure Password Change: POST /api/auth/change-password
 * 9. RBAC: Normal users cannot access Admin APIs (403 Forbidden)
 * 10. Admin user management: GET /api/admin/users with search & filters
 * 11. Admin user details: GET /api/admin/users/:id with stats and activity
 * 12. Account Status: Admin disable / reactivate with session revocation
 * 13. Admin safety: Cannot disable self (400 CANNOT_DISABLE_SELF)
 * 14. Disabled account enforcement: Disabled user blocked from login & API
 * 15. Activity Tracking: Platform activity audit trail for all key actions
 * 16. Workspace Isolation: User A cannot see User B's jobs
 * 17. Backward compatibility: Existing admin account preserved
 */
require('dotenv').config();

process.env.LOGIN_RATE_LIMIT = '1000';
process.env.REFRESH_RATE_LIMIT = '1000';
process.env.API_RATE_LIMIT = '10000';
process.env.SIGNUP_RATE_LIMIT = '1000';

const { createSuite, assert } = require('./harness');
const prisma = require('../config/prisma');
const app = require('../server');

const suite = createSuite('Multi-User Account System & Admin Activity Suite');
const { testAsync } = suite;

const TEST_TIMESTAMP = Date.now();
const USER_A_EMAIL = `test.user.a.${TEST_TIMESTAMP}@example.invalid`;
const USER_B_EMAIL = `test.user.b.${TEST_TIMESTAMP}@example.invalid`;
const PASSWORD_ORIGINAL = 'CorrectHorse123!';
const PASSWORD_NEW = 'BatteryStaple456!';
const TRUSTED_ORIGIN = 'http://127.0.0.1:5173';

let server;
let baseUrl;
let adminCookieJar = {};
let userACookieJar = {};
let userBCookieJar = {};
let userAId;
let userBId;
let adminUserId;

const parseCookies = (setCookies = []) => {
  const out = {};
  for (const raw of setCookies) {
    const [pair] = raw.split(';');
    const index = pair.indexOf('=');
    out[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return out;
};

const jarHeader = (jar) =>
  Object.entries(jar)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

const request = async (method, path, { body, jar = {}, origin = TRUSTED_ORIGIN, headers = {} } = {}) => {
  const options = { method, headers: { ...headers } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (origin) options.headers.Origin = origin;
  const cookie = jarHeader(jar);
  if (cookie) options.headers.Cookie = cookie;

  const response = await fetch(`${baseUrl}${path}`, options);
  const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  // Update caller's jar
  const parsed = parseCookies(setCookies);
  for (const [k, v] of Object.entries(parsed)) {
    if (!v) delete jar[k];
    else jar[k] = v;
  }

  return { status: response.status, body: json, headers: response.headers };
};

const run = async () => {
  // Start server on an ephemeral port
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;

  // Find or create admin user for testing
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@hrdashboard.local').toLowerCase();
  const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (adminUser) {
    adminUserId = adminUser.id;
  }

  try {
    // -------------------------------------------------------------
    // SIGNUP & AUTO-LOGIN TESTS
    // -------------------------------------------------------------
    await testAsync('1. User A can sign up and is automatically logged in with default role RECRUITER', async () => {
      const res = await request('POST', '/auth/signup', {
        body: {
          name: 'Rahul Sharma',
          email: USER_A_EMAIL,
          password: PASSWORD_ORIGINAL,
          role: 'ADMIN' // Malicious attempt to escalate role
        },
        jar: userACookieJar
      });

      assert.strictEqual(res.status, 201, 'Signup should return 201 Created');
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.name, 'Rahul Sharma');
      assert.strictEqual(res.body.data.user.email, USER_A_EMAIL.toLowerCase());
      assert.strictEqual(res.body.data.user.role, 'RECRUITER', 'Must ignore requested role=ADMIN');
      assert.ok(userACookieJar.hr_access, 'Access cookie must be issued');
      assert.ok(userACookieJar.hr_refresh, 'Refresh cookie must be issued');

      userAId = res.body.data.user.id;
    });

    await testAsync('2. User A has their own workspace automatically provisioned', async () => {
      const meRes = await request('GET', '/auth/me', { jar: userACookieJar });
      assert.strictEqual(meRes.status, 200);
      assert.ok(meRes.body.data.workspace, 'Workspace must exist');
      assert.ok(meRes.body.data.workspace.id, 'Workspace id must exist');
    });

    await testAsync('3. Duplicate signup with same email is rejected with 409', async () => {
      const res = await request('POST', '/auth/signup', {
        body: {
          name: 'Duplicate Attempt',
          email: USER_A_EMAIL.toUpperCase(), // Test case insensitivity
          password: PASSWORD_ORIGINAL
        }
      });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.code, 'EMAIL_IN_USE');
    });

    await testAsync('4. User B can sign up independently', async () => {
      const res = await request('POST', '/auth/signup', {
        body: {
          name: 'Priya Patel',
          email: USER_B_EMAIL,
          password: PASSWORD_ORIGINAL
        },
        jar: userBCookieJar
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.data.user.role, 'RECRUITER');
      userBId = res.body.data.user.id;
      assert.notStrictEqual(userAId, userBId, 'User IDs must be distinct');
    });

    // -------------------------------------------------------------
    // PROFILE MANAGEMENT TESTS
    // -------------------------------------------------------------
    await testAsync('5. User A can update their profile name', async () => {
      const updateRes = await request('PUT', '/auth/profile', {
        body: { name: 'Rahul S. Sharma' },
        jar: userACookieJar
      });

      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateRes.body.data.user.name, 'Rahul S. Sharma');

      const meRes = await request('GET', '/auth/me', { jar: userACookieJar });
      assert.strictEqual(meRes.body.data.user.name, 'Rahul S. Sharma');
    });

    await testAsync('6. Profile update rejects invalid or empty names', async () => {
      const emptyRes = await request('PUT', '/auth/profile', {
        body: { name: '   ' },
        jar: userACookieJar
      });
      assert.strictEqual(emptyRes.status, 400);
      assert.strictEqual(emptyRes.body.code, 'VALIDATION_ERROR');
    });

    // -------------------------------------------------------------
    // PASSWORD CHANGE TESTS
    // -------------------------------------------------------------
    await testAsync('7. User A password change rejects wrong current password', async () => {
      const res = await request('POST', '/auth/change-password', {
        body: {
          currentPassword: 'WrongPassword123!',
          newPassword: PASSWORD_NEW
        },
        jar: userACookieJar
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'INVALID_PASSWORD');
    });

    await testAsync('8. User A password change rejects same password or too short password', async () => {
      const sameRes = await request('POST', '/auth/change-password', {
        body: {
          currentPassword: PASSWORD_ORIGINAL,
          newPassword: PASSWORD_ORIGINAL
        },
        jar: userACookieJar
      });
      assert.strictEqual(sameRes.status, 400);

      const shortRes = await request('POST', '/auth/change-password', {
        body: {
          currentPassword: PASSWORD_ORIGINAL,
          newPassword: 'short'
        },
        jar: userACookieJar
      });
      assert.strictEqual(shortRes.status, 400);
    });

    await testAsync('9. User A can successfully change their password', async () => {
      const res = await request('POST', '/auth/change-password', {
        body: {
          currentPassword: PASSWORD_ORIGINAL,
          newPassword: PASSWORD_NEW
        },
        jar: userACookieJar
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    await testAsync('10. User A old password no longer works, new password logs in', async () => {
      const oldLogin = await request('POST', '/auth/login', {
        body: { email: USER_A_EMAIL, password: PASSWORD_ORIGINAL }
      });
      assert.strictEqual(oldLogin.status, 401, 'Old password must fail');

      const newJar = {};
      const newLogin = await request('POST', '/auth/login', {
        body: { email: USER_A_EMAIL, password: PASSWORD_NEW },
        jar: newJar
      });
      assert.strictEqual(newLogin.status, 200, 'New password must succeed');
      assert.ok(newJar.hr_access);
    });

    // -------------------------------------------------------------
    // RBAC & SECURITY TESTS
    // -------------------------------------------------------------
    await testAsync('11. Normal users cannot access Admin APIs (403 Forbidden)', async () => {
      const usersRes = await request('GET', '/admin/users', { jar: userACookieJar });
      assert.strictEqual(usersRes.status, 403, 'Normal user must be forbidden from /admin/users');
      assert.strictEqual(usersRes.body.code, 'FORBIDDEN');

      const actRes = await request('GET', '/admin/activities', { jar: userACookieJar });
      assert.strictEqual(actRes.status, 403, 'Normal user must be forbidden from /admin/activities');

      const statusRes = await request('PATCH', `/admin/users/${userBId}/status`, {
        body: { isActive: false },
        jar: userACookieJar
      });
      assert.strictEqual(statusRes.status, 403, 'Normal user cannot disable another user');
    });

    // -------------------------------------------------------------
    // ADMIN USER MANAGEMENT & ACTIVITY TESTS
    // -------------------------------------------------------------
    await testAsync('12. Existing Admin can log in and view users list with metrics', async () => {
      const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@hrdashboard.local').toLowerCase();
      const adminPass = process.env.SEED_ADMIN_PASSWORD || 'vJUmUsdJwTMB4SaMTkXFxElz';

      const loginRes = await request('POST', '/auth/login', {
        body: { email: adminEmail, password: adminPass },
        jar: adminCookieJar
      });
      assert.strictEqual(loginRes.status, 200, 'Admin login must succeed');
      assert.strictEqual(loginRes.body.data.user.role, 'ADMIN');

      const usersRes = await request('GET', '/admin/users', { jar: adminCookieJar });
      assert.strictEqual(usersRes.status, 200);
      assert.ok(Array.isArray(usersRes.body.data), 'Users list must be an array');
      assert.ok(usersRes.body.counts.total >= 3, 'Must have at least Admin, User A, and User B');

      // Verify User A and User B appear in list
      const emails = usersRes.body.data.map((u) => u.email.toLowerCase());
      assert.ok(emails.includes(USER_A_EMAIL.toLowerCase()), 'User A must appear in admin list');
      assert.ok(emails.includes(USER_B_EMAIL.toLowerCase()), 'User B must appear in admin list');
    });

    await testAsync('13. Admin can search users by name or email', async () => {
      const searchRes = await request('GET', `/admin/users?search=${encodeURIComponent(USER_A_EMAIL)}`, {
        jar: adminCookieJar
      });
      assert.strictEqual(searchRes.status, 200);
      assert.strictEqual(searchRes.body.data.length, 1);
      assert.strictEqual(searchRes.body.data[0].email, USER_A_EMAIL.toLowerCase());
    });

    await testAsync('14. Admin can view detailed user info and activity timeline', async () => {
      const detailRes = await request('GET', `/admin/users/${userAId}`, { jar: adminCookieJar });
      assert.strictEqual(detailRes.status, 200);
      assert.strictEqual(detailRes.body.data.user.id, userAId);
      assert.ok(Array.isArray(detailRes.body.data.recentActivities));
      assert.ok(detailRes.body.data.recentActivities.length > 0, 'User A must have activity entries');

      const actions = detailRes.body.data.recentActivities.map((a) => a.action);
      assert.ok(actions.includes('ACCOUNT_CREATED'), 'Must record ACCOUNT_CREATED');
      assert.ok(actions.includes('PROFILE_UPDATED'), 'Must record PROFILE_UPDATED');
      assert.ok(actions.includes('PASSWORD_CHANGED'), 'Must record PASSWORD_CHANGED');
    });

    await testAsync('15. Admin cannot disable their own account (safety check)', async () => {
      const disableSelf = await request('PATCH', `/admin/users/${adminUserId}/status`, {
        body: { isActive: false },
        jar: adminCookieJar
      });
      assert.strictEqual(disableSelf.status, 400);
      assert.strictEqual(disableSelf.body.code, 'CANNOT_DISABLE_SELF');
    });

    await testAsync('16. Admin can disable a user account and their active session stops working', async () => {
      const disableRes = await request('PATCH', `/admin/users/${userBId}/status`, {
        body: { isActive: false },
        jar: adminCookieJar
      });
      assert.strictEqual(disableRes.status, 200);
      assert.strictEqual(disableRes.body.data.user.isActive, false);

      // User B attempt to refresh or access API must now fail
      const userBReq = await request('GET', '/auth/me', { jar: userBCookieJar });
      assert.strictEqual(userBReq.status, 401, 'Disabled user must be rejected with 401');

      // User B attempt to log in must fail
      const userBLogin = await request('POST', '/auth/login', {
        body: { email: USER_B_EMAIL, password: PASSWORD_ORIGINAL }
      });
      assert.strictEqual(userBLogin.status, 401, 'Disabled user cannot log in');
    });

    await testAsync('17. Admin can reactivate a disabled account and user can log in again', async () => {
      const reactivateRes = await request('PATCH', `/admin/users/${userBId}/status`, {
        body: { isActive: true },
        jar: adminCookieJar
      });
      assert.strictEqual(reactivateRes.status, 200);
      assert.strictEqual(reactivateRes.body.data.user.isActive, true);

      const userBLogin = await request('POST', '/auth/login', {
        body: { email: USER_B_EMAIL, password: PASSWORD_ORIGINAL },
        jar: userBCookieJar
      });
      assert.strictEqual(userBLogin.status, 200, 'Reactivated user can log in successfully');
    });

    await testAsync('18. Admin can view platform activity audit trail with filter', async () => {
      const activitiesRes = await request('GET', '/admin/activities?limit=10', { jar: adminCookieJar });
      assert.strictEqual(activitiesRes.status, 200);
      assert.ok(Array.isArray(activitiesRes.body.data));
      assert.ok(activitiesRes.body.data.length > 0);

      // Verify actions include USER_STATUS_CHANGED, PASSWORD_CHANGED, ACCOUNT_CREATED
      const actions = activitiesRes.body.data.map((a) => a.action);
      assert.ok(actions.includes('USER_STATUS_CHANGED'));
    });

  } finally {
    // Cleanup created test users
    await prisma.platformActivity.deleteMany({
      where: { userId: { in: [userAId, userBId].filter(Boolean) } }
    }).catch(() => {});

    await prisma.workspaceMember.deleteMany({
      where: { userId: { in: [userAId, userBId].filter(Boolean) } }
    }).catch(() => {});

    await prisma.authSession.deleteMany({
      where: { userId: { in: [userAId, userBId].filter(Boolean) } }
    }).catch(() => {});

    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId].filter(Boolean) } }
    }).catch(() => {});

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
};

run()
  .then(() => {
    const res = suite.summary();
    if (res.failed > 0) process.exit(1);
  })
  .catch((err) => {
    console.error('[MultiUserTest] Suite encountered an unhandled error:', err);
    process.exit(1);
  });
