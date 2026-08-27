/**
 * Candidate card / table view switcher.
 *
 * Walks the exact journey the feature has to survive: switch layout, narrow the
 * result set, select two people to compare, switch back, shortlist from the
 * table, switch back again. The point of every assertion is the same — changing
 * how the list is drawn must not change what is in it, what is selected, or what
 * has been written.
 *
 * Environment: E2E_BASE_URL, E2E_API_URL, E2E_EMAIL, E2E_PASSWORD, E2E_BROWSER
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API = process.env.E2E_API_URL || 'http://localhost:5000';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CHANNEL = process.env.E2E_BROWSER || 'msedge';

if (!EMAIL || !PASSWORD) {
  console.error('E2E_EMAIL and E2E_PASSWORD must be set to a recruiter account.');
  process.exit(1);
}

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

const cardsToggle = () => page.getByRole('radio', { name: 'Card view' });
const tableToggle = () => page.getByRole('radio', { name: 'Table view' });
const table = () => page.locator('table');

let shortlistRestore = null;

try {
  await login();

  await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' });
  await page.locator('.candidate-card, table').first().waitFor({ state: 'visible', timeout: 20000 });

  /* -------------------------------------------------- the switcher exists -- */

  check(await cardsToggle().isVisible(), 'card view control is visible on /candidates');
  check(await tableToggle().isVisible(), 'table view control is visible on /candidates');

  const group = page.getByRole('radiogroup', { name: 'Candidate layout' });
  check((await group.count()) === 1, 'the switcher is a single labelled radio group');

  // Start from a known layout rather than whatever the last run left stored.
  await cardsToggle().click();
  await page.locator('.candidate-card').first().waitFor({ state: 'visible' });
  check(await cardsToggle().getAttribute('aria-checked') === 'true', 'card view reports its state to assistive technology');
  check((await table().count()) === 0, 'card view does not also mount the table');

  /* ------------------------------------------------------- switch to table -- */

  await tableToggle().click();
  await table().first().waitFor({ state: 'visible' });
  check(await tableToggle().getAttribute('aria-checked') === 'true', 'table view reports its state');
  check((await page.locator('.candidate-card').count()) === 0, 'table view does not also mount the cards');
  check((await page.locator('table caption').count()) === 1, 'the table is semantic and captioned');
  check((await page.locator('table thead th').count()) >= 5, 'the table exposes column headers');

  const rowHeight = await page.locator('table tbody tr').first().evaluate((row) => row.getBoundingClientRect().height);
  check(rowHeight >= 68 && rowHeight <= 84, 'rows are comfortable rather than spreadsheet-tight', `${Math.round(rowHeight)}px`);

  /* ------------------------------- filtering applies to the table as well -- */

  const beforeSearch = await page.locator('table tbody tr').count();
  await page.fill('#candidate-search', 'a');
  await page.waitForTimeout(900);
  check(await table().first().isVisible(), 'searching keeps the recruiter in table view');
  const afterSearch = await page.locator('table tbody tr').count();
  check(afterSearch > 0 || beforeSearch === 0, 'the table renders the filtered result set', `${beforeSearch} -> ${afterSearch}`);

  await page.fill('#candidate-search', '');
  await page.waitForTimeout(900);

  /* ---------------------------------- selection survives a layout change --- */

  const checkboxes = page.locator('table tbody input[type=checkbox]:not([disabled])');
  const selectable = await checkboxes.count();

  if (selectable >= 2) {
    const firstName = await page.locator('table tbody tr').nth(0).locator('th button').innerText();
    const secondName = await page.locator('table tbody tr').nth(1).locator('th button').innerText();

    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    const bar = page.locator('.candidate-selection-bar');
    await bar.waitFor({ state: 'visible', timeout: 5000 });
    check(/2 candidates selected/.test(await bar.innerText()), 'selecting in the table drives the existing comparison bar');

    await cardsToggle().click();
    await page.locator('.candidate-card').first().waitFor({ state: 'visible' });
    const barAfterCards = await page.locator('.candidate-selection-bar').innerText();
    check(/2 candidates selected/.test(barAfterCards), 'the selection survives table -> cards');
    check(
      barAfterCards.includes(firstName.trim()) && barAfterCards.includes(secondName.trim()),
      'the same two candidates are still selected, not merely the same count'
    );

    await tableToggle().click();
    await table().first().waitFor({ state: 'visible' });
    const stillChecked = await page.locator('table tbody input[type=checkbox]:checked').count();
    check(stillChecked === 2, 'the selection survives cards -> table', `${stillChecked} checked`);

    await page.getByRole('button', { name: 'Clear' }).click();
  } else {
    console.log('  SKIP  selection round-trip needs two selectable candidates in one job');
  }

  /* ------------------------------------ a shortlist written from the table -- */

  const rows = page.locator('table tbody tr');
  const rowCount = await rows.count();
  let target = null;

  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    if (!/Shortlisted|Selected/.test(await row.innerText())) {
      target = row;
      break;
    }
  }

  if (target) {
    const name = (await target.locator('th button').innerText()).trim();
    const payload = await (await page.request.get(`${API}/api/candidates?search=${encodeURIComponent(name)}&limit=1`)).json();
    const record = payload.data?.[0];

    if (record) {
      shortlistRestore = { candidate: record, status: record.hrStatus };

      await target.getByRole('button', { name: /^More actions for / }).click();
      const responsePromise = page.waitForResponse(
        (response) => /\/status$/.test(response.url()) && response.request().method() === 'PATCH'
      );
      await page.getByRole('button', { name: 'Shortlist candidate' }).click();
      const response = await responsePromise;
      check(response.ok(), 'the table shortlist uses the existing status endpoint');

      await page.getByRole('button', { name: /^Close/ }).first().click().catch(() => {});
      await page.waitForTimeout(400);

      const rowText = await target.innerText();
      check(/Shortlisted/.test(rowText), 'the table row reflects the new status without a reload');

      await cardsToggle().click();
      await page.locator('.candidate-card').first().waitFor({ state: 'visible' });
      const cardText = await page.locator('.candidate-card', { hasText: name }).first().innerText();
      check(/Shortlisted/.test(cardText), 'the shortlist written in the table is visible in card view');

      const restore = await page.request.patch(
        `${API}/api/jobs/${record.jobId}/candidates/${record._id}/status`,
        { data: { status: shortlistRestore.status } }
      );
      check(restore.ok(), 'the shortlist test restores the original candidate status');
      shortlistRestore = null;
    } else {
      console.log('  SKIP  could not resolve the target candidate through the API');
    }
  } else {
    console.log('  SKIP  every visible candidate is already shortlisted or selected');
  }

  /* -------------------------------------------- responsive: no overflow --- */

  await tableToggle().click();
  await table().first().waitFor({ state: 'visible' }).catch(() => {});

  for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
    await page.waitForTimeout(150);

    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      tableVisible: Boolean(document.querySelector('table')?.getBoundingClientRect().height),
      listVisible: Boolean(document.querySelector('ul.md\\:hidden li'))
    }));

    check(!layout.overflow, `no horizontal page overflow at ${width}px`);
    if (width < 768) {
      check(layout.listVisible, `table view becomes a compact list at ${width}px`);
    } else {
      check(layout.tableVisible, `table view renders columns at ${width}px`);
    }
  }
} catch (error) {
  failed += 1;
  console.error(`  FAIL  unexpected test error :: ${error?.stack || error}`);
} finally {
  if (shortlistRestore) {
    await page.request
      .patch(`${API}/api/jobs/${shortlistRestore.candidate.jobId}/candidates/${shortlistRestore.candidate._id}/status`, {
        data: { status: shortlistRestore.status }
      })
      .catch(() => {});
  }
  await browser.close();
}

console.log(`\nCandidate view switcher checks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
