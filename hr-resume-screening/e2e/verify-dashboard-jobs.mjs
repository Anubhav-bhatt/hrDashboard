/**
 * Dashboard, Jobs and their Minimal Mode counterparts.
 *
 * Behaviour and hierarchy, not pixels: what leads each page, how many decisions
 * the first layer asks for, that the two modes are genuinely different
 * compositions, and that nothing a recruiter needs became unreachable.
 *
 * The API is stubbed at the network boundary rather than signed into, so every
 * lifecycle branch, empty state and overflow case is deterministic and nothing
 * is written to the database. Fixture pollution cannot make this suite lie.
 *
 * Environment: E2E_BASE_URL, E2E_BROWSER
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const CHANNEL = process.env.E2E_BROWSER || 'msedge';

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
  requiredSkills: ['React', 'TypeScript', 'Node.js', 'GraphQL'],
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over
});

/* One role per deriveNextAction branch, plus a closed one that must never leak. */
const OPEN_JOBS = [
  job(1, 'Senior Platform Engineer', { candidateCount: 48, analyzedCount: 48, shortlistedCount: 2, selectedCount: 1, bestMatchScore: 94 }),
  job(2, 'Product Designer', { candidateCount: 62, analyzedCount: 62, shortlistedCount: 4, bestMatchScore: 91 }),
  job(3, 'Data Analyst', { candidateCount: 37, analyzedCount: 37, strongMatchCount: 6, bestMatchScore: 88 }),
  job(4, 'Engineering Manager, Payments', { candidateCount: 0 }),
  job(5, 'QA Automation Engineer', { candidateCount: 21, analyzedCount: 0 }),
  job(6, 'Technical Writer', { candidateCount: 14, analyzedCount: 14, bestMatchScore: 58 })
];

const CLOSED_JOB = job(99, 'ARCHIVED Compliance Auditor', {
  status: 'CLOSED',
  candidateCount: 10,
  analyzedCount: 10,
  selectedCount: 1,
  closedAt: '2026-08-20T00:00:00.000Z',
  selectedCandidate: { name: 'Rahul Sharma', currentRole: 'Auditor', overallScore: 90 }
});

const OVERVIEW = {
  success: true,
  data: {
    scope: { jobId: null, jobTitle: null, requiredSkills: [] },
    strongMatchThreshold: 80,
    metrics: {
      totalCandidates: 182,
      totalJobs: 7,
      shortlisted: 6,
      needsReview: 12,
      inReview: 9,
      notSuitable: 4,
      pendingReview: 21,
      analyzed: 170,
      unanalyzed: 12,
      strongMatch: 6,
      highMatch: 6,
      candidatesThisMonth: 40,
      candidatesThisWeek: 8,
      jobsThisMonth: 2,
      averageScore: 71.4,
      topScore: 94,
      bestMatchScore: 94,
      openJobs: 6,
      closedJobs: 1,
      selectedCandidates: 2
    },
    pipeline: [],
    scoreBands: [],
    trend: [],
    topCandidates: [],
    recentHires: [],
    recentActivity: [],
    statusBreakdown: []
  }
};

const browser = await chromium.launch({
  ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }),
  headless: true
});

const consoleErrors = [];
const pageErrors = [];

/*
 * The error-state section stubs 500s on purpose, and the browser logs every one
 * of them. Those are the scenario working, not the page misbehaving — so
 * collection is suspended for exactly that block rather than adding /500/ to the
 * ignore list, which would hide a real server error anywhere else in the run.
 */
let expectingFailures = false;
const ignorable = (m) =>
  /favicon|Download the React DevTools|ResizeObserver loop|WebSocket|ERR_NETWORK_IO_SUSPENDED/i.test(m) ||
  /Failed to load resource.*401/i.test(m);

/**
 * A signed-in page in a chosen workspace mode, with the API answering fixtures.
 *
 * @param {Object} opts
 * @param {'normal'|'minimal'} opts.mode
 * @param {Array} opts.jobs        what /api/jobs/summary returns
 * @param {Object|null} opts.overview  what /api/dashboard/overview returns
 * @param {boolean} opts.failJobs  answer the jobs listing with a 500
 */
/*
 * The closed role is present in the fixture on purpose.
 *
 * The stub filters by the `status` parameter, so if a surface ever stopped
 * asking for OPEN roles the archived title would appear on it and the isolation
 * assertions below would fail. Leaving it out would make those assertions pass
 * for the trivial reason that no closed role existed at all.
 */
const ALL_JOBS = [...OPEN_JOBS, CLOSED_JOB];

const open = async ({ mode = 'normal', jobs = ALL_JOBS, overview = OVERVIEW, failJobs = false, width = 1440 } = {}) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  await context.addInitScript(
    ([m]) => {
      window.localStorage.setItem('hr-dashboard-workspace-mode', m);
      window.localStorage.setItem('hr-dashboard-theme', 'light');
    },
    [mode]
  );

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !expectingFailures) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (e) => {
    if (!expectingFailures) pageErrors.push(e.message);
  });

  // Anything unnamed must still answer 200: the client treats a 401 anywhere as
  // the session ending and redirects to sign-in.
  await page.route('**/api/**', (r) => r.fulfill({ json: { success: true, data: [], meta: {} } }));
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { success: true, data: { user: { id: 'u1', name: 'Ankit Gupta', email: 'r@example.com', role: 'ADMIN' } } } })
  );
  await page.route('**/api/ai/config*', (r) =>
    r.fulfill({ json: { success: true, data: { enabled: true, modes: { assistant: true, screening: true, ranking: true, comparison: true, insights: true } } } })
  );
  await page.route('**/api/dashboard/overview*', (r) =>
    overview ? r.fulfill({ json: overview }) : r.fulfill({ status: 500, json: { success: false, message: 'boom' } })
  );
  await page.route('**/api/jobs/summary*', (r) => {
    if (failJobs) return r.fulfill({ status: 500, json: { success: false, message: 'boom' } });
    const url = new URL(r.request().url());
    const status = url.searchParams.get('status');
    const visible = status === 'CLOSED' ? jobs.filter((j) => j.status === 'CLOSED') : status === 'OPEN' ? jobs.filter((j) => j.status === 'OPEN') : jobs;
    return r.fulfill({
      json: {
        success: true,
        data: visible,
        meta: {
          total: visible.length,
          pagination: { page: 1, limit: 12, total: visible.length, totalPages: 1 },
          statusCounts: {
            all: jobs.length,
            open: jobs.filter((j) => j.status === 'OPEN').length,
            closed: jobs.filter((j) => j.status === 'CLOSED').length
          },
          strongMatchThreshold: 80
        }
      }
    });
  });

  return { context, page };
};

const body = (page) => page.locator('body').innerText();

try {
  /* ============================================== STANDARD DASHBOARD ====== */
  section('Standard Dashboard');
  {
    const { context, page } = await open({ mode: 'normal' });
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.locator('button[aria-controls="dashboard-analytics"]').waitFor({ timeout: 20000 });

    const h1 = await page.locator('h1').first().innerText();
    check(h1.trim() === 'Dashboard', 'the page is headed "Dashboard"', h1);
    check((await page.locator('h1').count()) === 1, 'exactly one h1');

    check(
      (await page.locator('a[href="/jobs/new"]').count()) >= 1,
      'Create job is the page-level primary action'
    );

    /* First layer stays four figures — the reduction this redesign protects. */
    const snapshot = page.locator('section[aria-labelledby="dashboard-snapshot-heading"]');
    const snapText = await snapshot.innerText();
    for (const label of ['Open jobs', 'Active candidates', 'Strong matches', 'Shortlisted']) {
      check(snapText.includes(label), `first layer states ${label}`);
    }
    /*
     * Four figures, and only four.
     * This is the reduction the redesign protects: the deeper metrics —
     * awaiting review, hires, closed jobs, averages — stay behind the Analytics
     * disclosure rather than competing for the first screen.
     */
    check(
      !snapText.includes('Awaiting review') && !snapText.includes('Hires'),
      'the trailing metrics stay in Analytics'
    );

    /* Attention leads the decision, and stays bounded. */
    const attention = page.locator('section[aria-labelledby="dashboard-attention-heading"]');
    check((await attention.count()) === 1, 'the attention queue is present');
    const rows = await attention.locator('li').count();
    check(rows > 0 && rows <= 3, 'the queue is bounded to three roles', String(rows));

    /* Attention must come before Analytics in the document. */
    const order = await page.evaluate(() => {
      const a = document.querySelector('section[aria-labelledby="dashboard-attention-heading"]');
      const an = document.querySelector('button[aria-controls="dashboard-analytics"]');
      if (!a || !an) return null;
      return a.compareDocumentPosition(an) & Node.DOCUMENT_POSITION_FOLLOWING ? 'attention-first' : 'analytics-first';
    });
    check(order === 'attention-first', 'attention is answered before analytics', String(order));

    check(await page.locator('#dashboard-analytics').isHidden(), 'analytics stays collapsed by default');

    /* Closed roles must not appear in active work. */
    const text = await body(page);
    check(!/ARCHIVED Compliance Auditor/i.test(text), 'no closed role leaks onto the dashboard');

    /* Every queue row names an action in words. */
    const actionLinks = await attention.locator('a').count();
    check(actionLinks >= rows, 'every queue row offers a next step', `${actionLinks} links / ${rows} rows`);

    await context.close();
  }

  /* ================================================== MINIMAL HOME ======== */
  section('Minimal Home');
  {
    const { context, page } = await open({ mode: 'minimal' });
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.locator('h1').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(700);

    const h1 = await page.locator('h1').first().innerText();
    check(h1.trim() === 'Home', 'minimal home is headed "Home"', h1);
    check((await page.locator('h1').count()) === 1, 'exactly one h1');

    /* Work before analytics: none of Standard's dashboard furniture is here. */
    check(
      (await page.locator('section[aria-labelledby="dashboard-snapshot-heading"]').count()) === 0,
      'no KPI grid'
    );
    check(
      (await page.locator('button[aria-controls="dashboard-analytics"]').count()) === 0,
      'no analytics disclosure'
    );
    check(
      (await page.locator('section[aria-labelledby="dashboard-attention-heading"]').count()) === 0,
      'not the Standard attention section either — a different composition'
    );

    /* One dominant action. */
    const hero = page.locator('section[aria-label="Recommended Next Action"]');
    check((await hero.count()) === 1, 'a single recommended next step leads the page');
    const heroPrimaries = await hero.locator('a.btn-primary, button.btn-primary').count();
    check(heroPrimaries === 1, 'the recommendation has exactly one dominant CTA', String(heroPrimaries));

    /* The queue, and its position relative to the summary line. */
    const queue = page.locator('#minimal-home-queue-heading');
    const hasQueue = (await queue.count()) === 1;
    check(hasQueue, 'the work queue is present');
    if (hasQueue) {
      const items = await page.locator('#minimal-home-queue-heading ~ ul > li').count();
      check(items > 0 && items <= 4, 'the queue shows a handful of roles, not all of them', String(items));
    }

    const heroFirst = await page.evaluate(() => {
      const hero = document.querySelector('section[aria-label="Recommended Next Action"]');
      const q = document.querySelector('#minimal-home-queue-heading');
      if (!hero || !q) return null;
      return hero.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    check(Boolean(heroFirst), 'the dominant action comes before the rest of the queue');

    /* Recruiter language only. */
    const text = await body(page);
    check(
      !/Screening Agent|Ranking Agent|Comparison Agent|Insights Agent/i.test(text),
      'no specialist-agent terminology'
    );
    check(!/ARCHIVED Compliance Auditor/i.test(text), 'no closed role leaks into minimal home');

    /* Nothing unreachable. */
    check((await page.locator('a[href="/jobs"]').count()) >= 1, 'all active jobs remain one link away');
    check((await page.locator('a[href="/ai/insights"]').count()) >= 1, 'hiring insights remain reachable');
    check((await page.locator('a[href="/jobs/new"]').count()) >= 1, 'Create job remains available');

    /* Compact metrics, not tiles. */
    check(/\d+ active jobs? · \d+ awaiting review/.test(text), 'metrics are one compact line');

    await context.close();
  }

  /* ================================================= STANDARD JOBS ======== */
  section('Standard Jobs');
  {
    const { context, page } = await open({ mode: 'normal' });
    await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
    await page.locator('#job-search').waitFor({ timeout: 20000 });

    check(true, 'search is present and identifiable');
    check(
      (await page.locator('[aria-label="Filter jobs by status"] button').count()) === 2,
      'the lifecycle filter offers Active and Closed'
    );
    check((await page.locator('select[aria-label="Sort jobs"]').count()) === 1, 'sort is present');

    const articles = await page.locator('article').count();
    check(articles === OPEN_JOBS.length, 'every active role is listed as a row', String(articles));
    check((await page.locator('[data-jobs-header]').count()) === 1, 'the table keeps its column header');

    /* The certified two-links-per-row contract. */
    const linkCounts = await page.evaluate(() =>
      [...document.querySelectorAll('article')].map((a) => a.querySelectorAll('a').length)
    );
    check(linkCounts.every((n) => n === 2), 'each row keeps exactly two links', linkCounts.join(','));

    const text = await body(page);
    check(!/ARCHIVED Compliance Auditor/i.test(text), 'closed roles are excluded from active jobs');
    check(/6 jobs found/.test(text), 'the result count is stated');

    /* Skill chips must not be in the listing's first layer. */
    check(!/GraphQL/.test(text), 'no skill chips in the listing');

    await context.close();
  }

  /* ================================================== MINIMAL JOBS ======== */
  section('Minimal Active Jobs');
  {
    const { context, page } = await open({ mode: 'minimal' });
    await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
    await page.locator('#job-search').waitFor({ timeout: 20000 });
    await page.waitForTimeout(500);

    check((await page.locator('article').count()) === 0, 'the dense table is not used');
    check((await page.locator('[data-jobs-header]').count()) === 0, 'no column header');
    check(
      (await page.locator('[aria-label="Filter jobs by status"]').count()) === 0,
      'no status tabs — the rail already lists Active and Closed'
    );
    check((await page.locator('#job-search').count()) === 1, 'search survives into minimal mode');

    const items = page.locator('main ul > li');
    const count = await items.count();
    check(count === OPEN_JOBS.length, 'every active role is still listed', String(count));

    /* Two links per item: the title in, and one named next step. */
    const perItem = await page.evaluate(() =>
      [...document.querySelectorAll('main ul > li')].map((li) => li.querySelectorAll('a').length)
    );
    check(perItem.every((n) => n >= 1 && n <= 2), 'each role offers a way in and one next step', perItem.join(','));

    const text = await body(page);
    check(!/GraphQL/.test(text), 'no skill chips');
    check(!/ARCHIVED Compliance Auditor/i.test(text), 'closed roles excluded');
    /* Precise labels, not a generic "Continue". */
    check(/Add candidates|Review candidates|Review shortlist|Score candidates|Close job/i.test(text),
      'next steps are named precisely');
    check(/No candidates yet/i.test(text), 'a role with nothing in it says so instead of printing zeros');

    await context.close();
  }

  /* ============================================ EMPTY AND ERROR ========== */
  section('Empty and error states');
  {
    expectingFailures = true;
    for (const mode of ['normal', 'minimal']) {
      const { context, page } = await open({ mode, jobs: [], overview: { ...OVERVIEW, data: { ...OVERVIEW.data, metrics: { ...OVERVIEW.data.metrics, openJobs: 0, totalCandidates: 0 } } } });
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      const text = await body(page);
      check(/create a job|no active jobs|welcome/i.test(text), `${mode}: an empty workspace offers one clear action`);
      check((await page.locator('a[href="/jobs/new"]').count()) >= 1, `${mode}: Create job is offered when empty`);
      await context.close();
    }

    for (const mode of ['normal', 'minimal']) {
      const { context, page } = await open({ mode, failJobs: true });
      await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      const text = await body(page);
      check(/unable to load|couldn't load|try again/i.test(text), `${mode}: a failed jobs request explains itself`);
      check(!/\[object|undefined|TypeError/i.test(text), `${mode}: no raw error leaks into the page`);
      await context.close();
    }

    expectingFailures = false;
  }

  /* =================================================== RESPONSIVE ========= */
  section('Responsive');
  {
    const WIDTHS = [1440, 1280, 1024, 768, 430, 390, 375];
    for (const mode of ['normal', 'minimal']) {
      for (const width of WIDTHS) {
        const { context, page } = await open({ mode, width });
        for (const route of ['/dashboard', '/jobs']) {
          await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(450);
          const { doc, win } = await page.evaluate(() => ({
            doc: document.documentElement.scrollWidth,
            win: window.innerWidth
          }));
          check(doc <= win + 1, `${mode} ${width}px — ${route} has no horizontal overflow`, `${doc} > ${win}`);
        }
        await context.close();
      }
    }
  }

  /* ================================================ LONG CONTENT ========== */
  section('Long content');
  {
    const LONG = [
      job(20, 'Senior Staff Software Engineer, Platform Infrastructure, Site Reliability and Developer Experience (Bengaluru)', {
        candidateCount: 1284,
        analyzedCount: 1284,
        strongMatchCount: 311,
        shortlistedCount: 42,
        bestMatchScore: 99
      }),
      job(21, 'QA', { candidateCount: 0 })
    ];
    for (const mode of ['normal', 'minimal']) {
      for (const width of [1440, 390]) {
        const { context, page } = await open({ mode, jobs: LONG, width });
        await page.goto(`${BASE}/jobs`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);
        const { doc, win } = await page.evaluate(() => ({
          doc: document.documentElement.scrollWidth,
          win: window.innerWidth
        }));
        check(doc <= win + 1, `${mode} ${width}px — a 1284-candidate long title does not overflow`, `${doc} > ${win}`);
        const text = await body(page);
        check(/1,284/.test(text), `${mode} ${width}px — large counts are formatted, not clipped`);
        await context.close();
      }
    }
  }

  /* ============================================== MODE SWITCH COST ======== */
  section('Mode switch is presentation only');
  {
    const { context, page } = await open({ mode: 'normal' });
    await page.goto(`${BASE}/jobs?search=engineer&sort=candidates`, { waitUntil: 'networkidle' });
    await page.locator('#job-search').waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);

    const calls = [];
    const rec = (req) => {
      if (req.url().includes('/api/')) calls.push(req.url());
    };
    page.on('request', rec);
    await page.evaluate(() => window.localStorage.setItem('hr-dashboard-workspace-mode', 'minimal'));
    await page.waitForTimeout(800);
    page.off('request', rec);
    check(calls.length === 0, 'switching the stored mode on /jobs issues no API call', calls.join(', '));

    check(page.url().includes('search=engineer'), 'the search term survives in the URL');
    check(page.url().includes('sort=candidates'), 'the sort survives in the URL');
    await context.close();
  }

  /* ================================================ RUNTIME HEALTH ======== */
  section('Runtime health');
  {
    const real = consoleErrors.filter((m) => !ignorable(m));
    check(pageErrors.length === 0, 'no uncaught exceptions', pageErrors.slice(0, 3).join('; '));
    check(real.length === 0, 'no console errors', real.slice(0, 5).join('; '));
  }
} catch (error) {
  failed++;
  console.error('\n  SUITE ERROR:', error.message);
  console.error(error.stack);
} finally {
  await browser.close();
}

console.log('\n----------------------------------------------------------------');
console.log(`  Dashboard & Jobs redesign: ${passed} passed, ${failed} failed`);
console.log('----------------------------------------------------------------\n');
process.exit(failed === 0 ? 0 : 1);
