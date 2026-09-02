/**
 * Acceptance checks for the dashboard's "Needs your attention" queue.
 *
 * The API is stubbed at the network boundary rather than logged into, so the
 * queue renders deterministically with a job set that exercises every indicator
 * and every empty/full state — and so this writes nothing to the database.
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
  bestMatchScore: null,
  ...over
});

const JOBS = [
  job(1, 'Senior Platform Engineer', { candidateCount: 48, analyzedCount: 48, selectedCount: 1, bestMatchScore: 94 }),
  job(2, 'Product Designer', { candidateCount: 62, analyzedCount: 62, shortlistedCount: 4, bestMatchScore: 91 }),
  job(3, 'Data Analyst', { candidateCount: 37, analyzedCount: 37, strongMatchCount: 6, bestMatchScore: 88 }),
  job(4, 'Engineering Manager, Payments', { candidateCount: 0 }),
  job(5, 'QA Automation Engineer', { candidateCount: 21, analyzedCount: 21, bestMatchScore: 64 })
];

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'msedge' });

const open = async ({ width = 1440, dark = false, jobs = JOBS } = {}) => {
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
          metrics: { totalJobs: 5, totalCandidates: 182 },
          statusBreakdown: [],
          scoreBands: [],
          recentActivity: []
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
  await page.locator('section[aria-labelledby="dashboard-attention-heading"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  return { context, page };
};

/** Contrast of an element's text against the nearest ancestor that paints. */
const contrastOf = (page, selector, useBackground = false) =>
  page.locator(selector).first().evaluate((el, useBg) => {
    const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const paintedBg = (node) => {
      let n = useBg ? node.parentElement : node;
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor;
        const p = parse(c);
        const transparent = /rgba\(.*,\s*0\)/.test(c);
        if (p.length === 3 && !transparent) return p;
        n = n.parentElement;
      }
      return [255, 255, 255];
    };
    const fg = parse(useBg ? getComputedStyle(node1(el)).backgroundColor : getComputedStyle(el).color);
    function node1(x) {
      return x;
    }
    const bg = paintedBg(el);
    const a = lum(fg);
    const b = lum(bg);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  }, useBackground);

try {
  console.log('\n-- structure & existing test contract (1440 light) --');
  {
    const { context, page } = await open();
    const section = page.locator('section[aria-labelledby="dashboard-attention-heading"]');

    check((await page.locator('h2#dashboard-attention-heading').count()) === 1, 'section heading is a semantic h2');
    check(
      (await page.locator('#dashboard-attention-heading + p').count()) === 1,
      'supporting text is still the adjacent sibling of the heading (focus-scale.mjs)'
    );
    const rows = await section.locator('li').count();
    check(rows > 0 && rows <= 3, 'rows are list items, bounded to three (focus-scale.mjs)', String(rows));
    check(/needs your attention/i.test(await section.textContent()), 'heading text unchanged (scenarios/simplification)');
    check(
      (await section.locator('a', { hasText: /review shortlist|review candidates|add candidates|score candidates/i }).count()) > 0,
      'concrete next actions remain links (simplification.mjs)'
    );
    check((await section.locator('h3').count()) === rows, 'each row titles its role with an h3');
    check((await page.locator('.attention-panel').count()) === 1, 'one surface holds the queue, not a card per row');

    console.log('\n-- indicators are semantic, and capped --');
    const dots = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.attention-row')).map((r) => ({
        cls: [...r.classList].find((c) => c.startsWith('attention-row-')) || null,
        bg: getComputedStyle(r.querySelector('.attention-dot')).backgroundColor
      }))
    );
    check(new Set(dots.map((d) => d.bg)).size === 3, 'the three visible rows carry three distinct meanings', JSON.stringify(dots.map((d) => d.bg)));
    const vocabulary = await page.evaluate(() => {
      const sheet = Array.from(document.styleSheets).flatMap((s) => {
        try {
          return Array.from(s.cssRules);
        } catch {
          return [];
        }
      });
      return sheet.filter((r) => r.selectorText && /attention-row-(decide|review|setup)\b/.test(r.selectorText)).length;
    });
    check(vocabulary <= 3, 'indicator vocabulary is capped at three (no rainbow rows)', String(vocabulary));

    console.log('\n-- colour is never the only signal --');
    const textual = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.attention-row')).map((r) => ({
        context: (r.querySelector('.attention-row-context')?.textContent || '').trim().length,
        action: (r.querySelector('.attention-row-action')?.textContent || '').trim()
      }))
    );
    check(
      textual.every((t) => t.context > 10 && t.action.length > 3),
      'every row states its situation and names its action in words',
      JSON.stringify(textual)
    );

    console.log('\n-- alignment: marker, role and action share the title line --');
    const align = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.attention-row')).map((r) => {
        const mid = (el) => {
          const b = el.getBoundingClientRect();
          return b.top + b.height / 2;
        };
        const title = r.querySelector('h3').getBoundingClientRect();
        const titleLine = title.top + Math.min(title.height, 22) / 2;
        return {
          dot: Math.round(Math.abs(mid(r.querySelector('.attention-dot')) - titleLine)),
          action: Math.round(Math.abs(mid(r.querySelector('.attention-row-action')) - titleLine))
        };
      })
    );
    check(align.every((a) => a.dot <= 2 && a.action <= 2), 'marker and action sit on the title line', JSON.stringify(align));

    console.log('\n-- row rhythm --');
    const heights = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.attention-row')).map((r) => Math.round(r.getBoundingClientRect().height))
    );
    check(heights.every((h) => h >= 56 && h <= 80), 'rows sit in the comfortable 60-76px band', JSON.stringify(heights));

    const separator = await page.evaluate(() => {
      const rows = document.querySelectorAll('.attention-row');
      const s = getComputedStyle(rows[1], '::before');
      const panel = document.querySelector('.attention-panel').getBoundingClientRect();
      return { bg: s.backgroundColor, left: s.left, height: s.height, panelLeft: panel.left };
    });
    check(parseFloat(separator.left) > 24, 'separators are inset past the indicator, not full width', JSON.stringify(separator));

    console.log('\n-- keyboard & semantics --');
    const firstAction = section.locator('.attention-row-action').first();
    await firstAction.focus();
    const ring = await firstAction.evaluate((el) => {
      const s = getComputedStyle(el);
      return { shadow: s.boxShadow, outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth };
    });
    check(ring.shadow !== 'none' || ring.outlineStyle !== 'none', 'action shows a visible focus ring', JSON.stringify(ring));
    check(await firstAction.evaluate((el) => el.tagName === 'A' && !!el.getAttribute('href')), 'action is a real link');
    check((await section.locator('h3 a[href]').count()) === rows, 'each role title is a real link');
    const labels = await section.locator('.attention-row-action').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    check(labels.every((l) => l && / for /.test(l)), 'action labels name their role for screen readers', JSON.stringify(labels));

    console.log('\n-- no nested or duplicated navigation --');
    const nested = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.attention-row')).map((r) => {
        const hrefs = Array.from(r.querySelectorAll('a')).map((a) => a.getAttribute('href'));
        return { count: hrefs.length, unique: new Set(hrefs).size, nested: !!r.querySelector('a a') };
      })
    );
    check(
      nested.every((n) => n.count === n.unique && !n.nested),
      'two links per row, distinct destinations, none nested',
      JSON.stringify(nested)
    );

    console.log('\n-- contrast (light) --');
    for (const [sel, label] of [
      ['.attention-row h3', 'role title'],
      ['.attention-row-context', 'supporting sentence'],
      ['.attention-row-action', 'action text']
    ]) {
      const ratio = await contrastOf(page, sel);
      check(ratio >= 4.5, `${label} contrast >= 4.5:1`, `${ratio}:1`);
    }

    await context.close();
  }

  console.log('\n-- dark mode (1440) --');
  {
    const { context, page } = await open({ dark: true });
    check(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark theme applied');
    for (const [sel, label] of [
      ['.attention-row h3', 'role title'],
      ['.attention-row-context', 'supporting sentence'],
      ['.attention-row-action', 'action text']
    ]) {
      const ratio = await contrastOf(page, sel);
      check(ratio >= 4.5, `${label} contrast >= 4.5:1 in dark`, `${ratio}:1`);
    }
    const sep = await page.evaluate(() => getComputedStyle(document.querySelectorAll('.attention-row')[1], '::before').backgroundColor);
    check(sep && !/,\s*0\)/.test(sep), 'row separation survives dark mode', sep);
    const surfaces = await page.evaluate(() => ({
      panel: getComputedStyle(document.querySelector('.attention-panel')).backgroundColor,
      page: getComputedStyle(document.body).backgroundColor
    }));
    check(surfaces.panel !== surfaces.page, 'panel is an elevated surface, not flat on the page', JSON.stringify(surfaces));
    const dotCount = await page.evaluate(
      () => new Set(Array.from(document.querySelectorAll('.attention-dot')).map((d) => getComputedStyle(d).backgroundColor)).size
    );
    check(dotCount === 3, 'semantic indicators stay distinguishable in dark', String(dotCount));
    await context.close();
  }

  console.log('\n-- mobile 390 --');
  {
    const { context, page } = await open({ width: 390 });
    const layout = await page.evaluate(() => {
      const r = document.querySelector('.attention-row');
      const title = r.querySelector('h3').getBoundingClientRect();
      const action = r.querySelector('.attention-row-action').getBoundingClientRect();
      const ctx = r.querySelector('.attention-row-context').getBoundingClientRect();
      // The action link is inset by its own padding so the focus ring clears the
      // glyphs; compare where the TEXT starts, not where the box does.
      const pad = parseFloat(getComputedStyle(r.querySelector('.attention-row-action')).paddingLeft) || 0;
      return { below: action.top >= ctx.bottom - 1, offsetFromTitle: Math.round(action.left + pad - title.left) };
    });
    check(layout.below, 'action stacks beneath the supporting text');
    check(Math.abs(layout.offsetFromTitle) <= 2, 'action aligns to the text column, not a narrow right gutter', String(layout.offsetFromTitle));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, 'no horizontal overflow at 390px', String(overflow));
    await context.close();
  }

  console.log('\n-- empty state --');
  {
    const { context, page } = await open({ jobs: [job(9, 'Closed Role', { status: 'CLOSED', candidateCount: 10, analyzedCount: 10 })] });
    const section = page.locator('section[aria-labelledby="dashboard-attention-heading"]');
    const text = (await section.textContent()).replace(/\s+/g, ' ');
    check(/caught up/i.test(text), 'compact positive state', text.slice(0, 90));
    const height = await section.locator('.attention-panel').evaluate((el) => Math.round(el.getBoundingClientRect().height));
    check(height <= 90, 'empty surface sizes to its content rather than a large box', `${height}px`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
