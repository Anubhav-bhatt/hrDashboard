/**
 * Jobs work index — column spacing, alignment and responsive behaviour.
 *
 *   node verify-jobs-table.mjs
 *
 * Stubbed at the network boundary: no login, no database writes. The job set is
 * chosen to stress the layout rather than to be realistic — the longest role
 * titles a recruiter might type, and one job per contextual action so every
 * label the Next column has to hold appears at least once.
 */
import { chromium } from 'playwright';
import { JOBS, stub, MEASURE } from './diagnose-jobs-table.mjs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5199';
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
const section = (name) => console.log(`\n-- ${name} --`);

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'msedge' });

const open = async ({ width, dark = false, path = '/jobs', jobs = JOBS }) => {
  const context = await browser.newContext({ viewport: { width, height: 1100 } });
  await context.addInitScript(([t]) => window.localStorage.setItem('hr-dashboard-theme', t), [dark ? 'dark' : 'light']);
  const page = await context.newPage();
  await stub(page, jobs);
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.locator('article').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(250);
  return { context, page };
};

/** Widths where the five-column table is expected. */
const TABLE_WIDTHS = [1920, 1440, 1280, 1024];
/** Widths where the row is expected to stack instead. */
const STACKED_WIDTHS = [768, 430, 390, 360];

try {
  for (const width of TABLE_WIDTHS) {
    section(`${width}px — five-column table`);
    const { context, page } = await open({ width });
    const m = await page.evaluate(MEASURE);

    check(!m.error, 'header and rows are present', m.error || '');
    if (m.error) {
      await context.close();
      continue;
    }

    // The whole point: one template, so drift cannot exist.
    check(m.headerGap === m.rows[0].columnGap, 'header and rows share one column gap', `${m.headerGap} vs ${m.rows[0].columnGap}`);
    check(
      m.headerTemplate === m.rows[0].template,
      'header and rows resolve to identical column tracks',
      `${m.headerTemplate} vs ${m.rows[0].template}`
    );

    const gapPx = parseFloat(m.headerGap);
    check(gapPx >= 16 && gapPx <= 32, 'the column gap is in the 16-32px band', m.headerGap);

    // Every numeric heading over its own column.
    for (let i = 1; i <= 3; i++) {
      const h = m.headerCells[i];
      const c = m.rows[0].cells[i];
      check(Math.abs(h.right - c.right) <= 1, `the ${h.text} heading sits over its column`, `drift ${h.right - c.right}px`);
    }
    // Next is left-anchored, so it is the left edges that must agree.
    const nextHeader = m.headerCells[4];
    const nextCell = m.rows[0].cells[4];
    check(
      Math.abs(nextHeader.left - nextCell.left) <= 1,
      'the Next heading begins at the same anchor as the action below it',
      `drift ${nextHeader.left - nextCell.left}px`
    );

    section(`${width}px — Shortlisted / Next separation`);
    const clearances = m.rows.map((r) => r.clearance);
    check(
      clearances.every((c) => c !== null && c >= 20),
      'every row keeps at least 20px of clear space between the figure and the action',
      JSON.stringify(clearances)
    );
    check(
      new Set(clearances).size === 1,
      'the clearance is identical on every row, whatever the label',
      JSON.stringify(clearances)
    );
    check(clearances.every((c) => c > 0), 'nothing overlaps', JSON.stringify(clearances));

    section(`${width}px — rhythm and containment`);
    const heights = m.rows.map((r) => r.height);
    const singleLine = heights.filter((h) => h < 85);
    check(
      singleLine.every((h) => h >= 60 && h <= 80),
      'single-line rows sit in the comfortable band',
      JSON.stringify(heights)
    );
    check(Math.max(...heights) <= 100, 'a two-line role title does not balloon the row', JSON.stringify(heights));
    check(m.pageOverflow <= 0, 'no horizontal page overflow', `${m.pageOverflow}px`);

    /*
     * Wrapping is counted from the text's own line boxes.
     *
     * Dividing the element's height by its line-height counts the button's
     * vertical padding as a second line and reports every label as wrapped —
     * measure the text, not the box around it.
     */
    const wraps = await page.evaluate(() =>
      [...document.querySelectorAll('.jobs-row-next')].map((a) => {
        const textNode = [...a.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
        let lines = null;
        if (textNode) {
          const range = document.createRange();
          range.selectNodeContents(textNode);
          lines = range.getClientRects().length;
        }
        return { text: a.textContent.trim(), lines, whiteSpace: getComputedStyle(a).whiteSpace };
      })
    );
    check(wraps.every((w) => w.lines === 1), 'no action label wraps', JSON.stringify(wraps));
    check(wraps.every((w) => w.whiteSpace === 'nowrap'), 'the action column holds its label on one line');

    const overflowing = await page.evaluate(() => {
      const card = document.querySelector('.card');
      const right = card.getBoundingClientRect().right;
      return [...document.querySelectorAll('.jobs-row-next')]
        .filter((a) => a.getBoundingClientRect().right > right + 1)
        .map((a) => a.textContent.trim());
    });
    check(overflowing.length === 0, 'no action escapes the table surface', JSON.stringify(overflowing));

    await context.close();
  }

  for (const width of STACKED_WIDTHS) {
    section(`${width}px — stacked rows`);
    const { context, page } = await open({ width });

    const state = await page.evaluate(() => {
      const row = document.querySelector('article');
      const header = document.querySelector('[data-jobs-header]');
      const metric = row.querySelector('.jobs-row-metric');
      const action = row.querySelector('.jobs-row-next');
      const facts = [...row.querySelectorAll('p')].find((p) => !p.className.includes('jobs-row-metric'));
      const title = row.querySelector('h3');
      return {
        display: getComputedStyle(row).display,
        headerVisible: header ? getComputedStyle(header).display !== 'none' : false,
        metricHidden: metric ? getComputedStyle(metric).display === 'none' : null,
        factsText: facts?.textContent.trim(),
        actionBelowFacts: action && facts ? action.getBoundingClientRect().top >= facts.getBoundingClientRect().bottom - 1 : null,
        titleLeft: Math.round(title.getBoundingClientRect().left),
        actionLeft: Math.round(action.getBoundingClientRect().left),
        overflow: document.documentElement.scrollWidth - window.innerWidth
      };
    });

    check(state.display === 'flex', 'the row stacks instead of holding five columns', state.display);
    check(!state.headerVisible, 'the column header is withdrawn where there are no columns');
    check(state.metricHidden === true, 'the numeric columns are dropped');
    check(
      /candidate/i.test(state.factsText || ''),
      'the counts are still readable from the summary line',
      state.factsText
    );
    check(state.actionBelowFacts === true, 'the action sits beneath the role and its counts');

    /*
     * Stacked, the three lines must read from one edge. Compared at the text
     * rather than the box: the action keeps its button padding for the focus
     * ring, so its box legitimately starts further left than its glyphs.
     */
    const stackAlign = await page.evaluate(() => {
      const row = document.querySelector('article');
      const title = row.querySelector('h3').getBoundingClientRect();
      const action = row.querySelector('.jobs-row-next');
      const box = action.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(action).paddingLeft) || 0;
      return { title: Math.round(title.left), actionText: Math.round(box.left + pad) };
    });
    check(
      Math.abs(stackAlign.actionText - stackAlign.title) <= 1,
      'the role, its counts and the action share one left edge',
      JSON.stringify(stackAlign)
    );

    const centred = await page.evaluate(() => getComputedStyle(document.querySelector('article')).alignItems);
    check(centred !== 'center', 'the stacked row is not centre-aligned', centred);

    check(state.overflow <= 0, 'no horizontal page overflow', `${state.overflow}px`);

    await context.close();
  }

  section('dark mode (1440)');
  {
    const { context, page } = await open({ width: 1440, dark: true });
    const m = await page.evaluate(MEASURE);
    check(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark theme applied');
    check(m.headerTemplate === m.rows[0].template, 'the same tracks resolve in dark');
    check(m.rows.every((r) => r.clearance >= 20), 'spacing is unchanged in dark', JSON.stringify(m.rows.map((r) => r.clearance)));

    // Spacing, not borders, does the separating.
    const borders = await page.evaluate(() => {
      const row = document.querySelector('article');
      return [...row.children].map((c) => {
        const s = getComputedStyle(c);
        return `${s.borderLeftWidth}/${s.borderRightWidth}`;
      });
    });
    check(borders.every((b) => b === '0px/0px'), 'no vertical cell borders were introduced', JSON.stringify(borders));

    const contrast = await page.locator('.jobs-row-next').first().evaluate((el) => {
      const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
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
        const c = getComputedStyle(n).backgroundColor;
        const p = parse(c);
        if (p.length === 3 && !/rgba\(.*,\s*0\)/.test(c)) {
          bg = p;
          break;
        }
        n = n.parentElement;
      }
      const fg = parse(getComputedStyle(el).color);
      const a = lum(fg);
      const b = lum(bg);
      return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
    });
    check(contrast >= 4.5, 'the action stays readable in dark', `${contrast}:1`);
    await context.close();
  }

  section('accessibility & stability');
  {
    const { context, page } = await open({ width: 1440 });

    const links = await page.evaluate(() =>
      [...document.querySelectorAll('article')].map((r) => {
        const hrefs = [...r.querySelectorAll('a')].map((a) => a.getAttribute('href'));
        return { count: hrefs.length, unique: new Set(hrefs).size, nested: !!r.querySelector('a a') };
      })
    );
    check(links.every((l) => !l.nested), 'no nested links in a row', JSON.stringify(links));
    /*
     * Two links per row is correct — the role and its action are different
     * destinations. They coincide only where the derived next step is "Close
     * job", whose target is the job page the title already points at; that is
     * the existing action model, not a layout fault, so uniqueness is not
     * asserted. What must hold is that every link actually resolves somewhere.
     */
    check(links.every((l) => l.count === 2), 'each row carries exactly two links', JSON.stringify(links));
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('article a')].map((a) => a.getAttribute('href'))
    );
    check(hrefs.every((h) => h && h.startsWith('/')), 'every link resolves to a real route', JSON.stringify(hrefs.slice(0, 4)));

    const labels = await page.locator('.jobs-row-next').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    check(labels.every((l) => l && / for /.test(l)), 'each action names its role for screen readers', JSON.stringify(labels));

    const action = page.locator('.jobs-row-next').first();
    await action.focus();
    const ring = await action.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.boxShadow !== 'none' || s.outlineStyle !== 'none';
    });
    check(ring, 'the action shows a visible focus ring');

    // Hover must not move anything.
    const before = await page.evaluate(() => {
      const r = document.querySelector('article');
      const b = r.getBoundingClientRect();
      return { h: Math.round(b.height), gap: getComputedStyle(r).columnGap, pad: getComputedStyle(r).paddingLeft };
    });
    await page.locator('article').first().hover();
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => {
      const r = document.querySelector('article');
      const b = r.getBoundingClientRect();
      return { h: Math.round(b.height), gap: getComputedStyle(r).columnGap, pad: getComputedStyle(r).paddingLeft };
    });
    check(
      before.h === after.h && before.gap === after.gap && before.pad === after.pad,
      'hover does not shift the layout',
      `${JSON.stringify(before)} vs ${JSON.stringify(after)}`
    );

    await context.close();
  }

  section('Closed Jobs shares the layout without borrowing the columns');
  {
    const closed = JOBS.slice(0, 3).map((j) => ({
      ...j,
      status: 'CLOSED',
      closedAt: '2026-08-25T00:00:00.000Z',
      selectedCandidateId: 'c1',
      selectedCandidate: { id: 'c1', name: 'Rahul Sharma', overallScore: 91 }
    }));
    const { context, page } = await open({ width: 1440, path: '/jobs/closed', jobs: closed });

    const m = await page.evaluate(MEASURE);
    check(!m.error, 'the closed list renders rows', m.error || '');
    check(m.headerTemplate === m.rows[0].template, 'it inherits the same aligned tracks');
    check(m.rows.every((r) => r.clearance >= 20), 'and the same clear separation', JSON.stringify(m.rows.map((r) => r.clearance)));

    const headerText = await page.locator('[data-jobs-header]').innerText();
    check(/outcome/i.test(headerText), 'the last column is headed Outcome, not Next, on a finished role', headerText.replace(/\s+/g, ' '));
    check(!/\bnext\b/i.test(headerText), 'so no closed role is promised a next step');

    const facts = await page.locator('article').first().innerText();
    check(/selected: rahul sharma/i.test(facts), 'the closed row still states its hire', facts.replace(/\s+/g, ' ').slice(0, 90));

    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
