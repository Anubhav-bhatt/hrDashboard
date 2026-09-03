/**
 * Dual-mode UI foundation verification.
 *
 * Covers the shell-level properties the foundation claims: no horizontal
 * overflow at any supported width in either mode, both navigations present and
 * reachable, a clean console, and a mode switch that reorganises presentation
 * without re-fetching the application.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

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
const section = (t) => console.log(`\n=== ${t} ===`);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(e.message));

const ignorable = (m) =>
  /favicon|Download the React DevTools|ResizeObserver loop|WebSocket|ERR_NETWORK_IO_SUSPENDED/i.test(m) ||
  /Failed to load resource.*401/i.test(m);

const WIDTHS = [1440, 1280, 1024, 768, 430, 390, 375];
const ROUTES = ['/dashboard', '/jobs', '/candidates', '/jobs/closed', '/ai', '/settings'];

const overflow = () =>
  page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth
  }));

const setMode = async (mode) => {
  await page.evaluate((m) => window.localStorage.setItem('hr-dashboard-workspace-mode', m), mode);
};

try {
  /* ------------------------------------------------------------- sign in -- */
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  if (await page.locator('#email').isVisible()) {
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
    await page.waitForTimeout(800);
  }
  consoleErrors.length = 0;
  pageErrors.length = 0;

  /* ------------------------------------------ standard mode navigation --- */
  section('Standard mode — navigation and hierarchy');
  await setMode('normal');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  for (const [label, count] of [
    ['Main navigation', 1],
    ['Hiring navigation', 3],
    ['System navigation', 1]
  ]) {
    const n = await page.locator(`nav[aria-label="${label}"] a`).count();
    check(n === count, `standard: ${label} has ${count} destination(s)`, String(n));
  }

  const aiGroup = page.locator('nav[aria-label="AI Recruitment"]');
  check((await aiGroup.count()) === 1, 'standard: the AI group is present');
  for (const label of ['AI Assistant', 'Hiring Insights']) {
    check((await aiGroup.getByText(label, { exact: true }).count()) > 0, `standard: AI promotes ${label}`);
  }
  check(
    (await page.locator('button[aria-controls="ai-tools-group"]').count()) === 1,
    'standard: specialist tools sit behind a disclosure'
  );

  // Nothing became unreachable: every agent route still resolves from the rail.
  await page.locator('button[aria-controls="ai-tools-group"]').click();
  await page.waitForTimeout(300);
  for (const href of ['/ai', '/ai/insights', '/ai/screening', '/ai/ranking', '/ai/comparison']) {
    check(
      (await aiGroup.locator(`a[href="${href}"]`).count()) === 1,
      `standard: ${href} reachable from the rail`
    );
  }

  /* ----------------------------------------- minimal mode navigation ----- */
  section('Minimal mode — navigation is simpler');
  await setMode('minimal');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  const minimalNavLinks = await page.locator('aside nav a').count();
  check(minimalNavLinks === 6, 'minimal: the rail offers six destinations', String(minimalNavLinks));
  check(
    (await page.locator('nav[aria-label="Assistant navigation"] a[href="/ai"]').count()) === 1,
    'minimal: the Assistant is one named destination'
  );
  check(
    (await page.locator('button[aria-controls="ai-tools-group"]').count()) === 0,
    'minimal: no agent menu is presented'
  );
  const minimalText = await page.locator('aside').innerText();
  check(
    !/Screening Agent|Ranking Agent|Comparison Agent|Insights Agent/i.test(minimalText),
    'minimal: the rail names no agent machinery',
    minimalText.replace(/\n/g, ' | ')
  );

  /* -------------------------------------------------- focus composition -- */
  section('Minimal workspace — task-first composition');
  await page.goto(`${BASE}/focus`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const journey = page.locator('nav[aria-label="Hiring Progress Journey"]');
  const nextStep = page.locator('section[aria-label="Recommended Next Action"]');
  const hasJourney = (await journey.count()) > 0;
  check(hasJourney, 'focus: the hiring journey is shown');
  if (hasJourney) {
    const stages = await journey.innerText();
    for (const stage of ['Job Created', 'Review Matches', 'Shortlist', 'Close Job']) {
      check(stages.includes(stage), `focus: journey lists ${stage}`);
    }
  }
  check((await nextStep.count()) > 0, 'focus: a recommended next step is shown');
  if ((await nextStep.count()) > 0) {
    const ctas = await nextStep.locator('a.btn-primary, button.btn-primary').count();
    check(ctas === 1, 'focus: the next step has exactly one dominant action', String(ctas));
  }
  check((await page.locator('h1').count()) === 1, 'focus: exactly one page heading');

  /* ------------------------------------------------------- mode switch --- */
  section('Mode switch — presentation only');
  await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const apiCalls = [];
  const recorder = (req) => {
    const u = req.url();
    if (u.includes('/api/')) apiCalls.push(u.replace(BASE, ''));
  };
  page.on('request', recorder);

  // Toggle presentation without navigating. The route stays put, so nothing
  // should be re-fetched to render the same data differently.
  await page.evaluate(() => {
    window.localStorage.setItem('hr-dashboard-workspace-mode', 'minimal');
  });
  await page.waitForTimeout(700);
  page.off('request', recorder);
  check(apiCalls.length === 0, 'switching the stored mode issues no API calls', apiCalls.join(', '));

  /* --------------------------------------------------------- responsive -- */
  for (const mode of ['normal', 'minimal']) {
    section(`Responsive — ${mode} mode`);
    await setMode(mode);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [...ROUTES, '/focus']) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        const { doc, win } = await overflow();
        check(doc <= win + 1, `${mode} ${width}px — ${route} has no horizontal overflow`, `${doc} > ${win}`);
      }
    }
  }

  /* ------------------------------------------------------ mobile drawer -- */
  section('Mobile drawer');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const mode of ['normal', 'minimal']) {
    await setMode(mode);
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.waitForTimeout(500);
    const drawer = page.locator('aside[role="dialog"]');
    check(await drawer.isVisible(), `${mode}: the drawer opens on mobile`);
    check(
      (await drawer.getAttribute('aria-modal')) === 'true',
      `${mode}: the drawer is a modal dialog`
    );
    check(
      (await drawer.locator('nav a').count()) > 0,
      `${mode}: the drawer carries navigation`
    );

    // A modal dialog has to be escapable and has to place focus inside itself.
    const focusInside = await page.evaluate(() => {
      const d = document.getElementById('mobile-navigation-drawer');
      return Boolean(d && document.activeElement && d.contains(document.activeElement));
    });
    check(focusInside, `${mode}: opening the drawer moves focus into it`);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check(!(await drawer.count()), `${mode}: Escape closes the drawer`);

    const focusRestored = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') === 'Open navigation menu'
    );
    check(focusRestored, `${mode}: closing returns focus to the menu button`);
  }

  /* ------------------------------------------------------ accessibility -- */
  section('Accessibility of the shell');
  await page.setViewportSize({ width: 1440, height: 900 });
  await setMode('normal');
  await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  check(
    (await page.locator('nav[aria-label="Hiring navigation"] a[aria-current="page"]').count()) === 1,
    'the active destination is announced with aria-current'
  );
  const toggle = page.getByRole('button', { name: 'Minimal mode' });
  check((await toggle.count()) === 1, 'the mode switch has an accessible name');
  check((await toggle.getAttribute('aria-pressed')) === 'false', 'the mode switch reports its state');
  const clickableDivs = await page.evaluate(
    () => document.querySelectorAll('aside div[onclick], aside div[role="button"]').length
  );
  check(clickableDivs === 0, 'the rail contains no clickable divs', String(clickableDivs));

  /* ------------------------------------------------------------- console -- */
  section('Runtime health');
  const real = consoleErrors.filter((m) => !ignorable(m));
  check(pageErrors.length === 0, 'no uncaught exceptions', pageErrors.slice(0, 3).join('; '));
  check(real.length === 0, 'no console errors', real.slice(0, 5).join('; '));
} catch (error) {
  failed++;
  console.error('\n  SUITE ERROR:', error.message);
  console.error(error.stack);
} finally {
  await browser.close();
}

console.log('\n----------------------------------------------------------------');
console.log(`  Dual-mode foundation: ${passed} passed, ${failed} failed`);
console.log('----------------------------------------------------------------\n');
process.exit(failed === 0 ? 0 : 1);
