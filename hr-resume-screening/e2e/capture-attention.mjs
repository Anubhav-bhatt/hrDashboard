/**
 * Visual capture for the dashboard's "Needs your attention" section.
 *
 * The API is stubbed at the network boundary rather than logged into, so the
 * queue can be rendered with a job set that exercises every indicator and every
 * empty/single/full state deterministically — and so this writes nothing to the
 * database.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const OUT = process.env.OUT_DIR || 'artifacts/attention-after';
const CHANNEL = process.env.E2E_BROWSER || 'msedge';

mkdirSync(OUT, { recursive: true });

const job = (id, title, over) => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  title,
  status: 'OPEN',
  department: 'Engineering',
  location: 'Bengaluru',
  candidateCount: 0,
  analyzedCount: 0,
  strongMatchCount: 0,
  shortlistedCount: 0,
  selectedCount: 0,
  bestMatchScore: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over
});

/* One job per branch of deriveNextAction, ordered so the visible three after the
   dashboard's skip=1 cover all three indicator meanings. */
const FULL = [
  job(1, 'Senior Platform Engineer', { candidateCount: 48, analyzedCount: 48, selectedCount: 1, bestMatchScore: 94 }),
  job(2, 'Product Designer', { candidateCount: 62, analyzedCount: 62, shortlistedCount: 4, bestMatchScore: 91 }),
  job(3, 'Data Analyst', { candidateCount: 37, analyzedCount: 37, strongMatchCount: 6, bestMatchScore: 88 }),
  job(4, 'Engineering Manager, Payments', { candidateCount: 0 }),
  job(5, 'QA Automation Engineer', { candidateCount: 21, analyzedCount: 21, bestMatchScore: 64 }),
  job(6, 'Technical Writer', { candidateCount: 14, analyzedCount: 14, bestMatchScore: 58 })
];

const SINGLE = [FULL[0], FULL[1]];
const LONG = [
  FULL[0],
  job(7, 'Senior Staff Software Engineer, Platform Infrastructure and Site Reliability', { candidateCount: 55, analyzedCount: 55, shortlistedCount: 3, bestMatchScore: 93 }),
  FULL[2],
  FULL[3]
];
const NONE = [job(9, 'Closed Role', { status: 'CLOSED', candidateCount: 10, analyzedCount: 10 })];

const OVERVIEW = {
  success: true,
  data: {
    scope: { jobId: null },
    strongMatchThreshold: 80,
    metrics: { totalJobs: 6, totalCandidates: 182, shortlisted: 4, strongMatches: 6 },
    statusBreakdown: [],
    scoreBands: [],
    recentActivity: []
  }
};

const browser = await chromium.launch({ channel: CHANNEL });

const shoot = async ({ name, width, dark, jobs }) => {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    deviceScaleFactor: 2
  });
  await context.addInitScript(
    ([theme]) => window.localStorage.setItem('hr-dashboard-theme', theme),
    [dark ? 'dark' : 'light']
  );

  const page = await context.newPage();

  /*
   * Anything not named below still has to answer 200: the client treats a 401
   * on any request as the session ending and redirects to sign-in, which would
   * take the dashboard away before it rendered.
   */
  await page.route('**/api/**', (r) => r.fulfill({ json: { success: true, data: [], meta: {} } }));

  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { success: true, data: { user: { id: 'u1', name: 'Ankit Gupta', email: 'r@example.com', role: 'HR' } } } })
  );
  await page.route('**/api/dashboard/overview*', (r) => r.fulfill({ json: OVERVIEW }));
  await page.route('**/api/jobs/summary*', (r) =>
    r.fulfill({
      json: {
        success: true,
        data: jobs,
        meta: {
          total: jobs.length,
          pagination: { page: 1, limit: 100, total: jobs.length, totalPages: 1 },
          statusCounts: { all: jobs.length, open: jobs.length, closed: 0 },
          strongMatchThreshold: 80
        }
      }
    })
  );

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  const section = page.locator('section[aria-labelledby="dashboard-attention-heading"]');
  await section.waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);

  await section.screenshot({ path: `${OUT}/${name}.png` });

  const box = await section.boundingBox();
  const rows = await section.locator('li').all();
  const heights = [];
  for (const row of rows) {
    const b = await row.boundingBox();
    if (b) heights.push(Math.round(b.height));
  }
  console.log(`${name.padEnd(26)} section=${Math.round(box.height)}px rows=[${heights.join(', ')}]`);

  await context.close();
};

try {
  await shoot({ name: 'attention-1440-light', width: 1440, dark: false, jobs: FULL });
  await shoot({ name: 'attention-1440-dark', width: 1440, dark: true, jobs: FULL });
  await shoot({ name: 'attention-1024', width: 1024, dark: false, jobs: FULL });
  await shoot({ name: 'attention-768', width: 768, dark: false, jobs: FULL });
  await shoot({ name: 'attention-430', width: 430, dark: false, jobs: FULL });
  await shoot({ name: 'attention-390-light', width: 390, dark: false, jobs: FULL });
  await shoot({ name: 'attention-390-dark', width: 390, dark: true, jobs: FULL });
  await shoot({ name: 'attention-longtitle-1440', width: 1440, dark: false, jobs: LONG });
  await shoot({ name: 'attention-longtitle-390', width: 390, dark: false, jobs: LONG });
  await shoot({ name: 'attention-single-1440', width: 1440, dark: false, jobs: SINGLE });
  await shoot({ name: 'attention-empty-1440', width: 1440, dark: false, jobs: NONE });
  await shoot({ name: 'attention-empty-dark', width: 1440, dark: true, jobs: NONE });
} finally {
  await browser.close();
}
