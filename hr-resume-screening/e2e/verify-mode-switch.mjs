import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API = process.env.E2E_API_URL || 'http://localhost:5000';
const EMAIL = process.env.E2E_EMAIL || 'anubhav.bhatt@exicom.in';
const PASSWORD = process.env.E2E_PASSWORD || 'Anubhav@Hr2026!';
const CHANNEL = process.env.E2E_BROWSER || 'msedge';

const browser = await chromium.launch({
  ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }),
  headless: true
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
};

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(err.message));

const login = async () => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const emailInput = page.locator('#email');
  if (await emailInput.isVisible()) {
    await emailInput.fill(EMAIL);
    await page.fill('#password', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
    await page.waitForTimeout(800);
  }
};

const enterButton = () => page.getByRole('button', { name: 'Minimal mode' });
const exitButton = () => page.getByRole('button', { name: 'Exit minimal mode' });

try {
  await login();
  consoleErrors.length = 0;
  console.log('\n=== STEP 24: MODE SWITCH CONTEXT & ROUTE PRESERVATION ===\n');

  /* 1. Dashboard: Standard -> Minimal -> Standard */
  console.log('--- Scenario 1: Dashboard Standard -> Minimal -> Standard ---');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  check(page.url().includes('/dashboard') || page.url() === `${BASE}/`, 'starts on dashboard route');

  // Toggle to Minimal Mode
  await enterButton().click();

  await page.waitForURL((url) => url.pathname === '/focus', { timeout: 10000 });
  await page.waitForTimeout(500);
  check(await page.getByRole('button', { name: 'Exit minimal mode' }).isVisible(), 'minimal mode active on dashboard transition');

  // Toggle back to Standard Mode
  await exitButton().click();
  await page.waitForTimeout(800);
  check(page.url().includes('/dashboard') || page.url() === `${BASE}/`, 'route preserved upon returning to dashboard', page.url());
  check(await enterButton().isVisible(), 'standard mode restored');

  /* 2. Job: Standard -> Minimal -> Standard */
  console.log('\n--- Scenario 2: Job Workspace Standard -> Minimal -> Standard ---');
  const jobsRes = await page.evaluate(async () => {
    const res = await fetch('/api/jobs');
    return res.json();
  });
  const sampleJob = (jobsRes.data?.jobs || jobsRes.data || jobsRes.jobs || [])[0];

  if (sampleJob) {
    const jobUrl = `${BASE}/jobs/${sampleJob.id}`;
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    check(page.url().includes(`/jobs/${sampleJob.id}`), 'starts on job details route');

    // Switch to Minimal
    await enterButton().click();
    await page.waitForURL((url) => url.pathname === '/focus', { timeout: 10000 });
    await page.waitForTimeout(500);

    /*
     * Verify the focused job context matches sampleJob.
     *
     * Read from the workspace heading, which is where the role is now named —
     * the best-fits section below it carries its own label ("Best fits" /
     * "Closest candidates") rather than repeating the title.
     */
    const currentFocusedJobHeading = await page.locator('h1').first().innerText().catch(() => '');
    check(currentFocusedJobHeading.includes(sampleJob.title), 'currentJobId context preserved in Minimal workspace', currentFocusedJobHeading);

    // Switch back to Standard
    await exitButton().click();
    await page.waitForTimeout(800);
    check(page.url().includes(`/jobs/${sampleJob.id}`), 'route preserved upon returning to job workspace', page.url());
    check((await page.locator('h1').innerText()).includes(sampleJob.title), 'job content intact without crash');
  } else {
    console.log('  SKIP  No open job found for job switch test');
  }


  /* 3. Candidates: Standard -> Minimal -> Standard */
  console.log('\n--- Scenario 3: Candidates Standard -> Minimal -> Standard ---');
  const candidatesUrl = `${BASE}/candidates?sort=score_desc`;
  await page.goto(candidatesUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  check(page.url().includes('/candidates'), 'starts on candidates route');

  // Switch to Minimal
  await enterButton().click();
  await page.waitForURL((url) => url.pathname === '/focus', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Switch back to Standard
  await exitButton().click();
  await page.waitForTimeout(800);
  check(page.url().includes('/candidates'), 'route preserved upon returning to candidates', page.url());
  check(page.url().includes('sort=score_desc'), 'query parameters preserved across mode cycle', page.url());

  /* 4. AI: Standard -> Minimal -> Standard */
  console.log('\n--- Scenario 4: AI Assistant Standard -> Minimal -> Standard ---');
  await page.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  check(page.url().includes('/ai'), 'starts on AI route');

  // Switch to Minimal
  await enterButton().click();
  await page.waitForURL((url) => url.pathname === '/focus', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Switch back to Standard
  await exitButton().click();
  await page.waitForTimeout(800);
  check(page.url().includes('/ai'), 'route preserved upon returning to AI route', page.url());
  check(await page.locator('h1').innerText() === 'AI Assistant', 'AI Assistant intact without crash');

  /* 5. Mode Persistence Across Reload */
  console.log('\n--- Scenario 5: Mode Persistence Across Reload ---');
  await page.goto(`${BASE}/focus`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const storedMode = await page.evaluate(() => localStorage.getItem('hr-dashboard-workspace-mode'));
  check(storedMode === 'minimal', 'localStorage persists minimal mode');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const storedModeAfterReload = await page.evaluate(() => localStorage.getItem('hr-dashboard-workspace-mode'));
  check(storedModeAfterReload === 'minimal', 'mode persists across page reload');

  /* 6. Console Error Check */
  console.log('\n--- Scenario 6: Runtime Health & Zero Errors ---');
  check(consoleErrors.length === 0, 'zero uncaught exceptions and console errors during mode switches', consoleErrors.join('; '));

} catch (err) {
  failed++;
  console.error(`  FAIL  Unexpected exception: ${err.message}`);
} finally {
  await browser.close();
}

console.log(`\n==================================================`);
console.log(`Step 24 Mode Switch Verification: ${passed} passed, ${failed} failed`);
console.log(`==================================================\n`);
if (failed > 0) process.exit(1);
