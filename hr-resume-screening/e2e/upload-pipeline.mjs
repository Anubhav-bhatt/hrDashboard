/**
 * Upload/import regression coverage.
 *
 * Required environment:
 *   DATABASE_URL, E2E_EMAIL, E2E_PASSWORD
 * Optional:
 *   E2E_BASE_URL (http://localhost:5173)
 *   E2E_API_URL  (http://localhost:5001/api)
 */
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const requireFromBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = requireFromBackend('@prisma/client');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API = process.env.E2E_API_URL || 'http://localhost:5001/api';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

if (!process.env.DATABASE_URL || !EMAIL || !PASSWORD) {
  console.error('DATABASE_URL, E2E_EMAIL and E2E_PASSWORD must be set.');
  process.exit(1);
}

const prisma = new PrismaClient();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
let fixtureJobId = null;

page.on('pageerror', (error) => pageErrors.push(error.message));

const check = (condition, message, detail = '') => {
  if (!condition) {
    console.error(`FAIL  ${message}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS  ${message}`);
  }
};

try {
  await prisma.outlookConnection.deleteMany({});
  await prisma.outlookConnection.create({
    data: {
      microsoftUserId: 'upload-pipeline-e2e-mock',
      email: 'upload-pipeline@example.invalid',
      displayName: 'Upload Pipeline Fixture',
      accessToken: 'MOCK_ACCESS_TOKEN_UPLOAD_PIPELINE_E2E'
    }
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 }),
    page.getByRole('button', { name: /sign in/i }).click()
  ]);

  const created = await page.evaluate(async (api) => {
    const form = new FormData();
    form.append('title', `Upload Pipeline Outlook ${Date.now()}`);
    form.append(
      'jdFile',
      new File(
        ['Senior React Developer\nRequired skills: React, Node.js, PostgreSQL.\nMinimum 3 years experience.'],
        'outlook-regression-jd.txt',
        { type: 'text/plain' }
      )
    );
    const response = await fetch(`${api}/jobs`, {
      method: 'POST',
      credentials: 'include',
      body: form
    });
    return { status: response.status, body: await response.json() };
  }, API);

  fixtureJobId = created.body?.data?.id || null;
  check(created.status === 201 && Boolean(fixtureJobId), 'synthetic job is created for connected Outlook regression');

  await page.goto(`${BASE}/jobs/${fixtureJobId}/import`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /import from outlook/i }).click();

  const connectedHeading = page.getByRole('heading', { name: /outlook account connected/i });
  const connectedVisible = await connectedHeading.isVisible().catch(() => false);
  check(connectedVisible, 'Outlook-connected Add Candidates renders', (await page.locator('body').innerText()).slice(-500));
  check(pageErrors.length === 0, 'connected rendering raises no uncaught page error', pageErrors.join(' | '));

  if (connectedVisible) {
    await page.getByRole('button', { name: /disconnect account/i }).click();
    await page.getByRole('heading', { name: /outlook account not connected/i }).waitFor({ timeout: 10_000 });
    check((await prisma.outlookConnection.count()) === 0, 'Disconnect removes the Outlook connection');
  }
} finally {
  if (fixtureJobId) {
    await prisma.job.delete({ where: { id: fixtureJobId } }).catch(() => {});
  }
  await prisma.outlookConnection.deleteMany({}).catch(() => {});
  await browser.close();
  await prisma.$disconnect();
}

if (process.exitCode) process.exit(process.exitCode);
