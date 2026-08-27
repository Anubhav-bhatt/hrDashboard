import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CHANNEL = process.env.E2E_BROWSER || 'msedge';

if (!EMAIL || !PASSWORD) throw new Error('E2E_EMAIL and E2E_PASSWORD are required.');

const browser = await chromium.launch({
  ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }),
  headless: process.env.E2E_HEADED !== '1'
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

let passed = 0;
let failed = 0;
const check = (ok, label, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
};

try {
  await page.goto(`${BASE}/login`);
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

  const jobs = Array.from({ length: 100 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    title: `Scale Test Role ${String(index + 1).padStart(3, '0')}`,
    status: 'OPEN',
    candidateCount: 100,
    strongMatchCount: index % 9,
    shortlistedCount: index % 4,
    needsReviewCount: index % 7,
    pendingReviewCount: index % 11,
    bestMatchScore: 90 - (index % 10),
    requirements: {},
    requiredSkills: ['React', 'TypeScript'],
    createdAt: new Date(2026, 0, 1 + (index % 28)).toISOString()
  }));

  await page.route('**/api/jobs/summary**', async (route) => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get('limit')) || jobs.length;
    const currentPage = Number(url.searchParams.get('page')) || 1;
    const start = (currentPage - 1) * limit;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: jobs.slice(start, start + limit),
        meta: {
          strongMatchThreshold: 80,
          statusCounts: { all: 100, open: 100, closed: 0 },
          pagination: {
            page: currentPage,
            limit,
            total: 100,
            totalPages: Math.ceil(100 / limit)
          }
        }
      })
    });
  });

  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { name: 'Focus', exact: true }).waitFor();
  const attentionItems = await page.locator('#dashboard-attention-heading + p, #dashboard-attention-heading').count();
  const attentionCards = await page.locator('section[aria-labelledby="dashboard-attention-heading"] li').count();
  check(attentionItems > 0, 'Focus explains the priority queue');
  check(attentionCards <= 3, '100 jobs still render at most three secondary attention items', String(attentionCards));
  check((await page.locator('body').evaluate((body) => body.scrollWidth <= body.clientWidth)), '100-job Focus has no horizontal overflow');

  await page.goto(`${BASE}/jobs`);
  await page.locator('#job-search').waitFor();
  const jobRows = await page.locator('article').count();
  check(jobRows <= 12, 'Jobs renders only the server page, not all 100 roles', String(jobRows));
  check((await page.getByText('100 jobs found', { exact: false }).count()) > 0, 'Jobs reports the authoritative 100-job total');

  await page.unroute('**/api/jobs/summary**');
  let candidateRequestIntercepted = false;
  await page.route('**/api/candidates?*', async (route) => {
    candidateRequestIntercepted = true;
    const response = await route.fetch();
    const payload = await response.json();
    if (payload?.pagination) {
      payload.pagination.total = 10000;
      payload.pagination.totalPages = Math.ceil(10000 / payload.pagination.limit);
    }
    await route.fulfill({ response, json: payload });
  });

  await page.goto(`${BASE}/candidates`);
  await page.getByRole('heading', { name: 'Candidate results' }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const candidateBody = await page.locator('body').innerText();
  check(candidateRequestIntercepted, 'the 10,000-candidate presentation fixture was applied');
  check(/10,000/.test(candidateBody), 'Candidate review reports the authoritative 10,000 total');
  const renderedCandidates = await page.locator('.candidate-card-wrapper, tbody tr').count();
  check(renderedCandidates <= 20, '10,000 candidates still render only the current page', String(renderedCandidates));
  check((await page.locator('body').evaluate((body) => body.scrollWidth <= body.clientWidth)), '10,000-candidate review has no horizontal overflow');
} finally {
  await browser.close();
}

console.log(`\nFocus scale checks: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
