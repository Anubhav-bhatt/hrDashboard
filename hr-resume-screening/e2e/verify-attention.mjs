/**
 * Acceptance checks for the dashboard's "Needs attention" queue and the
 * "Recommended next step" it is paired with.
 *
 * The API is stubbed at the network boundary rather than logged into, so the
 * queue renders deterministically with a job set that exercises every
 * deriveNextAction branch and every empty/full state — and so this writes
 * nothing to the database.
 *
 * Replaces the checks for the former attention-row component (indicator dots,
 * row grid, panel surface). The dashboard redesign renders the queue as plain
 * rows in one quiet panel; the behaviour those checks protected — bounded,
 * ordered by the shared helper, real destinations, closed roles excluded,
 * readable in both themes and at phone width — is asserted here instead.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
let pass = 0;
let fail = 0;
const check = (ok, label, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
};

const job = (id, title, over) => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  title,
  status: 'OPEN',
  candidateCount: 0,
  analyzedCount: 0,
  strongMatchCount: 0,
  shortlistedCount: 0,
  selectedCount: 0,
  pendingReviewCount: 0,
  bestMatchScore: null,
  ...over
});

/* One role per deriveNextAction branch, in deliberately unsorted order. */
const JOBS = [
  job(5, 'QA Automation Engineer', { candidateCount: 21, analyzedCount: 21, bestMatchScore: 64 }),
  job(4, 'Engineering Manager, Payments', { candidateCount: 0 }),
  job(3, 'Data Analyst', { candidateCount: 37, analyzedCount: 37, strongMatchCount: 6, pendingReviewCount: 30, bestMatchScore: 88 }),
  job(2, 'Product Designer', { candidateCount: 62, analyzedCount: 62, shortlistedCount: 4, bestMatchScore: 91 }),
  job(1, 'Senior Platform Engineer', { candidateCount: 48, analyzedCount: 48, selectedCount: 1, bestMatchScore: 94 }),
  job(99, 'ARCHIVED Compliance Auditor', { status: 'CLOSED', candidateCount: 10, analyzedCount: 10 })
];

/* deriveNextAction priorities: close 0, shortlist 1, score 2, strong 3, add 4, review-all 5. */
const EXPECTED_ORDER = ['Senior Platform Engineer', 'Product Designer', 'Data Analyst', 'Engineering Manager, Payments', 'QA Automation Engineer'];

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'msedge' });

const open = async ({ width = 1440, dark = false, jobs = JOBS, ready = 'section[aria-labelledby="dashboard-attention-heading"]' } = {}) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  await context.addInitScript(([t]) => window.localStorage.setItem('hr-dashboard-theme', t), [dark ? 'dark' : 'light']);
  const page = await context.newPage();

  // Anything unnamed must still answer 200: the client treats a 401 on any
  // request as the session ending, which would redirect away from the dashboard.
  await page.route('**/api/**', (r) => r.fulfill({ json: { success: true, data: [], meta: {} } }));
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { success: true, data: { user: { id: 'u1', name: 'A', email: 'r@e.com', role: 'HR' } } } })
  );
  await page.route('**/api/dashboard/overview*', (r) =>
    r.fulfill({
      json: {
        success: true,
        data: {
          scope: { jobId: null },
          strongMatchThreshold: 80,
          metrics: { openJobs: 5, totalCandidates: 168, strongMatch: 6, shortlisted: 4, pendingReview: 30 },
          pipeline: [],
          scoreBands: [],
          recentCandidates: []
        }
      }
    })
  );
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
  await page.locator(ready).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  return { context, page };
};

/** Contrast of an element's text against the nearest ancestor that paints. */
const contrastOf = (locator) =>
  locator.first().evaluate((el) => {
    const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
    const lum = ([r, g, b]) => {
      const f = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    let n = el;
    let bg = [255, 255, 255];
    while (n && n !== document.documentElement) {
      const p = parse(getComputedStyle(n).backgroundColor);
      if (p.length === 3 || (p.length === 4 && p[3] > 0)) { bg = p; break; }
      n = n.parentElement;
    }
    const a = lum(parse(getComputedStyle(el).color));
    const b = lum(bg);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  });

try {
  console.log('\n-- queue content and order (1440 light) --');
  {
    const { context, page } = await open();
    const section = page.locator('section[aria-labelledby="dashboard-attention-heading"]');
    const recommended = page.locator('section[aria-labelledby="dashboard-recommended-heading"]');

    check((await page.locator('h2#dashboard-attention-heading').count()) === 1, 'section heading is a semantic h2');
    check(/needs attention/i.test(await section.textContent()), 'heading reads "Needs attention"');

    const recText = await recommended.innerText();
    check(recText.includes(EXPECTED_ORDER[0]), 'the recommendation is the highest-priority role', recText.slice(0, 80));
    check((await recommended.locator('a').count()) === 1, 'the recommendation carries one CTA');
    check((await recommended.locator('a').getAttribute('href')) === `/jobs/${JOBS[4].id}`, 'the close-job step opens the job');

    const titles = await section.locator('li h3').allInnerTexts();
    check(titles.length === 3, 'the queue is bounded to three rows', String(titles.length));
    check(JSON.stringify(titles) === JSON.stringify(EXPECTED_ORDER.slice(1, 4)), 'rows follow the shared priority order after the recommendation', JSON.stringify(titles));
    check(!titles.includes(EXPECTED_ORDER[0]), 'the recommended role is not repeated in the queue');

    const hrefs = await section.locator('li a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    check(hrefs[0] === `/jobs/${JOBS[3].id}/candidates?hrStatus=SHORTLISTED&sort=score_desc`, 'shortlist row deep-links to the filtered list', hrefs[0]);
    check(hrefs[1] === `/jobs/${JOBS[2].id}/candidates?minScore=80&sort=score_desc`, 'strong-match row uses the server threshold', hrefs[1]);
    check(hrefs[2] === `/jobs/${JOBS[1].id}/import`, 'empty role row goes to import', hrefs[2]);

    const labels = await section.locator('li a').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    check(labels.every((l, i) => l && l.endsWith(`for ${titles[i]}`)), 'each action names its role for assistive tech', JSON.stringify(labels));
    check((await section.locator('.attention-row, .attention-panel').count()) === 0, 'the retired attention-row component is gone');

    const body = await page.locator('main').innerText();
    check(!/ARCHIVED Compliance Auditor/.test(body), 'a closed role never appears, even if the response includes it');
    check(!/\bNaN\b|\bundefined\b|\bnull\b/.test(body), 'no NaN, undefined or null with a sparse overview');
    await context.close();
  }

  console.log('\n-- themes and phone width --');
  for (const dark of [false, true]) {
    for (const width of [1440, 390]) {
      const { context, page } = await open({ width, dark });
      const tag = `${dark ? 'dark' : 'light'} ${width}px`;
      const section = page.locator('section[aria-labelledby="dashboard-attention-heading"]');
      check(await page.evaluate((d) => document.documentElement.classList.contains('dark') === d, dark), `${tag}: theme applied`);
      const title = await contrastOf(section.locator('li h3'));
      const context_ = await contrastOf(section.locator('li p'));
      const action = await contrastOf(section.locator('li a'));
      check(title >= 4.5, `${tag}: role title contrast ${title}:1`);
      check(context_ >= 4.5, `${tag}: supporting text contrast ${context_}:1`);
      check(action >= 4.5, `${tag}: action text contrast ${action}:1`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(overflow <= 0, `${tag}: no horizontal overflow`, String(overflow));
      const small = await section.locator('li a').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
      check(small === 0, `${tag}: actions are at least 44px tall`);
      await context.close();
    }
  }

  console.log('\n-- empty states --');
  {
    const onlyOne = [job(7, 'Solo Role', { candidateCount: 5, analyzedCount: 5, shortlistedCount: 1 })];
    const { context, page } = await open({ jobs: onlyOne });
    const text = (await page.locator('section[aria-labelledby="dashboard-attention-heading"]').textContent()).replace(/\s+/g, ' ');
    check(/nothing else needs attention/i.test(text), 'a single role reads as nothing else waiting', text.slice(0, 90));
    check((await page.locator('section[aria-labelledby="dashboard-recommended-heading"]').innerText()).includes('Solo Role'), 'and that role is the recommendation');
    await context.close();
  }
  {
    const closedOnly = [job(9, 'Closed Role', { status: 'CLOSED', candidateCount: 10, analyzedCount: 10 })];
    const { context, page } = await open({ jobs: closedOnly, ready: 'h3:has-text("No hiring activity yet")' });
    check((await page.locator('section[aria-labelledby="dashboard-attention-heading"]').count()) === 0, 'only closed roles render no queue, only the empty state');
    check(!(await page.locator('main').innerText()).includes('Closed Role'), 'and the closed role is not named anywhere');
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
