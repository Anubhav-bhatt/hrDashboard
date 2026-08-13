/**
 * Accessibility and keyboard-navigation checks.
 *
 * Verifies the structural accessibility properties that matter for a data-heavy
 * dashboard: every interactive element has an accessible name, forms have real
 * labels, headings are ordered, interactive cards are reachable and operable
 * from the keyboard, and text meets contrast requirements.
 *
 *   node accessibility.mjs
 *
 * Environment: E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD, E2E_BROWSER
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const CHANNEL = process.env.E2E_BROWSER || 'msedge';

if (!EMAIL || !PASSWORD) {
  console.error('E2E_EMAIL and E2E_PASSWORD must be set.');
  process.exit(1);
}

const browser = await chromium.launch({ ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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

/** Relative luminance per WCAG. */
const luminance = ([r, g, b]) => {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrastRatio = (fg, bg) => {
  const a = luminance(fg);
  const b = luminance(bg);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
};

const parseRgb = (value) => {
  const match = String(value).match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(',').map((n) => parseFloat(n.trim()));
  return parts.length >= 3 ? parts.slice(0, 3) : null;
};

try {
  /* ------------------------------------------------ sign-in form a11y ---- */
  section('Sign-in form');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });

  const loginAudit = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.map((input) => ({
      id: input.id,
      type: input.type,
      hasLabel: Boolean(input.labels && input.labels.length) || Boolean(input.getAttribute('aria-label')),
      required: input.hasAttribute('required'),
      autocomplete: input.getAttribute('autocomplete')
    }));
  });

  check(loginAudit.every((i) => i.hasLabel), 'every sign-in input has a real label', JSON.stringify(loginAudit));
  check(loginAudit.every((i) => i.required), 'required fields are marked required');
  check(
    loginAudit.some((i) => i.autocomplete === 'username') && loginAudit.some((i) => i.autocomplete === 'current-password'),
    'autocomplete hints are set for password managers'
  );

  const iconButtonNames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter((b) => !b.textContent.trim())
      .map((b) => b.getAttribute('aria-label') || b.getAttribute('title') || null)
  );
  check(iconButtonNames.every(Boolean), 'icon-only buttons on sign-in have accessible names', JSON.stringify(iconButtonNames));

  // Keyboard-only sign-in.
  await page.keyboard.press('Tab');
  await page.keyboard.type(EMAIL);
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
  check(true, 'the form can be completed and submitted with the keyboard alone');

  /* ------------------------------------------------------- dashboard ---- */
  section('Dashboard');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('a[aria-label^="Total candidates"]').waitFor({ state: 'visible', timeout: 20000 });

  const dashAudit = await page.evaluate(() => {
    const interactive = Array.from(document.querySelectorAll('a, button, select, input, [role="tab"]'));
    const unnamed = interactive.filter((el) => {
      const text = (el.textContent || '').trim();
      const aria = el.getAttribute('aria-label');
      const title = el.getAttribute('title');
      const labelled = el.labels && el.labels.length > 0;
      return !text && !aria && !title && !labelled;
    });

    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map((h) => Number(h.tagName[1]));
    let ordered = true;
    let previous = 0;
    for (const level of headings) {
      if (previous && level > previous + 1) ordered = false;
      previous = level;
    }

    return {
      total: interactive.length,
      unnamed: unnamed.map((el) => `${el.tagName}.${(el.className || '').toString().split(' ')[0]}`),
      h1Count: document.querySelectorAll('h1').length,
      headingsOrdered: ordered,
      hasMain: Boolean(document.querySelector('main')),
      hasSkipLink: Array.from(document.querySelectorAll('a')).some((a) => /skip to main/i.test(a.textContent)),
      landmarks: {
        nav: document.querySelectorAll('nav').length,
        header: document.querySelectorAll('header').length,
        main: document.querySelectorAll('main').length
      },
      // Interactive divs without a role are the classic inaccessible pattern.
      clickableDivs: Array.from(document.querySelectorAll('div[onclick], div[tabindex="0"]:not([role])')).length
    };
  });

  check(dashAudit.unnamed.length === 0, `all ${dashAudit.total} interactive elements have accessible names`, dashAudit.unnamed.join(', '));
  check(dashAudit.h1Count === 1, `exactly one h1 on the page (found ${dashAudit.h1Count})`);
  check(dashAudit.headingsOrdered, 'heading levels do not skip a level');
  check(dashAudit.hasMain, 'content sits inside a main landmark');
  check(dashAudit.hasSkipLink, 'a skip-to-content link is present');
  check(dashAudit.landmarks.nav >= 1 && dashAudit.landmarks.header >= 1, 'navigation and header landmarks exist');
  check(dashAudit.clickableDivs === 0, 'no clickable divs without a role', String(dashAudit.clickableDivs));

  // KPI cards are real links: focusable, and Enter activates them.
  const cardIsLink = await page.evaluate(() => {
    const card = document.querySelector('a[aria-label^="Total candidates"]');
    return card ? card.tagName === 'A' && card.hasAttribute('href') : false;
  });
  check(cardIsLink, 'the KPI card is an anchor with an href, so Enter works natively');

  await page.locator('a[aria-label^="Total candidates"]').focus();
  const focusVisible = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return false;
    const style = window.getComputedStyle(el);
    // The focus ring is drawn with a box-shadow ring or an outline.
    return style.outlineStyle !== 'none' || (style.boxShadow && style.boxShadow !== 'none');
  });
  check(focusVisible, 'a focused KPI card shows a visible focus indicator');

  await page.keyboard.press('Enter');
  await page.waitForURL('**/candidates**', { timeout: 15000 });
  check(page.url().includes('/candidates'), 'pressing Enter on a focused card navigates', page.url());

  /* -------------------------------------------------- candidate list ---- */
  section('Candidate list');
  await page.locator('a[aria-label^="Open profile for"]').first().waitFor({ state: 'visible', timeout: 20000 });

  const listAudit = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const search = document.querySelector('#candidate-search');
    return {
      selectsLabelled: selects.every(
        (s) => (s.labels && s.labels.length > 0) || s.getAttribute('aria-label')
      ),
      searchLabelled: Boolean(search && ((search.labels && search.labels.length) || search.getAttribute('aria-label'))),
      cardsAreLinks: Array.from(document.querySelectorAll('[aria-label^="Open profile for"]')).every((el) => el.tagName === 'A'),
      // A button nested inside an anchor is invalid and unpredictable to activate.
      nestedInteractive: document.querySelectorAll('a button, button a, a a').length,
      statusTabsHavePressed: Array.from(document.querySelectorAll('button[aria-pressed]')).length
    };
  });

  check(listAudit.selectsLabelled, 'every filter and sort control has a label');
  check(listAudit.searchLabelled, 'the search field has a label');
  check(listAudit.cardsAreLinks, 'candidate cards are anchors, keyboard operable by default');
  check(listAudit.nestedInteractive === 0, 'no interactive element nested inside another', String(listAudit.nestedInteractive));
  check(listAudit.statusTabsHavePressed > 0, 'status filter buttons expose their pressed state');

  /* ----------------------------------------------- candidate profile ---- */
  section('Candidate profile');
  await page.locator('a[aria-label^="Open profile for"]').first().click();
  await page.getByRole('tab', { name: /overview/i }).waitFor({ state: 'visible', timeout: 20000 });

  const tabAudit = await page.evaluate(() => {
    const tablist = document.querySelector('[role="tablist"]');
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
    return {
      hasTablist: Boolean(tablist),
      tablistLabelled: Boolean(tablist && (tablist.getAttribute('aria-label') || tablist.getAttribute('aria-labelledby'))),
      allHaveSelected: tabs.every((t) => t.hasAttribute('aria-selected')),
      allControlPanels: tabs.every((t) => t.hasAttribute('aria-controls')),
      onlySelectedFocusable: tabs.filter((t) => t.getAttribute('tabindex') === '0').length === 1,
      panelsLabelled: panels.every((p) => p.hasAttribute('aria-labelledby')),
      tabCount: tabs.length
    };
  });

  check(tabAudit.hasTablist, 'the profile uses a tablist');
  check(tabAudit.tablistLabelled, 'the tablist has an accessible name');
  check(tabAudit.allHaveSelected, 'every tab reports aria-selected');
  check(tabAudit.allControlPanels, 'every tab points at its panel with aria-controls');
  check(tabAudit.onlySelectedFocusable, 'only the selected tab is in the tab order');
  check(tabAudit.panelsLabelled, 'the visible panel is labelled by its tab');

  // Arrow-key navigation through the tab list.
  await page.getByRole('tab', { name: /overview/i }).click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  check(page.url().includes('tab=experience'), 'ArrowRight moves to the next tab', page.url());
  await page.keyboard.press('End');
  await page.waitForTimeout(400);
  check(page.url().includes('tab=activity'), 'End jumps to the last tab', page.url());

  const profileAudit = await page.evaluate(() => {
    const unnamed = Array.from(document.querySelectorAll('a, button'))
      .filter((el) => !(el.textContent || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title'))
      .map((el) => el.outerHTML.slice(0, 60));
    return {
      unnamed,
      externalLinksSafe: Array.from(document.querySelectorAll('a[target="_blank"]')).every((a) =>
        (a.getAttribute('rel') || '').includes('noopener')
      ),
      // Resume text must be rendered as text, never injected as markup.
      noDangerousHtml: !document.querySelector('[data-dangerous-html]')
    };
  });

  check(profileAudit.unnamed.length === 0, 'every profile control has an accessible name', profileAudit.unnamed.join(' | '));
  check(profileAudit.externalLinksSafe, 'external links carry rel="noopener"');
  check(profileAudit.noDangerousHtml, 'no raw HTML injection points');

  /* -------------------------------------------------------- contrast ---- */
  section('Colour contrast');
  await page.getByRole('tab', { name: /overview/i }).click();
  await page.waitForTimeout(500);
  const samples = await page.evaluate(() => {
    const resolveBackground = (element) => {
      let node = element;
      while (node && node !== document.documentElement) {
        const bg = window.getComputedStyle(node).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
        node = node.parentElement;
      }
      return 'rgb(255, 255, 255)';
    };

    const targets = [
      ['page heading', 'h1'],
      ['section heading', 'h2'],
      ['body text', 'p'],
      ['primary button', '.btn-primary'],
      ['secondary button', '.btn-secondary'],
      ['metric value', '.text-metric']
    ];

    return targets
      .map(([label, selector]) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          label,
          color: style.color,
          background: resolveBackground(el),
          fontSize: parseFloat(style.fontSize),
          fontWeight: Number(style.fontWeight) || 400
        };
      })
      .filter(Boolean);
  });

  for (const sample of samples) {
    const fg = parseRgb(sample.color);
    const bg = parseRgb(sample.background);
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    // WCAG AA: 3.0 for large/bold text (>=18.66px bold or >=24px), else 4.5.
    const isLarge = sample.fontSize >= 24 || (sample.fontSize >= 18.66 && sample.fontWeight >= 700);
    const required = isLarge ? 3 : 4.5;
    check(ratio >= required, `${sample.label} contrast ${ratio.toFixed(2)}:1 meets AA (needs ${required}:1)`);
  }

  /* --------------------------------------------------- reduced motion --- */
  section('Reduced motion');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  const motionRespected = await page.evaluate(() => {
    const el = document.querySelector('.btn-primary') || document.querySelector('.card');
    if (!el) return true;
    const duration = window.getComputedStyle(el).transitionDuration;
    return duration === '0s' || parseFloat(duration) < 0.02;
  });
  check(motionRespected, 'transitions are suppressed when reduced motion is requested');
} catch (error) {
  failed++;
  console.error(`\n  SUITE ERROR: ${error.message}`);
} finally {
  console.log('\n---------------------------------------------');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}
