/**
 * Theme, sidebar and token-input behaviour checks.
 *
 * Covers the parts of the premium UI work that are stateful rather than visual:
 * theme resolution and persistence, absence of a light flash on load, sidebar
 * collapse persistence and tooltips, the skill popover's keyboard contract, and
 * dark mode at every supported width.
 *
 *   node theme-and-shell.mjs
 *
 * Environment: E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD, E2E_BROWSER
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CHANNEL = process.env.E2E_BROWSER || 'msedge';

if (!EMAIL || !PASSWORD) {
  console.error('E2E_EMAIL and E2E_PASSWORD must be set.');
  process.exit(1);
}

const browser = await chromium.launch({ ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }) });

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

/** Signs in and returns a page ready for assertions. */
const openApp = async (context) => {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
  return page;
};

const themeState = (page) =>
  page.evaluate(() => ({
    hasDark: document.documentElement.classList.contains('dark'),
    colorScheme: document.documentElement.style.colorScheme,
    stored: window.localStorage.getItem('hr-dashboard-theme'),
    bodyBg: getComputedStyle(document.body).backgroundColor
  }));

try {
  /* ------------------------------------------------ default = system ----- */
  section('Theme default follows the system');

  for (const [scheme, expectDark] of [
    ['dark', true],
    ['light', false]
  ]) {
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });
    const page = await openApp(context);
    await page.waitForTimeout(700);
    const state = await themeState(page);
    check(
      state.hasDark === expectDark,
      `with no saved preference and an OS preference of ${scheme}, the app renders ${expectDark ? 'dark' : 'light'}`,
      JSON.stringify(state)
    );
    await context.close();
  }

  /* ---------------------------------------------- explicit selection ----- */
  section('Theme selector');

  const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 900 } });
  let page = await openApp(context);
  await page.waitForTimeout(600);

  // Appearance now lives in Settings rather than the account menu, so that daily
  // navigation carries only the four destinations a recruiter actually works in.
  // The account menu still routes there.
  await page.click('button[aria-haspopup="menu"]');
  await page.waitForTimeout(400);
  check(
    (await page.locator('a[role="menuitem"][href="/settings"]').count()) === 1,
    'the account menu links to Settings'
  );

  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('radiogroup', { name: /colour theme/i }).waitFor({ state: 'visible', timeout: 20000 });
  check((await page.getByRole('radiogroup', { name: /colour theme/i }).count()) === 1, 'Settings exposes the Appearance control');

  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.waitForTimeout(600);
  let state = await themeState(page);
  check(state.hasDark, 'choosing Dark applies the dark theme');
  check(state.stored === 'dark', 'the choice is persisted', state.stored);

  await page.getByRole('radio', { name: 'Light' }).click();
  await page.waitForTimeout(600);
  state = await themeState(page);
  check(!state.hasDark, 'choosing Light applies the light theme');

  // System should follow the context's light preference.
  await page.getByRole('radio', { name: 'System' }).click();
  await page.waitForTimeout(600);
  state = await themeState(page);
  check(state.stored === 'system', 'System is persisted');
  check(!state.hasDark, 'System resolves to light for a light OS preference');

  /* ------------------------------------------------------ persistence ---- */
  section('Persistence across reload');

  await page.evaluate(() => window.localStorage.setItem('hr-dashboard-theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  state = await themeState(page);
  check(state.hasDark, 'dark survives a reload');

  await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check((await themeState(page)).hasDark, 'dark persists across navigation');

  /* -------------------------------------------------------- no flash ----- */
  section('No light flash on load');

  // The pre-React inline script must set the class before the first paint, so
  // the very first document evaluation already reports dark.
  const flashContext = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 900 } });
  await flashContext.addInitScript(() => window.localStorage.setItem('hr-dashboard-theme', 'dark'));
  const flashPage = await flashContext.newPage();
  // domcontentloaded is the earliest point at which any script has executed. The
  // head script must already have themed the root by then — long before React
  // mounts, which is what prevents the flash.
  await flashPage.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' });
  const atLoad = await flashPage.evaluate(() => ({
    hasDark: document.documentElement.classList.contains('dark'),
    scheme: document.documentElement.style.colorScheme,
    reactMounted: Boolean(document.querySelector('#root')?.childElementCount)
  }));
  check(atLoad.hasDark, 'the dark class is present at DOMContentLoaded', JSON.stringify(atLoad));
  check(atLoad.scheme === 'dark', 'color-scheme is set that early too');

  // The guarantee is document order: the theme script must run before the app
  // bundle and before the stylesheet is applied to any content.
  const html = await flashPage.content();
  const themeScriptAt = html.indexOf('hr-dashboard-theme');
  const rootAt = html.indexOf('id="root"');
  check(
    themeScriptAt > -1 && themeScriptAt < rootAt,
    'the theme script is declared before the app root, so it runs before any content paints'
  );
  await flashContext.close();

  /* --------------------------------------------------- sidebar collapse -- */
  section('Sidebar collapse');

  await page.evaluate(() => window.localStorage.setItem('hr-dashboard-theme', 'light'));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.locator('a[aria-label^="Active candidates"]').waitFor({ state: 'visible', timeout: 20000 });

  const railWidth = () => page.evaluate(() => document.querySelector('aside')?.getBoundingClientRect().width ?? 0);
  const expandedWidth = await railWidth();
  check(expandedWidth >= 220 && expandedWidth <= 250, `expanded rail is ${Math.round(expandedWidth)}px (220-250px)`);

  await page.click('button[aria-label="Collapse sidebar"]');
  await page.waitForTimeout(600);
  const collapsedWidth = await railWidth();
  check(collapsedWidth >= 60 && collapsedWidth <= 76, `collapsed rail is ${Math.round(collapsedWidth)}px (60-76px)`);

  // Labels are gone, so every icon needs an accessible name and a tooltip.
  const collapsedNav = await page.evaluate(() =>
    Array.from(document.querySelectorAll('nav[aria-label="Main navigation"] a')).map((a) => ({
      aria: a.getAttribute('aria-label'),
      hasTooltip: Boolean(a.querySelector('[role="tooltip"]'))
    }))
  );
  check(collapsedNav.every((n) => n.aria), 'collapsed nav items have accessible names', JSON.stringify(collapsedNav));
  check(collapsedNav.every((n) => n.hasTooltip), 'collapsed nav items carry tooltips');

  // The tooltip must also appear on keyboard focus, not only hover.
  await page.locator('nav[aria-label="Main navigation"] a').first().focus();
  await page.waitForTimeout(300);
  const tooltipOnFocus = await page.evaluate(() => {
    const tip = document.querySelector('nav[aria-label="Main navigation"] a [role="tooltip"]');
    return tip ? Number(getComputedStyle(tip).opacity) : 0;
  });
  check(tooltipOnFocus > 0.5, `tooltip becomes visible on keyboard focus (opacity ${tooltipOnFocus})`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check(Math.abs((await railWidth()) - collapsedWidth) < 4, 'the collapsed preference survives a reload');

  await page.click('button[aria-label="Expand sidebar"]');
  await page.waitForTimeout(600);
  check(Math.abs((await railWidth()) - expandedWidth) < 4, 'the rail expands again');

  // Content must not sit underneath the fixed rail.
  const overlap = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    const main = document.querySelector('#main-content');
    if (!aside || !main) return null;
    return main.getBoundingClientRect().left >= aside.getBoundingClientRect().right - 1;
  });
  check(overlap === true, 'main content clears the sidebar rail');

  /* ------------------------------------------------ skill popover UX ----- */
  section('Skill popover');

  await page.goto(`${BASE}/jobs/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  check((await page.locator('text=/^01$/').count()) > 0, 'section 01 marker rendered');
  check((await page.locator('text=/^02$/').count()) > 0, 'section 02 marker rendered');
  check((await page.locator('text=/^03$/').count()) > 0, 'section 03 marker rendered');

  const addSkill = page.locator('button:has-text("Add skill")').first();
  await addSkill.click();
  await page.waitForTimeout(400);
  check((await page.locator('#required-skills-input').count()) === 1, 'the popover opens with a focused field');

  // Free text, added with Enter.
  await page.fill('#required-skills-input', 'EV Charger Diagnostics');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check((await page.locator('text=EV Charger Diagnostics').count()) > 0, 'free-text values are accepted');

  // Case-insensitive duplicate rejection.
  await page.fill('#required-skills-input', 'ev charger diagnostics');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check(
    /already included/i.test(await page.locator('body').innerText()),
    'a case-insensitive duplicate is rejected with feedback'
  );

  // Arrow keys move through suggestions, Enter picks the highlighted one.
  await page.fill('#required-skills-input', 'react');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const highlighted = await page.evaluate(() => {
    const active = document.querySelector('#required-skills-input')?.getAttribute('aria-activedescendant');
    return active ? document.getElementById(active)?.textContent?.trim() : null;
  });
  check(Boolean(highlighted), `ArrowDown highlights a suggestion (${highlighted})`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check(
    highlighted ? (await page.locator('body').innerText()).includes(highlighted) : false,
    'Enter adds the highlighted suggestion'
  );

  // Escape closes and returns focus to the Add button.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check((await page.locator('#required-skills-input').count()) === 0, 'Escape closes the popover');
  const focusReturned = await page.evaluate(() =>
    (document.activeElement?.textContent || '').toLowerCase().includes('add skill')
  );
  check(focusReturned, 'focus returns to the Add button');

  /* ------------------------------------- dark mode at every width -------- */
  section('Dark mode at every width');

  await page.evaluate(() => window.localStorage.setItem('hr-dashboard-theme', 'dark'));
  const routes = ['/', '/jobs', '/jobs/new', '/candidates'];
  const widths = [1440, 1280, 1024, 768, 430, 390, 375];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const result = await page.evaluate(() => ({
        dark: document.documentElement.classList.contains('dark'),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      }));
      check(result.dark && !result.overflow, `${width}px — ${route} renders dark with no overflow`, JSON.stringify(result));
    }
  }

  await context.close();
} catch (error) {
  failed++;
  console.error(`\n  SUITE ERROR: ${error.message}`);
} finally {
  console.log('\n---------------------------------------------');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}
