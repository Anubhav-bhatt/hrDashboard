/** Before/after capture of the Jobs work index. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { JOBS, stub } from './diagnose-jobs-table.mjs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5199';
const OUT = process.env.OUT_DIR || 'artifacts/jobs-table-after';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'msedge' });

const shoot = async ({ name, width, dark = false }) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
  await context.addInitScript(([t]) => window.localStorage.setItem('hr-dashboard-theme', t), [dark ? 'dark' : 'light']);
  const page = await context.newPage();
  await stub(page, JOBS);
  await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
  await page.locator('article').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(350);
  const card = page.locator('.card').filter({ has: page.locator('article') }).first();
  await card.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name.padEnd(24)} captured`);
  await context.close();
};

try {
  await shoot({ name: 'jobs-1440-light', width: 1440 });
  await shoot({ name: 'jobs-1440-dark', width: 1440, dark: true });
  await shoot({ name: 'jobs-1024', width: 1024 });
  await shoot({ name: 'jobs-768', width: 768 });
  await shoot({ name: 'jobs-390', width: 390 });
} finally {
  await browser.close();
}
