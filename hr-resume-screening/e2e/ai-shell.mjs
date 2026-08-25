/**
 * AI Recruitment navigation, routes and shared agent shell.
 *
 *   node ai-shell.mjs
 *
 * Environment: E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD, E2E_BROWSER
 *
 * Feature-flag states are exercised by intercepting `GET /api/ai/config` in the
 * browser rather than by restarting the API with different environment
 * variables. That is deliberate: what needs verifying here is how the *frontend*
 * responds to each flag combination, and stubbing makes every combination
 * reachable in one run instead of five server restarts. The endpoint's own
 * behaviour â€” that it reads the real environment and never leaks provider
 * detail â€” is covered by the backend suite, and one test below confirms the live
 * endpoint agrees with the stubbed shape.
 *
 * This suite needs no seeded candidates. Job and candidate selectors are asserted
 * on their empty states, which is exactly what an installation without fixtures
 * shows, so the run is meaningful against an empty database.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CHANNEL = process.env.E2E_BROWSER || 'msedge';

if (!EMAIL || !PASSWORD) {
  console.error('E2E_EMAIL and E2E_PASSWORD must be set to a recruiter account.');
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
const section = (title) => console.log(`\n=== ${title} ===`);

const ALL_MODES = ['assistant', 'screening', 'ranking', 'comparison', 'insights'];

const modesPayload = (overrides = {}) =>
  ALL_MODES.reduce((acc, id) => {
    acc[id] = overrides[id] !== undefined ? overrides[id] : true;
    return acc;
  }, {});

/**
 * Forces a specific AI configuration for a browser context.
 *
 * Passing `null` removes the stub so the real endpoint answers.
 */
const stubAiConfig = async (context, config) => {
  await context.unroute('**/api/ai/config').catch(() => {});
  if (config === null) return;

  await context.route('**/api/ai/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: config })
    })
  );
};

/**
 * The signed-in session, captured once and reused.
 *
 * `/api/auth/login` is rate limited to 20 attempts per 10 minutes â€” a real
 * protection against password guessing, and one this suite must not trip. Every
 * flag combination needs its own browser context, so signing in per context
 * would burn the whole allowance in a single run and fail for a reason unrelated
 * to the code under test. One sign-in, replayed as stored cookies, keeps the
 * suite honest about what it is testing.
 */
let authState = null;

const captureAuthState = async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('#email').waitFor({ state: 'visible', timeout: 15000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

  const state = await context.storageState();
  await context.close();
  return state;
};

/** A context with no session â€” for the anonymous route checks. */
const newContext = (options = {}) => browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });

/** A context that is already signed in. */
const newAuthedContext = (options = {}) =>
  browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: authState, ...options });

/** Opens the app in an already-authenticated context. */
const signIn = async (context, route = '/') => {
  const page = await context.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  return page;
};

const aiNav = (page) => page.locator('nav[aria-label="AI Recruitment"]');
const bodyText = (page) => page.locator('body').innerText();

/**
 * How many matches are actually rendered.
 *
 * The desktop rail and the mobile drawer both live in the document at every
 * width â€” only CSS decides which is shown â€” so counting DOM nodes says nothing
 * about what a recruiter can see.
 */
const countVisible = async (locator) => {
  const total = await locator.count();
  let visible = 0;
  for (let i = 0; i < total; i++) {
    if (await locator.nth(i).isVisible()) visible++;
  }
  return visible;
};

/* Console and request health, collected across the whole run. */
const consoleErrors = [];
const pageErrors = [];
const watch = (page) => {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return page;
};

try {
  /* ------------------------------------------ route security (anonymous) -- */
  section('AI routes are protected exactly like the rest of the dashboard');

  {
    const context = await newContext();
    const page = watch(await context.newPage());

    for (const route of ['/ai', '/ai/screening', '/ai/ranking', '/ai/comparison', '/ai/insights']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForURL('**/login**', { timeout: 10000 }).catch(() => {});
      check(page.url().includes('/login'), `anonymous ${route} redirects to sign-in`, page.url());
    }

    const text = await bodyText(page);
    check(!/AI Recruitment|Screening Agent|Ranking Agent/i.test(text), 'no AI surface leaks onto the sign-in screen');

    await context.close();
  }

  // One sign-in for the whole run; every context below replays it.
  authState = await captureAuthState();

  /* ---------------------------------------------------- AI fully enabled -- */
  section('Sidebar with every agent enabled');

  {
    const context = await newAuthedContext();
    await stubAiConfig(context, { enabled: true, modes: modesPayload() });
    const page = watch(await signIn(context));

    await aiNav(page).waitFor({ state: 'visible', timeout: 15000 });
    check(true, 'the AI Recruitment group appears in the sidebar');

    const group = aiNav(page);
    for (const label of ['AI Assistant', 'Screening Agent', 'Ranking Agent', 'Comparison Agent', 'Insights Agent']) {
      check((await group.getByText(label, { exact: true }).count()) > 0, `the group lists ${label}`);
    }

    // The existing destinations must be untouched by the addition. Scoped to the
    // sidebar as a whole rather than to Main navigation alone: Settings sits in
    // the Management group, so pinning it to one group would test the grouping
    // rather than the thing that matters here, which is that adding the AI
    // section removed no existing destination.
    const sidebarNav = page.locator('nav[aria-label="Main navigation"], nav[aria-label="Management"]');
    for (const label of ['Dashboard', 'Jobs', 'Candidates', 'Settings']) {
      check((await sidebarNav.getByText(label, { exact: true }).count()) > 0, `existing nav still lists ${label}`);
    }

    /* ------------------------------------------------- collapsible group -- */
    const toggle = page.locator('button[aria-controls="ai-recruitment-group"]');
    check((await toggle.count()) === 1, 'the AI group has a single collapse control');
    check((await toggle.getAttribute('aria-expanded')) === 'true', 'the group starts expanded');

    await toggle.click();
    await page.waitForTimeout(300);
    check((await toggle.getAttribute('aria-expanded')) === 'false', 'clicking collapses the group');
    check((await page.locator('#ai-recruitment-group').count()) === 0, 'collapsed hides the agent list');

    await toggle.click();
    await page.waitForTimeout(300);
    check((await page.locator('#ai-recruitment-group').count()) === 1, 'clicking again restores the list');

    /* ---------------------------------------------------- route + active -- */
    section('Routes and active highlighting');

    const ROUTES = [
      ['/ai', 'AI Assistant'],
      ['/ai/screening', 'Screening Agent'],
      ['/ai/ranking', 'Ranking Agent'],
      ['/ai/comparison', 'Comparison Agent'],
      ['/ai/insights', 'Insights Agent']
    ];

    for (const [route, title] of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 });

      const heading = await page.locator('h1').first().innerText();
      check(heading.trim() === title, `${route} renders ${title}`, heading);

      const current = page.locator(`nav[aria-label="AI Recruitment"] a[aria-current="page"]`);
      check((await current.count()) === 1, `${route} highlights exactly one sidebar item`);
      check((await current.innerText()).includes(title), `${route} highlights ${title}`);

      // Every page carries exactly one AI acknowledgement, not one per element.
      const badges = await page.getByText('AI', { exact: true }).count();
      check(badges === 1, `${route} shows a single AI badge`, String(badges));
    }

    /* --------------------------------------------------- agent selector --- */
    section('Agent selector');

    await page.goto(`${BASE}/ai/ranking`, { waitUntil: 'networkidle' });
    const selector = page.locator('button[aria-haspopup="menu"][aria-label*="Current agent"]');
    await selector.waitFor({ state: 'visible', timeout: 15000 });

    check((await selector.getAttribute('aria-label')).includes('Ranking Agent'), 'the selector names the current agent');
    check((await selector.getAttribute('aria-expanded')) === 'false', 'the menu starts closed');

    await selector.click();
    const menu = page.locator('div[role="menu"][aria-label="Choose an agent"]');
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    check((await selector.getAttribute('aria-expanded')) === 'true', 'opening sets aria-expanded');
    check((await menu.locator('[role="menuitem"]').count()) === 5, 'the menu offers all five agents');

    // Keyboard: focus lands inside the menu, arrows move, Escape returns focus.
    const focusedInMenu = await page.evaluate(
      () => !!document.activeElement?.closest('div[role="menu"]')
    );
    check(focusedInMenu, 'opening the menu moves focus into it');

    await page.keyboard.press('ArrowDown');
    const movedByKeyboard = await page.evaluate(
      () => !!document.activeElement?.closest('div[role="menu"]')
    );
    check(movedByKeyboard, 'ArrowDown keeps focus inside the menu');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check((await menu.count()) === 0, 'Escape closes the menu');
    const focusReturned = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-haspopup') === 'menu'
    );
    check(focusReturned, 'Escape returns focus to the trigger');

    // Selecting navigates.
    await selector.click();
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    await menu.locator('[role="menuitem"]', { hasText: 'Comparison Agent' }).click();
    await page.waitForURL('**/ai/comparison', { timeout: 15000 });
    check(new URL(page.url()).pathname === '/ai/comparison', 'choosing an agent navigates to its route', page.url());

    /* --------------------------------------------- assistant action cards -- */
    section('AI Assistant action cards');

    await page.goto(`${BASE}/ai`, { waitUntil: 'networkidle' });
    const assistantText = await bodyText(page);
    check(/What would you like to do/i.test(assistantText), 'the assistant asks what the recruiter wants to do');

    for (const label of [
      'Find strong candidates',
      'Screen a candidate',
      'Rank candidates',
      'Compare candidates',
      'Analyse recruitment performance'
    ]) {
      check(assistantText.includes(label), `the assistant offers "${label}"`);
    }

    await page.getByRole('button', { name: /Screen a candidate/i }).click();
    await page.waitForURL('**/ai/screening', { timeout: 15000 });
    check(new URL(page.url()).pathname === '/ai/screening', '"Screen a candidate" opens the screening agent');

    await page.goto(`${BASE}/ai`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Rank candidates/i }).click();
    await page.waitForURL('**/ai/ranking', { timeout: 15000 });
    check(new URL(page.url()).pathname === '/ai/ranking', '"Rank candidates" opens the ranking agent');

    /* ------------------------------------------------- screening shell ---- */
    section('Screening shell and validation');

    await page.goto(`${BASE}/ai/screening`, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor({ state: 'visible' });

    const jobSelect = page.locator('select').first();
    check((await jobSelect.count()) === 1, 'a job selector is present');
    check((await page.locator('label:has-text("Job")').count()) > 0, 'the job selector has a label');
    check((await page.locator('label:has-text("Candidate")').count()) > 0, 'the candidate selector has a label');

    const analyse = page.getByRole('button', { name: /Analyse candidate/i });
    check(await analyse.isDisabled(), 'Analyse is disabled until a job and candidate are chosen');
    check(/Select a job and a candidate/i.test(await bodyText(page)), 'the reason it is disabled is stated');
    check(/No screening yet/i.test(await bodyText(page)), 'a guiding empty state is shown, not "no data"');

    /* --------------------------------------------------- ranking shell ---- */
    section('Ranking shell');

    await page.goto(`${BASE}/ai/ranking`, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor({ state: 'visible' });
    const rankingText = await bodyText(page);

    check(/Candidate scope/i.test(rankingText), 'the scope control is present');
    check(/All candidates/i.test(rankingText), 'the "all candidates" scope is offered');
    check(/Shortlisted candidates/i.test(rankingText), 'the "shortlisted" scope is offered');
    check((await page.locator('input[name="ranking-scope"]').count()) === 2, 'scope is a two-option radio group');
    check(await page.getByRole('button', { name: /Rank candidates/i }).isDisabled(), 'Rank is disabled without a job');
    check(/No ranking yet/i.test(rankingText), 'a guiding empty state is shown');

    /* ------------------------------------------------ comparison shell ---- */
    section('Comparison shell and the 2â€“5 constraint');

    await page.goto(`${BASE}/ai/comparison`, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor({ state: 'visible' });
    const comparisonText = await bodyText(page);

    check(/choose 2[–\-]5/i.test(comparisonText), 'the 2–5 bound is stated up front');
    check(/0 of 5 selected/i.test(comparisonText), 'the running count is shown');
    check(
      await page.getByRole('button', { name: /Compare candidates/i }).isDisabled(),
      'Compare is disabled below the minimum'
    );
    check(/No comparison yet/i.test(comparisonText), 'a guiding empty state is shown');

    /* --------------------------------------------------- insights shell --- */
    section('Insights shell');

    await page.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor({ state: 'visible' });
    await page.waitForTimeout(1200);
    const insightsText = await bodyText(page);

    check(/Where things stand/i.test(insightsText), 'the live metrics section renders');
    check(/Same figures as your dashboard/i.test(insightsText), 'the metrics are attributed to the dashboard');
    check(/Which jobs need attention/i.test(insightsText), 'suggested questions are listed');
    check(!/\bNaN\b|\bundefined\b/.test(insightsText), 'no NaN or undefined leaks into the metrics');

    /* ------------------------------------------- mock provider connectivity */
    section('Frontend â†’ /api/ai/run â†’ MockAIProvider');

    const runResult = await page.evaluate(async () => {
      // Same origin as the app, so the session cookie travels exactly as it does
      // for every other request the page makes.
      const response = await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: 'screening', message: 'Connectivity check from the browser.' })
      });
      return { status: response.status, body: await response.json() };
    });

    if (runResult.status === 200) {
      check(runResult.body.success === true, 'the browser reached the orchestrator');
      check(Boolean(runResult.body.data?.content), 'a mock response came back');
      check(
        runResult.body.data?.provider === 'mock' || !runResult.body.data?.provider,
        'the answering provider is the mock, never a paid one',
        JSON.stringify(runResult.body.data)
      );
    } else {
      // AI_ENABLED=false on the server is a legitimate configuration; the route
      // must still answer in a controlled way rather than failing.
      check(
        runResult.body?.code === 'AI_DISABLED' || runResult.body?.code === 'AI_MODE_DISABLED',
        `the AI route answered in a controlled way (${runResult.body?.code})`,
        JSON.stringify(runResult.body)
      );
    }

    await context.close();
  }

  /* ------------------------------------------ individual flag: ranking off - */
  section('An individually disabled agent');

  {
    const context = await newAuthedContext();
    await stubAiConfig(context, { enabled: true, modes: modesPayload({ ranking: false }) });
    const page = watch(await signIn(context));

    await aiNav(page).waitFor({ state: 'visible', timeout: 15000 });

    const rankingLink = aiNav(page).locator('a[href="/ai/ranking"]');
    check((await rankingLink.count()) === 0, 'a disabled agent is not a link');
    check(
      (await aiNav(page).locator('[aria-disabled="true"]:has-text("Ranking Agent")').count()) === 1,
      'a disabled agent is shown as unavailable rather than hidden'
    );
    check(/Soon/i.test(await aiNav(page).innerText()), 'the disabled agent is marked "Soon"');

    // Still linked: the others must be unaffected.
    check((await aiNav(page).locator('a[href="/ai/screening"]').count()) === 1, 'enabled agents remain navigable');

    // Reaching the route directly must be handled, not blank.
    await page.goto(`${BASE}/ai/ranking`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const text = await bodyText(page);
    check(/not available yet/i.test(text), 'entering a disabled route shows a stated reason');
    check(/Return to AI Assistant/i.test(text), 'a way back is offered');
    check(pageErrors.length === 0, 'a disabled route does not crash the app', pageErrors.join('; '));

    await context.close();
  }

  /* ----------------------------------------------------- AI switched off -- */
  section('AI_ENABLED=false â€” the application is unchanged');

  {
    const context = await newAuthedContext();
    await stubAiConfig(context, { enabled: false, modes: modesPayload({ assistant: false, screening: false, ranking: false, comparison: false, insights: false }) });
    const page = watch(await signIn(context));

    await page.waitForTimeout(900);
    check((await aiNav(page).count()) === 0, 'the entire AI group is hidden');

    const shell = await bodyText(page);
    check(!/Screening Agent|Ranking Agent|Comparison Agent/i.test(shell), 'no agent is mentioned anywhere in the shell');

    // The recruitment application must be exactly as it was. Sidebar-wide for the
    // same reason as above — Settings lives in the Management group.
    const sidebarNav = page.locator('nav[aria-label="Main navigation"], nav[aria-label="Management"]');
    for (const label of ['Dashboard', 'Jobs', 'Candidates', 'Settings']) {
      check((await sidebarNav.getByText(label, { exact: true }).count()) > 0, `${label} still present with AI off`);
    }

    for (const route of ['/', '/jobs', '/candidates', '/jobs/closed', '/settings']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      check(!/page not found/i.test(await bodyText(page)), `${route} still works with AI off`);
    }

    // Entering an AI route directly must degrade gracefully.
    await page.goto(`${BASE}/ai/ranking`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    check(/not enabled/i.test(await bodyText(page)), 'an AI route explains that the section is off');
    check(pageErrors.length === 0, 'no crash with AI disabled', pageErrors.join('; '));

    await context.close();
  }

  /* ----------------------------------------- the live endpoint is coherent - */
  section('The live /api/ai/config endpoint');

  {
    // Deliberately unstubbed: this is the one section that talks to the real
    // endpoint, confirming the live response matches the shape the UI is built
    // against.
    const context = await newAuthedContext();
    const page = watch(await signIn(context));

    const live = await page.evaluate(async () => {
      const response = await fetch('/api/ai/config', { credentials: 'include' });
      return { status: response.status, body: await response.json() };
    });

    check(live.status === 200, 'the real endpoint answers a signed-in recruiter', String(live.status));
    check(typeof live.body?.data?.enabled === 'boolean', 'it reports a boolean master switch');
    check(
      Object.keys(live.body?.data || {}).sort().join(',') === 'enabled,modes',
      'it carries booleans only â€” no provider or limits',
      JSON.stringify(live.body?.data)
    );

    await context.close();
  }

  /* ------------------------------------------------------------ mobile ---- */
  section('Mobile and tablet');

  for (const [width, height] of [
    [1024, 900],
    [768, 900],
    [430, 900],
    [390, 844],
    [375, 812]
  ]) {
    const context = await newAuthedContext({ viewport: { width, height } });
    await stubAiConfig(context, { enabled: true, modes: modesPayload() });
    const page = watch(await signIn(context));

    for (const route of ['/ai', '/ai/screening', '/ai/ranking', '/ai/comparison', '/ai/insights']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      check(!overflows, `${width}px â€” ${route} has no horizontal page overflow`);
    }

    // Below lg the rail is a drawer; the AI group must travel into it.
    //
    // Visibility, not DOM presence: the desktop rail is `hidden lg:flex`, so it
    // stays in the document at every width and only stops being rendered.
    if (width < 1024) {
      await page.goto(`${BASE}/ai`, { waitUntil: 'networkidle' });
      const menuBtn = page.locator('button[aria-label="Open navigation menu"]').first();
      await menuBtn.waitFor({ state: 'visible', timeout: 15000 });
      check(!(await aiNav(page).first().isVisible()), `${width}px — the desktop rail is not shown`);

      await menuBtn.click();
      await page.waitForTimeout(500);

      const visibleAiNavs = await countVisible(aiNav(page));
      check(visibleAiNavs === 1, `${width}px â€” the AI group appears in the mobile drawer`, String(visibleAiNavs));

      const drawerLink = page
        .locator('aside[role="dialog"] nav[aria-label="AI Recruitment"] a[href="/ai/insights"]')
        .first();
      check(await drawerLink.isVisible(), `${width}px â€” agents are reachable from the drawer`);
    }

    await context.close();
  }

  /* ----------------------------------------------------- accessibility ---- */
  section('Accessibility');

  {
    const context = await newAuthedContext();
    await stubAiConfig(context, { enabled: true, modes: modesPayload() });
    const page = watch(await signIn(context));

    await page.goto(`${BASE}/ai/screening`, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor({ state: 'visible' });

    // Every form control must have an accessible name.
    const unlabelled = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll('select, input, textarea'));
      return controls
        .filter((el) => {
          if (el.getAttribute('aria-label')) return false;
          if (el.getAttribute('aria-labelledby')) return false;
          if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
          return !el.closest('label');
        })
        .map((el) => el.tagName + (el.id ? `#${el.id}` : ''));
    });
    check(unlabelled.length === 0, 'every field on the screening page has a label', unlabelled.join(', '));

    // Headings: exactly one h1 per agent page.
    for (const route of ['/ai', '/ai/screening', '/ai/ranking', '/ai/comparison', '/ai/insights']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.locator('h1').first().waitFor({ state: 'visible' });
      check((await page.locator('h1').count()) === 1, `${route} has exactly one h1`);
    }

    // The nav landmarks must be distinguishable.
    await page.goto(`${BASE}/ai`, { waitUntil: 'networkidle' });
    check((await page.locator('nav[aria-label="Main navigation"]').count()) === 1, 'the main nav is labelled');
    check((await aiNav(page).count()) === 1, 'the AI nav is separately labelled');

    // Keyboard reachability of the selector.
    const trigger = page.locator('button[aria-haspopup="menu"][aria-label*="Current agent"]');
    await trigger.focus();
    const focusVisible = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none' || el.matches(':focus-visible');
    });
    check(focusVisible, 'the agent selector shows a focus indicator');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    check(
      (await page.locator('div[role="menu"][aria-label="Choose an agent"]').count()) === 1,
      'Enter opens the agent menu from the keyboard'
    );

    await context.close();
  }

  /* ----------------------------------------------------- runtime health --- */
  section('Runtime health');

  // The anonymous section deliberately visits protected routes while signed out,
  // and the browser logs each 401 from the session probe as a console error. That
  // is the redirect working, not a fault.
  const ignorable = (message) =>
    /favicon|Download the React DevTools|ResizeObserver loop/i.test(message) ||
    /Failed to load resource.*401/i.test(message);
  const realConsoleErrors = consoleErrors.filter((m) => !ignorable(m));

  check(pageErrors.length === 0, 'no uncaught exceptions across the run', pageErrors.slice(0, 3).join('; '));
  check(realConsoleErrors.length === 0, 'no console errors across the run', realConsoleErrors.slice(0, 3).join('; '));
} catch (error) {
  failed++;
  console.error('\n  SUITE ERROR:', error.message);
  console.error(error.stack);
} finally {
  await browser.close();
}

console.log('\n----------------------------------------------------------------');
console.log(`  AI Recruitment shell E2E: ${passed} passed, ${failed} failed`);
console.log('----------------------------------------------------------------\n');

process.exit(failed > 0 ? 1 : 0);
