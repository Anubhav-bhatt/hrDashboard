/**
 * Signup, auto-login and the first-run experience — in a real browser.
 *
 * Covers the path a person who has never used the product takes: create an
 * account, land somewhere useful, and see their own empty workspace rather than
 * somebody else's data. The isolation assertion here is the browser-level
 * counterpart to the backend isolation suite: the environment this runs in has
 * a seeded account with a job in it, and a freshly created account must not see
 * a trace of it.
 *
 * Environment:
 *   E2E_BASE_URL   frontend origin              (default http://127.0.0.1:5173)
 *   E2E_EMAIL      an existing account, used for the duplicate-email case
 *   E2E_PASSWORD   its password
 *   E2E_BROWSER    chromium | firefox | webkit | msedge | chrome (default chromium)
 *   E2E_HEADED     1 to watch it run
 *
 * No token value is ever printed.
 */
import { randomUUID } from 'node:crypto';
import * as playwright from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const EXISTING_EMAIL = process.env.E2E_EMAIL;
const BROWSER = process.env.E2E_BROWSER || 'chromium';

if (!EXISTING_EMAIL) {
  console.error('E2E_EMAIL must be set to an account that already exists.');
  process.exit(1);
}

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

const NEW_EMAIL = `signup.${randomUUID().slice(0, 12)}@example.invalid`;
const NEW_PASSWORD = 'FirstRunPassword123!';
const NEW_NAME = 'Nadia Iqbal';

const authCookies = async () => {
  const all = await context.cookies();
  return {
    access: all.find((c) => c.name === 'hr_access'),
    refresh: all.find((c) => c.name === 'hr_refresh')
  };
};

const onLoginScreen = () => page.url().includes('/login');
const onSignupScreen = () => page.url().includes('/signup');

/**
 * Opens the signup form and waits for it to actually be there.
 *
 * The provider resolves the session before rendering either auth screen, so for
 * a moment after navigation the page is a spinner and not a form. That is the
 * intended behaviour — it is what stops a signed-in recruiter seeing a flash of
 * the sign-in screen — so the suite waits for the form rather than racing it.
 */
const gotoSignup = async () => {
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#name', { state: 'visible', timeout: 20000 });
};

const fillSignup = async ({ name, email, password }) => {
  await page.fill('#name', name);
  await page.fill('#email', email);
  await page.fill('#password', password);
};

const bodyText = () => page.locator('body').innerText();

console.log(`\nSignup & first run — ${BROWSER}`);
console.log(`Base URL: ${BASE}`);

try {
  /* ------------------------------------------------------------ the form -- */

  group('The signup form');

  await gotoSignup();

  check(await page.locator('#name').count() === 1, 'asks for a name');
  check(await page.locator('#email').count() === 1, 'asks for an email');
  check(await page.locator('#password').count() === 1, 'asks for a password');

  // Stage 13: nothing beyond what it takes to begin.
  const inputCount = await page.locator('form input').count();
  check(inputCount === 3, 'asks for nothing else', `found ${inputCount} inputs`);

  const text = await bodyText();
  check(
    !/company size|industry|department|job title|phone number/i.test(text),
    'does not ask for company size, industry, department or phone'
  );
  check(!/\badmin\b|super ?admin|select your role/i.test(text), 'never asks the person to choose a role');

  check(
    (await page.locator('#email').getAttribute('autocomplete')) === 'email',
    'the email field is marked up for autofill'
  );
  check(
    (await page.locator('#password').getAttribute('autocomplete')) === 'new-password',
    'the password field asks for a new password, not a saved one'
  );

  const toggle = page.getByRole('button', { name: /show password/i });
  check(await toggle.count() > 0, 'a show-password control is available with an accessible name');
  if (await toggle.count()) {
    await page.fill('#password', 'visible-check');
    await toggle.first().click();
    check((await page.locator('#password').getAttribute('type')) === 'text', 'showing the password works');
    await page.getByRole('button', { name: /hide password/i }).first().click();
    check((await page.locator('#password').getAttribute('type')) === 'password', 'and hiding it again works');
    await page.fill('#password', '');
  }

  /* ---------------------------------------------------------- validation -- */

  group('Errors keep what was typed');

  await fillSignup({ name: NEW_NAME, email: 'not-an-email', password: 'short' });
  await page.click('button[type=submit]');
  await page.waitForTimeout(600);

  check(onSignupScreen(), 'an invalid submission stays on the form');
  check((await page.locator('#name').inputValue()) === NEW_NAME, 'the name is not erased');
  const afterInvalid = await bodyText();
  check(/valid email/i.test(afterInvalid), 'the email problem is stated');
  check(/10 characters/i.test(afterInvalid), 'the password requirement is stated');

  /* ----------------------------------------------------- duplicate email -- */

  group('An address that already has an account');

  await fillSignup({ name: NEW_NAME, email: EXISTING_EMAIL, password: NEW_PASSWORD });
  await page.click('button[type=submit]');
  await page.waitForTimeout(1500);

  check(onSignupScreen(), 'stays on the form');
  const dupText = await bodyText();
  check(/already exists/i.test(dupText), 'says the address is taken');
  check(
    (await page.getByRole('link', { name: /sign in instead/i }).count()) > 0,
    'offers a way through to signing in'
  );
  check((await page.locator('#name').inputValue()) === NEW_NAME, 'the name survives a recoverable failure');

  /* -------------------------------------------------------------- signup -- */

  group('Creating an account');

  await gotoSignup();
  await fillSignup({ name: NEW_NAME, email: NEW_EMAIL, password: NEW_PASSWORD });
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/signup'), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);

  check(!onSignupScreen() && !onLoginScreen(), 'the account is created and the person is let in');

  const cookies = await authCookies();
  check(Boolean(cookies.access && cookies.refresh), 'both session cookies are stored');
  check(cookies.access?.httpOnly === true, 'the access cookie is HttpOnly');
  check(cookies.refresh?.httpOnly === true, 'the refresh cookie is HttpOnly');

  const visibleToScript = await page.evaluate(() => document.cookie);
  check(
    !visibleToScript.includes('hr_access') && !visibleToScript.includes('hr_refresh'),
    'neither token is readable from JavaScript'
  );

  // Stage 15: no bounce through the login screen.
  check(!onLoginScreen(), 'signing up never sends the person to the sign-in screen');

  /* ------------------------------------------------------- the first run -- */

  group('A brand-new workspace');

  const firstRun = await bodyText();
  check(/welcome/i.test(firstRun), 'greets the new recruiter');
  check(/Nadia/.test(firstRun), 'by name', firstRun.slice(0, 80));

  const createFirst = page.getByRole('link', { name: /create your first job/i });
  check(await createFirst.count() > 0, 'offers one clear first action');
  check(/how it works/i.test(firstRun), 'explains what happens next');

  // Stage 50: no alarming wall of zeroes.
  check(!/recruitment snapshot/i.test(firstRun), 'does not show a dashboard of zeroes');

  // The browser-level isolation check: the seeded workspace has a job in it.
  check(!/Auth Matrix Role/i.test(firstRun), 'sees nothing belonging to the seeded workspace');

  await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const jobsText = await bodyText();
  check(!/Auth Matrix Role/i.test(jobsText), 'the jobs list is empty, not somebody else’s');

  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const candidatesText = await bodyText();
  check(
    !/Auth Matrix Role/i.test(candidatesText),
    'the candidates list is empty, not somebody else’s'
  );

  /* ----------------------------------------------------------- continuity - */

  group('The session behaves like a session');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check(!onLoginScreen(), 'a reload keeps the new account signed in');

  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check(!onSignupScreen(), 'visiting /signup with a session does not ask for a second account');

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check(!onLoginScreen(), 'visiting /login with a session does not ask to sign in again');

  /* -------------------------------------------------------------- signout - */

  group('Sign out and back in');

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const signOut = page.getByRole('button', { name: /sign out|log out/i }).first();
  if (await signOut.count()) {
    await signOut.click();
  } else {
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }));
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(2000);
  check(onLoginScreen(), 'signing out lands on the sign-in screen');

  const afterSignOut = await authCookies();
  check(!afterSignOut.access?.value, 'the access cookie is gone');
  check(!afterSignOut.refresh?.value, 'the refresh cookie is gone');

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', NEW_EMAIL);
  await page.fill('#password', NEW_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  check(!onLoginScreen(), 'the new account can sign in again with the same credentials');

  const returning = await bodyText();
  check(!/Auth Matrix Role/i.test(returning), 'and still sees only its own workspace');
} catch (error) {
  failed += 1;
  console.log(`  FAIL  suite crashed :: ${error.message}`);
} finally {
  await context.close();
  await browser.close();
}

console.log(`\n${BROWSER}: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
