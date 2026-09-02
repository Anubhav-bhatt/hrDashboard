/**
 * Measurement harness for the Jobs table layout.
 *
 * Renders the Jobs page against stubbed data chosen to stress the layout —
 * punishing role titles and the longest contextual action labels — and measures
 * the actual geometry rather than describing it: where each header sits against
 * the column beneath it, and how much clear space separates the Shortlisted
 * value from the Next action.
 *
 * Stubbed at the network boundary, so it writes nothing and needs no login.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5199';

const job = (id, title, over = {}) => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  title,
  status: 'OPEN',
  jdFileName: `${title}.pdf`,
  createdAt: '2026-08-24T00:00:00.000Z',
  candidateCount: 128,
  analyzedCount: 128,
  strongMatchCount: 27,
  shortlistedCount: 8,
  selectedCount: 0,
  bestMatchScore: 91,
  requirements: { preferredLocations: ['Pune'], minimumExperience: 4 },
  ...over
});

/*
 * One job per contextual action, plus the longest role titles a recruiter might
 * realistically type. Between them these produce every label the Next column has
 * to hold: Review shortlist, Review candidates, Add candidates, Score
 * candidates, Close job.
 */
export const JOBS = [
  job(1, 'React Developer'),
  job(2, 'Principal Machine Learning Infrastructure Engineer', { shortlistedCount: 4, strongMatchCount: 14, candidateCount: 84 }),
  job(3, 'Customer Experience & Operations Manager', { candidateCount: 0, strongMatchCount: 0, shortlistedCount: 0, analyzedCount: 0, bestMatchScore: null }),
  job(4, 'Senior Full Stack Software Engineer', { analyzedCount: 0, strongMatchCount: 0, shortlistedCount: 0, candidateCount: 1240, bestMatchScore: null }),
  job(5, 'Data Analyst', { selectedCount: 1, shortlistedCount: 12, candidateCount: 1284, strongMatchCount: 127 }),
  job(6, 'QA Automation Engineer', { strongMatchCount: 0, shortlistedCount: 0, candidateCount: 21, bestMatchScore: 64 })
];

export const stub = async (page, jobs = JOBS) => {
  await page.route('**/api/**', (r) => r.fulfill({ json: { success: true, data: [], meta: {} } }));
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { success: true, data: { user: { id: 'u1', name: 'Ankit', email: 'a@e.com', role: 'ADMIN' } } } })
  );
  await page.route('**/api/jobs/summary*', (r) =>
    r.fulfill({
      json: {
        success: true,
        data: jobs,
        meta: {
          total: jobs.length,
          pagination: { page: 1, limit: 12, total: jobs.length, totalPages: 1 },
          statusCounts: { all: jobs.length, open: jobs.length, closed: 0 },
          strongMatchThreshold: 80
        }
      }
    })
  );
};

/** Geometry of the header row against the first data row. */
export const MEASURE = () => {
  const header = document.querySelector('[data-jobs-header]') ||
    [...document.querySelectorAll('div')].find(
      (d) => /grid-cols-\[/.test(d.className) && /Role/.test(d.textContent) && /Next/.test(d.textContent)
    );
  const rows = [...document.querySelectorAll('article')];
  if (!header || !rows.length) return { error: 'header or rows not found', header: !!header, rows: rows.length };

  const hs = getComputedStyle(header);
  const headerCells = [...header.children].map((c) => {
    const b = c.getBoundingClientRect();
    return { text: c.textContent.trim(), left: Math.round(b.left), right: Math.round(b.right) };
  });

  const rowInfo = rows.map((row) => {
    const rs = getComputedStyle(row);
    const cells = [...row.children].map((c) => {
      const b = c.getBoundingClientRect();
      return {
        text: c.textContent.trim().slice(0, 40),
        left: Math.round(b.left),
        right: Math.round(b.right),
        width: Math.round(b.width)
      };
    });
    // Shortlisted is the last numeric cell; Next is the action that follows it.
    const action = row.querySelector('a[aria-label]');
    const numeric = [...row.querySelectorAll('p')].filter((p) => /jobs-row-metric/.test(p.className));
    const shortlisted = numeric[numeric.length - 1];
    let clearance = null;
    if (action && shortlisted) {
      clearance = Math.round(action.getBoundingClientRect().left - shortlisted.getBoundingClientRect().right);
    }
    return {
      title: row.querySelector('h3')?.textContent.trim().slice(0, 44),
      height: Math.round(row.getBoundingClientRect().height),
      columnGap: rs.columnGap,
      template: rs.gridTemplateColumns,
      cells,
      actionText: action?.textContent.trim().replace(/\s+/g, ' '),
      actionLeft: action ? Math.round(action.getBoundingClientRect().left) : null,
      actionWidth: action ? Math.round(action.getBoundingClientRect().width) : null,
      shortlistedRight: shortlisted ? Math.round(shortlisted.getBoundingClientRect().right) : null,
      clearance
    };
  });

  return {
    headerGap: hs.columnGap,
    headerTemplate: hs.gridTemplateColumns,
    headerPadding: `${hs.paddingLeft} / ${hs.paddingRight}`,
    headerCells,
    rows: rowInfo,
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth
  };
};

if (process.argv[1] && process.argv[1].endsWith('diagnose-jobs-table.mjs')) {
  const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'msedge' });

  for (const width of [1920, 1440, 1280, 1024]) {
    const context = await browser.newContext({ viewport: { width, height: 1100 } });
    const page = await context.newPage();
    await stub(page);
    await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
    await page.locator('article').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);

    const m = await page.evaluate(MEASURE);
    console.log(`\n${'='.repeat(72)}\n  ${width}px\n${'='.repeat(72)}`);
    if (m.error) {
      console.log('  ', m.error, JSON.stringify(m));
      await context.close();
      continue;
    }
    console.log(`  header  gap=${m.headerGap}  padding=${m.headerPadding}`);
    console.log(`          template=${m.headerTemplate}`);
    console.log(`  row     gap=${m.rows[0].columnGap}`);
    console.log(`          template=${m.rows[0].template}`);
    console.log(`  page overflow: ${m.pageOverflow}px`);

    console.log('\n  HEADER vs ROW alignment (right edges, numeric columns):');
    for (let i = 1; i < m.headerCells.length; i++) {
      const h = m.headerCells[i];
      const c = m.rows[0].cells[i];
      const drift = c ? (i === 4 ? h.left - c.left : h.right - c.right) : null;
      console.log(
        `    ${String(h.text).padEnd(12)} header=${String(i===4?h.left:h.right).padStart(5)}  row=${String(i===4?c?.left:c?.right).padStart(5)}  drift=${drift}px`
      );
    }

    console.log('\n  SHORTLISTED -> NEXT clearance:');
    for (const r of m.rows) {
      console.log(
        `    ${String(r.clearance).padStart(5)}px   "${r.actionText}"   (${String(r.title).slice(0, 38)})`
      );
    }
    console.log(`\n  row heights: ${m.rows.map((r) => r.height).join(', ')}`);
    await context.close();
  }

  await browser.close();
}
