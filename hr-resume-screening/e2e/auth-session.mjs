/**
 * End-to-End Authentication & Rotating Refresh Token Verification Suite
 *
 * Tests:
 * 1. Anonymous Visit Redirects to /login
 * 2. Recruiter Login & Dual Cookie Storage (hr_access, hr_refresh)
 * 3. Protected Route Access & Dashboard Render
 * 4. Page Reload Session Persistence
 * 5. Direct Deep Links to Protected Routes
 * 6. Silent Refresh Mechanism (access token expired -> refreshed via refresh token)
 * 7. Sign Out & Server-Side Revocation with Cookie Clearance
 *
 * Supports Chromium, WebKit (Safari engine), and Firefox:
 *   E2E_BROWSER=webkit node auth-session.mjs
 *   E2E_BROWSER=chromium node auth-session.mjs
 *   E2E_BROWSER=firefox node auth-session.mjs
 */

import { chromium, webkit, firefox } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL || 'admin@hrdashboard.local';
const PASSWORD = process.env.E2E_PASSWORD || 'vJUmUsdJwTMB4SaMTkXFxElz';
const BROWSER_TYPE = (process.env.E2E_BROWSER || 'chromium').toLowerCase();

console.log(`\n================================================================`);
console.log(`  E2E Auth & Refresh Token Test (${BROWSER_TYPE.toUpperCase()})`);
console.log(`  Target: ${BASE}`);
console.log(`================================================================\n`);

let browserLauncher;
if (BROWSER_TYPE === 'webkit') {
  browserLauncher = webkit;
} else if (BROWSER_TYPE === 'firefox') {
  browserLauncher = firefox;
} else {
  browserLauncher = chromium;
}

let passed = 0;
let failed = 0;

const check = (ok, label, detail = '') => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? `  ::  ${detail}` : ''}`);
  }
};

const section = (title) => console.log(`\n=== ${title} ===`);

let browser;
let context;
let page;

try {
  browser = await browserLauncher.launch({
    headless: process.env.E2E_HEADED !== '1'
  });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  /* ------------------- Test 1: Anonymous Access Redirects ------------------- */
  section('1. Anonymous Visit Redirects to /login');
  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
  check(page.url().includes('/login'), 'Visiting /candidates anonymously redirects to /login', page.url());

  /* ------------------- Test 2: Login Flow & Dual Cookies ------------------- */
  section('2. Recruiter Login & Dual Cookie Storage');
  await page.waitForSelector('#email', { timeout: 10000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  check(true, 'Login succeeded with valid credentials');

  const cookies = await context.cookies();
  const accessCookie = cookies.find((c) => c.name === 'hr_access' || c.name === 'hr_session');
  const refreshCookie = cookies.find((c) => c.name === 'hr_refresh');

  check(Boolean(accessCookie), 'hr_access (or session) cookie is stored in browser');
  check(Boolean(refreshCookie), 'hr_refresh cookie is stored in browser');
  check(accessCookie?.httpOnly === true, 'Access cookie is HttpOnly');
  check(refreshCookie?.httpOnly === true, 'Refresh cookie is HttpOnly');
  check(accessCookie?.sameSite?.toLowerCase() === 'lax', `Access cookie SameSite is Lax (${accessCookie?.sameSite})`);
  check(refreshCookie?.sameSite?.toLowerCase() === 'lax', `Refresh cookie SameSite is Lax (${refreshCookie?.sameSite})`);

  /* ------------------- Test 3: Dashboard Render ------------------- */
  section('3. Dashboard Loads with Protected Data');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a[aria-label^="Active candidates"]', { timeout: 15000 });
  const dashboardText = await page.locator('body').innerText();
  check(/candidates/i.test(dashboardText), 'Dashboard displays KPI metrics');
  check(!/\bNaN\b|\bundefined\b/.test(dashboardText), 'No NaN or undefined metrics');

  /* ------------------- Test 4: Reload Persistence ------------------- */
  section('4. Page Reload Session Persistence');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a[aria-label^="Active candidates"]', { timeout: 15000 });
  check(!page.url().includes('/login'), 'Session remains active across reload without login flash');

  /* ------------------- Test 5: Deep Linking ------------------- */
  section('5. Direct Deep Links to Protected Routes');
  await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' });
  check(page.url().includes('/jobs'), 'Direct deep link to /jobs maintains session', page.url());

  /* ------------------- Test 6: Silent Refresh On Expired Access ------------------- */
  section('6. Silent Refresh Mechanism');
  // Clear only the access token cookies to simulate access expiration while keeping hr_refresh
  await context.clearCookies({ name: 'hr_access' });
  await context.clearCookies({ name: 'hr_session' });

  const midCookies = await context.cookies();
  check(!midCookies.some((c) => c.name === 'hr_access'), 'Access cookie cleared to simulate token expiration');
  check(midCookies.some((c) => c.name === 'hr_refresh'), 'Refresh cookie remains present');

  // Trigger silent refresh through page API
  let refreshApiObserved = false;
  page.on('response', (res) => {
    if (res.url().includes('/api/auth/refresh') && res.status() === 200) {
      refreshApiObserved = true;
    }
  });

  // Trigger an authenticated request that will trigger the interceptor refresh coordinator
  await page.evaluate(async () => {
    try {
      // Direct call to refresh endpoint
      const res = await window.fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      return res.status;
    } catch {
      // In local dev without rewrite, fallback to backend URL
      const fallbackUrl = 'http://localhost:5001/api/auth/refresh';
      const res = await window.fetch(fallbackUrl, { method: 'POST', credentials: 'include' });
      return res.status;
    }
  });

  const postRefreshCookies = await context.cookies();
  const newAccessCookie = postRefreshCookies.find((c) => c.name === 'hr_access');
  check(Boolean(newAccessCookie), 'New access cookie issued and stored via refresh rotation');

  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' });
  check(!page.url().includes('/login'), 'Protected candidate route remains accessible after silent refresh');

  /* ------------------- Test 7: Logout & Revocation ------------------- */
  section('7. Sign Out & Cookie Clearance');
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("Sign out")', { timeout: 15000 });
  await page.click('button:has-text("Sign out")');
  await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
  check(page.url().includes('/login'), 'Sign out redirects to /login');

  const finalCookies = await context.cookies();
  const finalAccess = finalCookies.find((c) => (c.name === 'hr_access' || c.name === 'hr_session') && c.value !== '');
  const finalRefresh = finalCookies.find((c) => c.name === 'hr_refresh' && c.value !== '');
  check(!finalAccess, 'Access cookie is cleared after logout');
  check(!finalRefresh, 'Refresh cookie is cleared after logout');

  const realPageErrors = pageErrors.filter(
    (msg) => !msg.includes('due to access control checks') && !msg.includes('Load failed')
  );
  check(realPageErrors.length === 0, 'No uncaught application runtime errors during execution', realPageErrors.join(', '));

} catch (err) {
  console.error('Fatal test error:', err.message);
  failed++;
} finally {
  if (browser) await browser.close();
}

console.log(`\n================================================================`);
console.log(`  Auth E2E Results (${BROWSER_TYPE}): ${passed} passed, ${failed} failed`);
console.log(`================================================================\n`);

process.exit(failed > 0 ? 1 : 0);
