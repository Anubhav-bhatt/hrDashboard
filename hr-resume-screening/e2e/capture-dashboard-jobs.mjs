/**
 * Visual capture for the Dashboard/Jobs redesign, both modes, desktop and mobile.
 *
 * Stubbed at the network boundary like the other capture scripts, so the four
 * surfaces render the same deterministic fixture every time and nothing reaches
 * the database.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5199';
const OUT = process.env.OUT_DIR || 'artifacts/dashboard-jobs-phase1p2';
const CHANNEL = process.env.E2E_BROWSER || 'msedge';

mkdirSync(OUT, { recursive: true });

const job = (id, title, over = {}) => ({
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
  requiredSkills: ['React', 'TypeScript', 'Node.js'],
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over
});

const JOBS = [
  job(1, 'Senior Platform Engineer', { candidateCount: 48, analyzedCount: 48, shortlistedCount: 2, selectedCount: 1, bestMatchScore: 94 }),
  job(2, 'Product Designer', { candidateCount: 62, analyzedCount: 62, shortlistedCount: 4, bestMatchScore: 91 }),
  job(3, 'Data Analyst', { candidateCount: 37, analyzedCount: 37, strongMatchCount: 6, bestMatchScore: 88 }),
  job(4, 'Engineering Manager, Payments', { candidateCount: 0 }),
  job(5, 'QA Automation Engineer', { candidateCount: 21, analyzedCount: 0 }),
  job(6, 'Technical Writer', { candidateCount: 14, analyzedCount: 14, bestMatchScore: 58 })
];

const OVERVIEW = {
  success: true,
  data: {
    scope: { jobId: null, jobTitle: null, requiredSkills: [] },
    strongMatchThreshold: 80,
    metrics: {
      totalCandidates: 182, totalJobs: 6, shortlisted: 6, needsReview: 12, inReview: 9,
      notSuitable: 4, pendingReview: 21, analyzed: 170, unanalyzed: 12, strongMatch: 6,
      highMatch: 6, candidatesThisMonth: 40, candidatesThisWeek: 8, jobsThisMonth: 2,
      averageScore: 71.4, topScore: 94, bestMatchScore: 94, openJobs: 6, closedJobs: 1,
      selectedCandidates: 2
    },
    pipeline: [], scoreBands: [], trend: [], topCandidates: [], recentHires: [],
    recentActivity: [], statusBreakdown: []
  }
};

const browser = await chromium.launch({ ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }) });

const shoot = async ({ name, route, mode, width }) => {
  const context = await browser.newContext({
    viewport: { width, height: width < 500 ? 900 : 1100 },
    deviceScaleFactor: 2
  });
  await context.addInitScript(
    ([m]) => {
      window.localStorage.setItem('hr-dashboard-workspace-mode', m);
      window.localStorage.setItem('hr-dashboard-theme', 'light');
    },
    [mode]
  );
  const page = await context.newPage();

  await page.route('**/api/**', (r) => r.fulfill({ json: { success: true, data: [], meta: {} } }));
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { success: true, data: { user: { id: 'u1', name: 'Ankit Gupta', email: 'r@example.com', role: 'ADMIN' } } } })
  );
  await page.route('**/api/ai/config*', (r) =>
    r.fulfill({ json: { success: true, data: { enabled: true, modes: { assistant: true, screening: true, ranking: true, comparison: true, insights: true } } } })
  );
  await page.route('**/api/dashboard/overview*', (r) => r.fulfill({ json: OVERVIEW }));
  await page.route('**/api/jobs/summary*', (r) =>
    r.fulfill({
      json: {
        success: true,
        data: JOBS,
        meta: {
          total: JOBS.length,
          pagination: { page: 1, limit: 12, total: JOBS.length, totalPages: 1 },
          statusCounts: { all: 7, open: JOBS.length, closed: 1 },
          strongMatchThreshold: 80
        }
      }
    })
  );

  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  wrote ${name}.png`);
  await context.close();
};

try {
  await shoot({ name: '1-standard-dashboard-1440', route: '/dashboard', mode: 'normal', width: 1440 });
  await shoot({ name: '2-minimal-home-1440', route: '/dashboard', mode: 'minimal', width: 1440 });
  await shoot({ name: '3-standard-jobs-1440', route: '/jobs', mode: 'normal', width: 1440 });
  await shoot({ name: '4-minimal-jobs-1440', route: '/jobs', mode: 'minimal', width: 1440 });
  await shoot({ name: '5-standard-dashboard-390', route: '/dashboard', mode: 'normal', width: 390 });
  await shoot({ name: '6-minimal-home-390', route: '/dashboard', mode: 'minimal', width: 390 });
  await shoot({ name: '7-standard-jobs-390', route: '/jobs', mode: 'normal', width: 390 });
  await shoot({ name: '8-minimal-jobs-390', route: '/jobs', mode: 'minimal', width: 390 });
} finally {
  await browser.close();
}
console.log(`\nCaptures in ${OUT}`);
