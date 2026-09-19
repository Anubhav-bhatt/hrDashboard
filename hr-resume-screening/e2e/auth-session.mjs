/**
 * Authentication, silent refresh and cookie security — in a real browser.
 *
 * This is the regression suite for the Safari failure. The original bug was not
 * reproducible in Node: the server did everything right, and WebKit simply
 * declined to store a cookie that arrived from a third-party origin. Only a
 * browser can tell us whether a cookie was *kept*, so that is what this checks,
 * across engines rather than in one.
 *
 * Run it against a deployment where the page and the API share an origin — that
 * is the architecture being verified. `run-auth-matrix.mjs` sets that up.
 *
 * Environment:
 *   E2E_BASE_URL   frontend origin              (default http://127.0.0.1:5173)
 *   E2E_EMAIL      recruiter account
 *   E2E_PASSWORD   recruiter password
 *   E2E_BROWSER    chromium | firefox | webkit | msedge | chrome (default chromium)
 *   E2E_HEADED     1 to watch it run
 *
 * No token value is ever printed. Assertions are about presence, flags and
 * behaviour.
 */
import * as playwright from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const BROWSER = process.env.E2E_BROWSER || 'chromium';

if (!EMAIL || !PASSWORD) {
  console.error('E2E_EMAIL and E2E_PASSWORD must be set to a recruiter account.');
  process.exit(1);
}

/**
 * Engine selection by configuration, never by path.
 *
 * `msedge` and `chrome` are installed Chromium channels rather than engines, so
 * they are launched through chromium with a channel. Everything else names a
 * Playwright browser type directly.
 */
const CHANNELS = { msedge: 'msedge', chrome: 'chrome' };
const launch = () => {
  const headless = process.env.E2E_HEADED !== '1';
  if (CHANNELS[BROWSER]) return playwright.chromium.launch({ channel: CHANNELS[BROWSER], headless });
  const engine = playwright[BROWSER];
  if (!engine) throw new Error(`Unknown E2E_BROWSER: ${BROWSER}`);
  return engine.launch({ headless });
};

let passed = 0;
let failed = 0;
const check = (condition, label, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
};
const group = (name) => console.log(`\n${name}`);

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

/* ------------------------------------------------------------- helpers ---- */

const authCookies = async () => {
  const all = await context.cookies();
  return {
    access: all.find((c) => c.name === 'hr_access'),
    refresh: all.find((c) => c.name === 'hr_refresh'),
    all
  };
};

/**
 * True when no cookie of this name is left holding a value.
 *
 * Checked across every entry rather than the first match: cookies of the same
 * name can coexist at different paths, and a leftover one would otherwise
 * shadow the real cookie and make a cleared session look uncleared.
 */
const noneRemain = async (name) => {
  const all = await context.cookies();
  return all.filter((c) => c.name === name).every((c) => !c.value);
};

/** Removes one cookie by re-seeding the jar without it. */
const dropCookie = async (name) => {
  const remaining = (await context.cookies()).filter((c) => c.name !== name);
  await context.clearCookies();
  if (remaining.length) await context.addCookies(remaining);
};

const login = async (target = page) => {
  await target.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await target.fill('#email', EMAIL);
  await target.fill('#password', PASSWORD);
  await target.click('button[type=submit]');
  await target.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 });
};

/**
 * Signs in and returns the raw Set-Cookie headers the server sent.
 *
 * Cookie *attributes* are asserted from the wire rather than from the browser's
 * cookie store. WebKit does not report SameSite back through its store — it
 * answers "None" for every cookie regardless of what was sent — so reading the
 * store would fail a correct server on that engine and, worse, would pass a
 * broken one. The header is the actual contract, and it is identical in all
 * three engines.
 */
const loginCapturingHeaders = async () => {
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
    { timeout: 30000 }
  );
  await login();
  const response = await responsePromise;
  const headers = await response.headersArray();
  return headers
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .flatMap((h) => h.value.split('\n'))
    .map((v) => v.trim())
    .filter(Boolean);
};

const onLoginScreen = (target = page) => target.url().includes('/login');

/** Counts refresh calls made while `action` runs. */
const countRefreshCalls = async (target, action) => {
  let calls = 0;
  const listener = (request) => {
    if (request.url().includes('/auth/refresh')) calls += 1;
  };
  target.on('request', listener);
  try {
    await action();
  } finally {
    target.off('request', listener);
  }
  return calls;
};

console.log(`\nAuthentication & refresh — ${BROWSER}`);
console.log(`Base URL: ${BASE}`);

try {
  /* --------------------------------------------------------------- login -- */

  group('Sign in');

  const loginSetCookies = await loginCapturingHeaders();
  check(!onLoginScreen(), 'sign-in completes and leaves the login screen');

  const afterLogin = await authCookies();
  check(Boolean(afterLogin.access), 'the browser stored the access cookie');
  check(Boolean(afterLogin.refresh), 'the browser stored the refresh cookie');

  // This is the assertion the whole same-origin change exists to satisfy. Under
  // the previous cross-site architecture WebKit reached exactly here with no
  // cookie at all, having received and discarded the Set-Cookie header.
  check(
    Boolean(afterLogin.access && afterLogin.refresh),
    'first-party cookies survive in this engine (the Safari regression)'
  );

  group('Cookie security');

  check(afterLogin.access?.httpOnly === true, 'the access cookie is HttpOnly');
  check(afterLogin.refresh?.httpOnly === true, 'the refresh cookie is HttpOnly');

  const sentAccess = loginSetCookies.find((c) => c.startsWith('hr_access='));
  const sentRefresh = loginSetCookies.find((c) => c.startsWith('hr_refresh='));

  check(Boolean(sentAccess), 'the access cookie was sent as its own Set-Cookie header');
  check(Boolean(sentRefresh), 'the refresh cookie was sent as its own Set-Cookie header');
  check(/HttpOnly/i.test(sentAccess || ''), 'the access cookie is sent HttpOnly');
  check(/HttpOnly/i.test(sentRefresh || ''), 'the refresh cookie is sent HttpOnly');
  check(/SameSite=Lax/i.test(sentAccess || ''), 'the access cookie is sent SameSite=Lax', sentAccess);
  check(/SameSite=Lax/i.test(sentRefresh || ''), 'the refresh cookie is sent SameSite=Lax', sentRefresh);
  check(
    /Path=\/api\/auth/i.test(sentRefresh || ''),
    'the refresh cookie is scoped to the auth routes',
    sentRefresh
  );
  check(
    afterLogin.refresh?.path === '/api/auth',
    'the browser stored the refresh cookie at that path',
    String(afterLogin.refresh?.path)
  );

  // Over plain http a Secure cookie would never be stored at all, so this is
  // asserted only where the deployment is actually https.
  if (BASE.startsWith('https://')) {
    check(/Secure/i.test(sentAccess || ''), 'the access cookie is sent Secure over https');
    check(/Secure/i.test(sentRefresh || ''), 'the refresh cookie is sent Secure over https');
    check(afterLogin.access?.secure === true, 'the access cookie is stored Secure');
    check(afterLogin.refresh?.secure === true, 'the refresh cookie is stored Secure');
  } else {
    console.log('  SKIP  Secure flag (only meaningful over https)');
  }

  const visibleToScript = await page.evaluate(() => document.cookie);
  check(
    !visibleToScript.includes('hr_access') && !visibleToScript.includes('hr_refresh'),
    'neither token is readable from JavaScript'
  );

  /* ------------------------------------------------------------ continuity -- */

  group('Session continuity');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check(!onLoginScreen(), 'a reload keeps the recruiter signed in');

  const secondTab = await context.newPage();
  await secondTab.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' });
  await secondTab.waitForTimeout(1200);
  check(!onLoginScreen(secondTab), 'a second tab is signed in without signing in again');
  await secondTab.close();

  /* -------------------------------------------------------- silent refresh -- */

  group('Silent refresh');

  // Dropping the access cookie is exactly what the browser itself does when the
  // cookie reaches its Max-Age, which is set to the token's TTL. The refresh
  // cookie is deliberately left in place.
  await dropCookie('hr_access');
  const beforeRenew = await authCookies();
  check(!beforeRenew.access && Boolean(beforeRenew.refresh), 'access expired, refresh still held');

  const refreshCalls = await countRefreshCalls(page, async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  });

  check(!onLoginScreen(), 'the recruiter never sees the sign-in screen');
  check(refreshCalls >= 1, 'the client renewed the session', `calls=${refreshCalls}`);
  check(
    refreshCalls === 1,
    'a page full of simultaneous requests triggers exactly one refresh',
    `calls=${refreshCalls}`
  );

  const renewed = await authCookies();
  check(Boolean(renewed.access), 'a new access cookie was issued');
  check(
    renewed.refresh && renewed.refresh.value !== beforeRenew.refresh.value,
    'the refresh token was rotated'
  );

  /* ------------------------------------------------------------ deep links -- */

  group('Deep links with an expired access token');

  for (const route of ['/dashboard', '/jobs', '/candidates']) {
    await dropCookie('hr_access');
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const path = new URL(page.url()).pathname;
    check(path === route, `${route} is restored silently and stays put`, `landed on ${path}`);
  }

  /* --------------------------------------------------------- stale cookies -- */

  group('Recovery from unusable cookies');

  const host = new URL(BASE).hostname;
  await context.clearCookies();
  // Seeded with explicit domain and path so they land exactly where the server
  // sets them. Passing a `url` instead would store the refresh cookie at /api/,
  // which the server's clear (Path=/api/auth) would never match — the cookie
  // would linger and shadow the real one in every later assertion.
  await context.addCookies([
    {
      name: 'hr_access',
      value: 'stale-token-from-a-previous-deployment',
      domain: host,
      path: '/'
    },
    {
      name: 'hr_refresh',
      value: 'stale-refresh-from-a-previous-deployment',
      domain: host,
      path: '/api/auth'
    }
  ]);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  check(onLoginScreen(), 'unusable cookies land the recruiter on sign-in rather than a dead page');

  check(await noneRemain('hr_access'), 'the stale access cookie was cleared');
  check(await noneRemain('hr_refresh'), 'the stale refresh cookie was cleared');

  await login();
  check(!onLoginScreen(), 'signing in again works — the stale state is not a trap');

  /* ---------------------------------------------------------------- logout -- */

  group('Sign out');

  const beforeLogout = await authCookies();
  const retiredRefresh = beforeLogout.refresh?.value;

  // The sign-out control lives in the app shell; fall back to the API if the
  // markup moves, since this suite is about the session, not the chrome.
  const signOut = page.getByRole('button', { name: /sign out|log out/i }).first();
  if (await signOut.count()) {
    await signOut.click();
  } else {
    await page.evaluate(() =>
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    );
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(2500);

  check(await noneRemain('hr_access'), 'the access cookie is gone after sign-out');
  check(await noneRemain('hr_refresh'), 'the refresh cookie is gone after sign-out');

  // The revoked token must be dead server-side, not merely dropped by the
  // browser: putting it back must not resurrect the session.
  if (retiredRefresh) {
    await context.addCookies([{ name: 'hr_refresh', value: retiredRefresh, url: `${BASE}/api/auth` }]);
    const status = await page.evaluate(async () => {
      const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      return response.status;
    });
    check(status === 401, 'the revoked refresh token is refused by the server', `status=${status}`);
    await context.clearCookies();
  }

  group('Sign in again');

  await login();
  check(!onLoginScreen(), 'the recruiter can sign in again after signing out');
  const finalCookies = await authCookies();
  check(Boolean(finalCookies.access && finalCookies.refresh), 'a fresh pair of cookies is issued');
} catch (error) {
  failed += 1;
  console.log(`  FAIL  suite crashed :: ${error.message}`);
} finally {
  await context.close();
  await browser.close();
}

console.log(`\n${BROWSER}: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
