import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API = process.env.E2E_API_URL || 'http://localhost:5000';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CHANNEL = process.env.E2E_BROWSER || 'msedge';
const ARTIFACT_DIR = process.env.E2E_ARTIFACT_DIR || join(process.cwd(), 'artifacts', 'candidate-cards');

if (!EMAIL || !PASSWORD) {
  console.error('E2E_EMAIL and E2E_PASSWORD must be set.');
  process.exit(1);
}

await mkdir(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({
  ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }),
  headless: process.env.E2E_HEADED !== '1'
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

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

const login = async () => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
};

const getJson = async (url) => {
  const response = await page.request.get(url);
  if (!response.ok()) throw new Error(`${response.status()} ${url}`);
  return response.json();
};

let shortlistRestore = null;

try {
  await login();

  // Keep API reads on the page origin so the browser's authenticated session
  // cookie is included. Calling the backend origin directly creates a separate
  // Playwright request context and incorrectly reports a 401.
  /*
   * An OPEN job, explicitly.
   *
   * This suite shortlists a candidate, and shortlisting is active recruitment
   * work: a closed job's statuses are its hiring history and the API refuses to
   * change them. The listing endpoint has no server-side lifecycle default, so
   * omitting the filter returned open and closed roles interleaved and the suite
   * picked whichever happened to sort first — which became a closed one, and the
   * shortlist step then hung waiting for a request the UI correctly never sent.
   */
  const jobsPayload = await getJson(`${BASE}/api/jobs/summary?sort=newest&limit=100&status=OPEN`);
  const job = (jobsPayload.data || []).find((item) => item.candidateCount >= 2);
  if (!job) throw new Error('The test needs an OPEN job with at least two candidates.');
  if (job.status === 'CLOSED') throw new Error('Refusing to run card mutations against a closed job.');

  await page.goto(`${BASE}/jobs/${job.id}/candidates`, { waitUntil: 'domcontentloaded' });
  await page.locator('.candidate-card').first().waitFor({ state: 'visible', timeout: 20000 });

  const wrapper = page.locator('.candidate-card-wrapper').first();
  const card = wrapper.locator('.candidate-card');
  const bodyButton = card.getByRole('button', { name: /^Quick look at / });
  check((await bodyButton.count()) === 1, 'candidate body is a named semantic button');
  check(/match|not scored/i.test(await card.innerText()), 'card exposes the authoritative match score label');
  check((await card.locator('.chip').count()) <= 3, 'card limits the visible skill preview to three skills');

  const typography = await card.evaluate((element) => {
    const name = element.querySelector('h3');
    const role = name?.nextElementSibling;
    const score = element.querySelector('.candidate-match-score p');
    const skill = element.querySelector('.chip');
    return {
      bodyFamily: getComputedStyle(document.body).fontFamily,
      nameWeight: name ? getComputedStyle(name).fontWeight : null,
      roleWeight: role ? getComputedStyle(role).fontWeight : null,
      scoreWeight: score ? getComputedStyle(score).fontWeight : null,
      skillWeight: skill ? getComputedStyle(skill).fontWeight : null
    };
  });
  check(typography.bodyFamily.startsWith('Quicksand'), 'Quicksand is the global product font', typography.bodyFamily);
  check(typography.nameWeight === '700' && typography.scoreWeight === '700', 'candidate name and match score use Quicksand Bold');
  check(typography.roleWeight === '400' && (!typography.skillWeight || typography.skillWeight === '400'), 'role and skills use Quicksand Regular');

  await wrapper.hover();
  const dock = wrapper.locator('.candidate-action-dock');
  await page.waitForTimeout(250);

  /*
   * Approved candidate-action contract.
   *
   * This supersedes an earlier design that asserted four floating circular
   * buttons, one tint per button, sitting 10px+ beneath the card. Two
   * alternatives were rendered against the real tokens and rejected before
   * this one was chosen: separate bordered circles turned the active-compare
   * state into the loudest object on the card, and a detached floating cluster
   * cut across the card's own bottom edge while adding ~26px of height to every
   * grid row. The approved treatment is a low-profile strip inside the footer —
   * no per-icon surface, no extra height, and colour reserved for state.
   *
   * Quick Look is deliberately NOT a focusable control in the strip. The card
   * body is already a full-size button carrying that exact accessible name, and
   * two buttons sharing one name means a screen reader announces the candidate
   * twice with no way to tell them apart. The eye icon remains as a pointer
   * affordance, hidden from the accessibility tree.
   */
  const dockIcons = dock.locator('.candidate-action-button');
  check((await dockIcons.count()) === 4, 'fine-pointer users see all four candidate actions', String(await dockIcons.count()));
  check(await dock.locator('.candidate-action-view').isVisible(), 'Quick Look action is visible on the card');
  check(await dock.locator('.candidate-action-screen').isVisible(), 'Screen action is visible on the card');
  check(await dock.locator('.candidate-action-compare').isVisible(), 'Compare action is visible on the card');
  check(await dock.locator('.candidate-action-shortlist').isVisible(), 'Shortlist action is visible on the card');

  check(
    (await card.getByRole('button', { name: /^Quick look at /i }).count()) === 1,
    'card exposes exactly one accessible Quick Look control'
  );
  check(
    (await dock.getByRole('button').count()) === 3,
    'Screen, Compare and Shortlist remain keyboard-accessible',
    String(await dock.getByRole('button').count())
  );

  const dockVisual = await dock.evaluate((element) => {
    const style = getComputedStyle(element);
    const buttons = Array.from(element.querySelectorAll('button'));
    const surface = getComputedStyle(element.closest('.candidate-card')).backgroundColor;
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const luminance = (colour) => {
      const [r, g, b] = colour.match(/\d+/g).map(Number).map(channel);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
      const [x, y] = [luminance(a), luminance(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    return {
      background: style.backgroundColor,
      border: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      shadow: style.boxShadow,
      buttonSizes: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return [Math.round(rect.width), Math.round(rect.height)];
      }),
      iconContrast: buttons.map((button) => Number(contrast(getComputedStyle(button).color, surface).toFixed(2)))
    };
  });
  check(dockVisual.background === 'rgba(0, 0, 0, 0)', 'action strip has no surface of its own', dockVisual.background);
  check(dockVisual.border.every((width) => width === '0px') && dockVisual.shadow === 'none', 'action strip has no border or shadow');
  check(
    dockVisual.buttonSizes.every(([width, height]) => width >= 28 && height >= 28),
    'action controls meet the minimum pointer target',
    JSON.stringify(dockVisual.buttonSizes)
  );
  // Icon-only controls carry a 3:1 non-text contrast requirement.
  check(
    dockVisual.iconContrast.every((ratio) => ratio >= 3),
    'action icons meet the 3:1 non-text contrast floor',
    JSON.stringify(dockVisual.iconContrast)
  );

  // The strip lives inside the card, so it costs the grid row no extra height.
  const [cardBox, dockBox] = await Promise.all([card.boundingBox(), dock.boundingBox()]);
  check(
    Boolean(cardBox && dockBox) &&
      dockBox.y >= cardBox.y &&
      dockBox.y + dockBox.height <= cardBox.y + cardBox.height + 1,
    'action strip sits inside the candidate card'
  );

  // Compare must read its own selected state, not just fire an action.
  const compareAction = dock.locator('.candidate-action-compare');
  check((await compareAction.getAttribute('aria-pressed')) === 'false', 'Compare starts in an unselected state');
  await compareAction.click();
  await page.waitForTimeout(400);
  check((await compareAction.getAttribute('aria-pressed')) === 'true', 'Compare reports the selected state');
  check(((await compareAction.getAttribute('class')) || '').includes('is-active'), 'Compare shows an active treatment when selected');
  await compareAction.click();
  await page.waitForTimeout(300);
  check((await compareAction.getAttribute('aria-pressed')) === 'false', 'Compare clears its selected state');

  // Shortlist's own state treatment is asserted inside the existing shortlist
  // round-trip further down, where a candidate is actually shortlisted and then
  // restored — so this contract needs no pre-existing shortlisted data.

  await bodyButton.focus();
  await page.waitForTimeout(250);
  check(Number(await dock.getByRole('button').first().evaluate((element) => getComputedStyle(element).opacity)) > 0.95, 'keyboard focus reveals the action dock');
  await bodyButton.press('Enter');
  const quickLook = page.getByRole('dialog', { name: /candidate quick look/i });
  await quickLook.waitFor({ state: 'visible' });
  check(true, 'Enter opens Quick Look');
  const firstQuickLookName = await quickLook.locator('h3').innerText();
  await page.keyboard.press('ArrowDown');
  const nextQuickLookName = await quickLook.locator('h3').innerText();
  check(nextQuickLookName !== firstQuickLookName, 'Arrow Down advances to the next visible candidate');
  await page.keyboard.press('ArrowUp');
  check((await quickLook.locator('h3').innerText()) === firstQuickLookName, 'Arrow Up returns to the previous candidate');
  await page.screenshot({ path: join(ARTIFACT_DIR, 'quick-look-1440.png') });
  await page.keyboard.press('Escape');
  await quickLook.waitFor({ state: 'hidden' });
  check(await bodyButton.evaluate((element) => document.activeElement === element), 'Escape closes Quick Look and restores focus');

  const cards = page.locator('.candidate-card-wrapper');
  const firstCard = cards.nth(0);
  const secondCard = cards.nth(1);
  await firstCard.scrollIntoViewIfNeeded();
  await firstCard.hover();
  await page.waitForTimeout(250);
  await firstCard.getByRole('button', { name: /^Compare / }).click();
  await secondCard.scrollIntoViewIfNeeded();
  await secondCard.hover();
  await page.waitForTimeout(250);
  await secondCard.getByRole('button', { name: /^Compare / }).click();
  const selectionBar = page.getByRole('region', { name: 'Candidate comparison selection' });
  await selectionBar.waitFor({ state: 'visible' });
  check(/2 candidates selected/.test(await selectionBar.innerText()), 'multiple candidates appear in the selection bar');
  check(await selectionBar.getByRole('button', { name: /Compare candidates/ }).isEnabled(), 'comparison handoff enables for two candidates');
  await selectionBar.getByRole('button', { name: 'Clear' }).click();
  check((await selectionBar.count()) === 0, 'Clear removes the comparison selection');

  const candidatePayload = await getJson(`${BASE}/api/jobs/${job.id}/candidates?sort=score_desc&limit=100`);
  const shortlistCandidate = (candidatePayload.data || []).find(
    (candidate) => candidate.hrStatus !== 'SHORTLISTED' && candidate.hrStatus !== 'SELECTED'
  );

  if (shortlistCandidate) {
  const targetButton = page.getByRole('button', { name: `Quick look at ${shortlistCandidate.name}`, exact: true }).first();
    if (await targetButton.count()) {
      shortlistRestore = { candidate: shortlistCandidate, status: shortlistCandidate.hrStatus };
      const targetCard = targetButton.locator('xpath=ancestor::div[contains(@class,"candidate-card-wrapper")]');
      await targetCard.hover();
      const responsePromise = page.waitForResponse(
        (response) => response.request().method() === 'PATCH' && response.url().includes(`/candidates/${shortlistCandidate._id}/status`)
      );
      await targetCard.getByRole('button', { name: /^Shortlist / }).click();
      const response = await responsePromise;
      check(response.ok(), 'shortlist uses the existing backend status endpoint');
      await targetCard.getByText('Shortlisted', { exact: true }).waitFor({ state: 'visible' });
      check(true, 'successful shortlist updates the card after the response');

      // The action strip must report the new state, not just the status badge.
      const shortlistAction = targetCard.locator('.candidate-action-shortlist');
      check(
        ((await shortlistAction.getAttribute('class')) || '').includes('is-active'),
        'Shortlist action reflects the shortlisted state'
      );
      check(await shortlistAction.isDisabled(), 'Shortlist action is inert once the candidate is shortlisted');
      check(
        /shortlisted/i.test((await shortlistAction.getAttribute('data-tooltip')) || ''),
        'Shortlist tooltip states the current state',
        await shortlistAction.getAttribute('data-tooltip')
      );

      const restore = await page.request.patch(
        `${BASE}/api/jobs/${job.id}/candidates/${shortlistCandidate._id}/status`,
        { data: { status: shortlistCandidate.hrStatus } }
      );
      check(restore.ok(), 'shortlist test restores the original candidate status');
      shortlistRestore = null;
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('.candidate-card').first().waitFor({ state: 'visible' });
    }
  }

  const widths = [360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
    await page.waitForTimeout(120);
    await page.evaluate(() => window.scrollTo(0, 0));
    const layout = await page.evaluate(() => {
      const grid = document.querySelector('.candidate-card-wrapper')?.parentElement;
      return {
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    const expected = width >= 1280 ? 3 : width >= 768 ? 2 : 1;
    check(layout.columns === expected, `${width}px uses ${expected} candidate grid column${expected === 1 ? '' : 's'}`, String(layout.columns));
    check(!layout.overflow, `${width}px has no horizontal page overflow`);
    await page.screenshot({ path: join(ARTIFACT_DIR, `candidates-${width}.png`), fullPage: true });
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: join(ARTIFACT_DIR, `candidates-${width}-viewport.png`) });
    }
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await mobileContext.addCookies(await context.cookies());
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE}/jobs/${job.id}/candidates`, { waitUntil: 'domcontentloaded' });
  await mobilePage.locator('.candidate-card').first().waitFor({ state: 'visible', timeout: 20000 });
  const mobileCard = mobilePage.locator('.candidate-card').first();
  const mobileTrigger = mobileCard.getByRole('button', { name: /^Actions for / });
  check(await mobileTrigger.isVisible(), 'touch layout exposes a visible quick-actions trigger');
  await mobileTrigger.click();
  const mobileSheet = mobilePage.getByRole('dialog');
  await mobileSheet.waitFor({ state: 'visible' });
  const mobileQuickLookCount = await mobileSheet.getByRole('button', { name: /Quick look/i }).count();
  check(mobileQuickLookCount === 1, 'mobile sheet reuses the candidate actions', String(mobileQuickLookCount));
  await mobilePage.keyboard.press('Escape');
  await mobilePage.screenshot({ path: join(ARTIFACT_DIR, 'candidates-touch-390.png'), fullPage: true });
  await mobileContext.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.localStorage.setItem('hr-dashboard-theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.candidate-card').first().waitFor({ state: 'visible' });
  check(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'candidate cards use the existing dark theme');
  await page.screenshot({ path: join(ARTIFACT_DIR, 'candidates-dark-390.png'), fullPage: true });
} catch (error) {
  failed += 1;
  console.error(`  FAIL  unexpected test error :: ${error?.stack || error}`);
} finally {
  if (shortlistRestore) {
    await page.request.patch(
      `${BASE}/api/jobs/${shortlistRestore.candidate.jobId}/candidates/${shortlistRestore.candidate._id}/status`,
      { data: { status: shortlistRestore.status } }
    ).catch(() => {});
  }
  await browser.close();
}

console.log(`\nCandidate card checks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
