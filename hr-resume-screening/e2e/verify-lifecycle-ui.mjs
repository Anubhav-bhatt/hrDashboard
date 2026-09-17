/**
 * Close Job discoverability, permanent-delete safety, and Dashboard KPI order.
 *
 *   node verify-lifecycle-ui.mjs
 *
 * The API is stubbed at the network boundary rather than logged into, so every
 * state — open job, closed job, admin, plain recruiter — can be rendered
 * deterministically, and so a suite that exercises a *destructive* UI writes
 * nothing to the database. The server-side rules for the same operations are
 * covered by backend/tests/jobDeletion.test.js, which does hit a real database.
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
const section = (name) => console.log(`\n-- ${name} --`);

const JOB_ID = '00000000-0000-4000-8000-000000000001';

const openJob = {
  id: JOB_ID,
  title: 'React Developer',
  status: 'OPEN',
  jdFileName: 'react-developer.pdf',
  jdText: 'We are hiring a React developer.',
  requiredSkills: ['React'],
  preferredSkills: [],
  searchKeywords: [],
  preferredLocations: [],
  qualifications: [],
  preferredEducation: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  candidateCount: 12,
  shortlistedCount: 4,
  selectedCandidateId: null,
  selectedCandidate: null,
  closedAt: null
};

const closedJob = {
  ...openJob,
  status: 'CLOSED',
  closedAt: '2026-08-25T00:00:00.000Z',
  selectedCandidateId: 'cand-1',
  selectedCandidate: { id: 'cand-1', name: 'Rahul Sharma', overallScore: 91, currentRole: 'Engineer' }
};

const stats = {
  candidateCount: 12,
  analyzedCount: 12,
  shortlistedCount: 4,
  strongMatchCount: 6,
  selectedCount: 0,
  bestMatchScore: 91,
  averageMatchScore: 74
};

const DELETION_PREVIEW = {
  success: true,
  data: {
    job: { id: JOB_ID, title: 'React Developer', closedAt: '2026-08-25T00:00:00.000Z' },
    counts: { candidates: 100, notes: 23, activities: 412, importSessions: 2, storedResumes: 100 },
    storage: { resumeBytes: 20480000 },
    external: { outlookSourcedCandidates: 4 }
  }
};

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'msedge' });

/**
 * @param {Object} options
 * @param {'ADMIN'|'RECRUITER'} [options.role]
 * @param {Object} [options.job]
 * @param {Function} [options.onDelete] Called with the DELETE request body.
 */
const open = async ({ width = 1440, role = 'ADMIN', job = openJob, path = `/jobs/${JOB_ID}`, onDelete } = {}) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();

  // Anything unnamed still answers 200: a 401 anywhere makes the client drop the
  // session and redirect to sign-in.
  await page.route('**/api/**', (r) => r.fulfill({ json: { success: true, data: [], meta: {} } }));
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { success: true, data: { user: { id: 'u1', name: 'Ankit', email: 'a@e.com', role } } } })
  );
  await page.route(`**/api/jobs/${JOB_ID}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      const body = route.request().postDataJSON();
      if (onDelete) onDelete(body);
      return route.fulfill({
        json: {
          success: true,
          message: 'React Developer and its candidate data were permanently deleted.',
          data: { job: { title: 'React Developer' }, deleted: { jobs: 1, candidates: 100 } }
        }
      });
    }
    return route.fulfill({ json: { success: true, data: job } });
  });
  await page.route(`**/api/jobs/${JOB_ID}/summary`, (r) =>
    r.fulfill({ json: { success: true, data: { stats, strongMatchThreshold: 80 } } })
  );
  await page.route(`**/api/jobs/${JOB_ID}/deletion-preview`, (r) => r.fulfill({ json: DELETION_PREVIEW }));
  await page.route(`**/api/jobs/${JOB_ID}/shortlist*`, (r) =>
    r.fulfill({
      json: {
        success: true,
        data: [
          { id: 'cand-1', name: 'Rahul Sharma', currentRole: 'Engineer', totalExperience: 5, overallScore: 91 },
          { id: 'cand-2', name: 'Priya Nair', currentRole: 'Engineer', totalExperience: 4, overallScore: 84 }
        ],
        meta: { canClose: true }
      }
    })
  );
  await page.route(`**/api/jobs/${JOB_ID}/candidates*`, (r) =>
    r.fulfill({ json: { success: true, data: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 0 }, facets: {} } })
  );

  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  return { context, page };
};

try {
  /* =============================================== CHANGE 1 — Close Job */

  section('Close Job is directly discoverable on an OPEN job (desktop 1440)');
  {
    const { context, page } = await open();

    const closeControls = page.getByRole('button', { name: /^close job$/i });
    const count = await closeControls.count();
    check(count > 0, 'a control named exactly "Close job" is present', String(count));

    const first = closeControls.first();
    check(await first.isVisible(), 'it is visible without opening a menu');

    // Not behind an overflow/kebab/disclosure.
    const hidden = await first.evaluate((el) => {
      let n = el.parentElement;
      while (n && n !== document.body) {
        if (n.hasAttribute('hidden')) return 'inside [hidden]';
        if (n.getAttribute('role') === 'menu') return 'inside a menu';
        if (n.tagName === 'DETAILS' && !n.open) return 'inside a closed <details>';
        n = n.parentElement;
      }
      return null;
    });
    check(hidden === null, 'it is not hidden behind a menu, disclosure or overflow', hidden || '');

    // It must not out-shout the recommended action.
    const weights = await page.evaluate(() => {
      const close = [...document.querySelectorAll('button')].find((b) => /^close job$/i.test(b.textContent.trim()));
      const primaries = [...document.querySelectorAll('.btn-primary')].map((b) => b.textContent.trim());
      return { closeIsPrimary: close?.classList.contains('btn-primary') ?? null, primaries };
    });
    check(weights.closeIsPrimary === false, 'Close job is secondary, not a filled primary button');
    check(
      weights.primaries.every((t) => !/^close job$/i.test(t)),
      'the only filled primary is the recommended workflow action',
      JSON.stringify(weights.primaries)
    );

    check(
      (await page.getByRole('button', { name: /select final candidate/i }).count()) === 0,
      'the old "Select final candidate" wording is gone'
    );

    await context.close();
  }

  section('Close Job on mobile (390)');
  {
    const { context, page } = await open({ width: 390 });
    const close = page.getByRole('button', { name: /^close job$/i }).first();
    check(await close.isVisible(), 'still directly visible at 390px');
    const box = await close.boundingBox();
    check(box && box.height >= 36, 'it keeps a comfortable touch target', box ? `${Math.round(box.height)}px` : 'none');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, 'no horizontal overflow at 390px', String(overflow));
    await context.close();
  }

  section('Close Job enters the EXISTING closure flow');
  {
    const { context, page } = await open();
    await page.getByRole('button', { name: /^close job$/i }).first().click();
    const dialog = page.locator('[role="dialog"][aria-labelledby="close-job-title"]');
    await dialog.waitFor({ timeout: 8000 });

    const text = (await dialog.innerText()).replace(/\s+/g, ' ');
    check(/close react developer/i.test(text), 'the dialog names the role being closed');
    check(/select the candidate hired/i.test(text), 'and asks for the hire');
    check(/rahul sharma/i.test(text), 'the shortlist comes from the existing shortlist endpoint');

    // The archive consequence must be stated before confirming.
    check(/out of active hiring, into closed jobs/i.test(text), 'it states that the whole pool is archived');
    check(/nothing is deleted/i.test(text), 'and that closing is not deletion');
    check(!/permanently|destroy|cannot be undone/i.test(text), 'no destructive language on the close dialog');

    // Not styled as a destructive act.
    const confirmIsDestructive = await dialog
      .getByRole('button', { name: /^close job$/i })
      .evaluate((el) => el.classList.contains('btn-destructive'));
    check(confirmIsDestructive === false, 'the confirm button is not destructive-styled');

    await context.close();
  }

  /* =========================================== CHANGE 2 — Permanent delete */

  section('Delete is offered only for a CLOSED job');
  {
    const { context, page } = await open({ job: openJob });
    check(
      (await page.getByRole('button', { name: /delete job data/i }).count()) === 0,
      'an OPEN job offers no delete affordance'
    );
    check(
      (await page.locator('#job-danger-zone-heading').count()) === 0,
      'and shows no danger zone'
    );
    await context.close();
  }

  section('A CLOSED job shows a restrained destructive area');
  {
    const { context, page } = await open({ job: closedJob });
    check((await page.locator('#job-danger-zone-heading').count()) === 1, 'the danger zone is present');

    const trigger = page.getByRole('button', { name: /delete job data/i }).first();
    check(await trigger.isVisible(), 'Delete job data is discoverable');

    const styling = await trigger.evaluate((el) => ({
      solidRed: el.classList.contains('btn-destructive'),
      softRed: el.classList.contains('btn-destructive-soft')
    }));
    check(!styling.solidRed && styling.softRed, 'it is soft-destructive, not a dominant red block', JSON.stringify(styling));

    const zone = await page.locator('section[aria-labelledby="job-danger-zone-heading"]').innerText();
    check(/permanent/i.test(zone), 'the section says the deletion is permanent');
    check(/cannot be undone/i.test(zone), 'and that it cannot be undone');
    check(/archiv/i.test(zone), 'and distinguishes it from closing, which archived the role');

    await context.close();
  }

  section('One click never deletes');
  {
    let deleteCalled = false;
    const { context, page } = await open({ job: closedJob, onDelete: () => { deleteCalled = true; } });

    await page.getByRole('button', { name: /delete job data/i }).first().click();
    const dialog = page.locator('[role="dialog"][aria-labelledby="delete-job-title"]');
    await dialog.waitFor({ timeout: 8000 });
    check(!deleteCalled, 'opening the dialog sends no DELETE');

    const text = (await dialog.innerText()).replace(/\s+/g, ' ');
    check(/permanently delete react developer/i.test(text), 'the dialog names the role');
    check(/100 candidate records/i.test(text), 'it states measured counts, not adjectives');
    check(/100 stored resumes/i.test(text), 'including the resumes');
    check(/23 recruiter notes/i.test(text), 'and the notes');
    check(/412 activity records/i.test(text), 'and the activity trail');
    check(/outlook mailbox are not touched/i.test(text), 'it promises the mailbox is untouched');

    // Wrong confirmation keeps it disabled.
    const confirmButton = dialog.getByRole('button', { name: /delete permanently/i });
    check(await confirmButton.isDisabled(), 'the confirm button starts disabled');

    const input = dialog.locator('input[type="text"]');
    await input.fill('DELETE');
    check(await confirmButton.isDisabled(), 'a wrong phrase keeps it disabled');
    await input.fill('React Develope');
    check(await confirmButton.isDisabled(), 'a near-miss keeps it disabled');

    await input.fill('React Developer');
    check(!(await confirmButton.isDisabled()), 'the exact job title enables it');
    check(!deleteCalled, 'still nothing sent until the button is pressed');

    // Cancel changes nothing.
    await dialog.getByRole('button', { name: /^cancel$/i }).click();
    await page.waitForTimeout(300);
    check(!deleteCalled, 'Cancel sends no DELETE');
    check((await page.locator('[role="dialog"][aria-labelledby="delete-job-title"]').count()) === 0, 'and closes the dialog');

    await context.close();
  }

  section('Confirmed deletion sends exactly one DELETE with the phrase');
  {
    const bodies = [];
    const { context, page } = await open({ job: closedJob, onDelete: (b) => bodies.push(b) });

    await page.getByRole('button', { name: /delete job data/i }).first().click();
    const dialog = page.locator('[role="dialog"][aria-labelledby="delete-job-title"]');
    await dialog.waitFor({ timeout: 8000 });
    await dialog.locator('input[type="text"]').fill('React Developer');
    await dialog.getByRole('button', { name: /delete permanently/i }).click();
    await page.waitForTimeout(900);

    check(bodies.length === 1, 'exactly one DELETE was sent', String(bodies.length));
    check(bodies[0]?.confirmation === 'React Developer', 'it carried the typed confirmation', JSON.stringify(bodies[0]));
    check(/\/jobs\/closed$/.test(new URL(page.url()).pathname), 'the user lands on Closed Jobs, not a 404', page.url());

    await context.close();
  }

  section('A standard recruiter is not offered deletion');
  {
    const { context, page } = await open({ job: closedJob, role: 'RECRUITER' });
    check(
      (await page.getByRole('button', { name: /delete job data/i }).count()) === 0,
      'no delete affordance for a non-admin'
    );
    check((await page.locator('#job-danger-zone-heading').count()) === 0, 'and no danger zone');
    await context.close();
  }

  section('Close and Delete are never confusable');
  {
    const { context, page } = await open({ job: closedJob });
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    check(!/\barchive this job\b/i.test(body), 'deletion is never called archiving');
    for (const wrong of [/\bremove job data\b/i, /\bclear job data\b/i, /\bclean job data\b/i]) {
      check(!wrong.test(body), `deletion is not softened as ${wrong}`);
    }
    await context.close();
  }

  /* ================================= CHANGE 3 — Dashboard KPI position */

  section('Recruitment Snapshot sits at the top of the Dashboard');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    const page = await context.newPage();
    await page.route('**/api/**', (r) => r.fulfill({ json: { success: true, data: [], meta: {} } }));
    await page.route('**/api/auth/me', (r) =>
      r.fulfill({ json: { success: true, data: { user: { id: 'u1', name: 'Ankit', email: 'a@e.com', role: 'ADMIN' } } } })
    );
    await page.route('**/api/dashboard/overview*', (r) =>
      r.fulfill({
        json: {
          success: true,
          data: {
            scope: { jobId: null },
            strongMatchThreshold: 80,
            metrics: {
              openJobs: 6,
              closedJobs: 2,
              totalCandidates: 234,
              strongMatch: 41,
              shortlisted: 12,
              selectedCandidates: 2,
              pendingReview: 90,
              needsReview: 8,
              notSuitable: 3,
              averageScore: 71,
              topScore: 94
            },
            statusBreakdown: [],
            scoreBands: [],
            recentActivity: [],
            recentHires: [],
            topCandidates: [],
            pipeline: []
          }
        }
      })
    );
    await page.route('**/api/jobs/summary*', (r) =>
      r.fulfill({
        json: {
          success: true,
          data: [
            {
              id: JOB_ID,
              title: 'React Developer',
              status: 'OPEN',
              candidateCount: 62,
              analyzedCount: 62,
              shortlistedCount: 4,
              strongMatchCount: 0,
              selectedCount: 0,
              bestMatchScore: 91
            }
          ],
          meta: {
            total: 1,
            pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
            statusCounts: { all: 1, open: 1, closed: 0 },
            strongMatchThreshold: 80
          }
        }
      })
    );

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.locator('#dashboard-snapshot-heading').waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);

    // Document order of the dashboard's landmark sections.
    const order = await page.evaluate(() => {
      const ids = ['dashboard-snapshot-heading', 'dashboard-attention-heading', 'continue-work-heading'];
      const found = ids
        .map((id) => {
          const el = document.getElementById(id);
          return el ? { id, top: el.getBoundingClientRect().top + window.scrollY } : null;
        })
        .filter(Boolean);
      const recommended = document.querySelector('[data-recommended-action], section[aria-label*="ecommend" i]');
      if (recommended) {
        found.push({ id: 'recommended', top: recommended.getBoundingClientRect().top + window.scrollY });
      }
      return found.sort((a, b) => a.top - b.top).map((f) => f.id);
    });
    check(order[0] === 'dashboard-snapshot-heading', 'the snapshot is the first section', JSON.stringify(order));
    const snapshotIdx = order.indexOf('dashboard-snapshot-heading');
    const attentionIdx = order.indexOf('dashboard-attention-heading');
    check(snapshotIdx < attentionIdx, 'and it comes before Needs your attention', JSON.stringify(order));

    section('The four KPI cards');
    const cards = await page.evaluate(() => {
      const heading = document.getElementById('dashboard-snapshot-heading');
      const sec = heading.closest('section');
      return [...sec.querySelectorAll('a')].map((a) => ({
        label: a.querySelector('p')?.textContent?.trim() || '',
        href: a.getAttribute('href'),
        tag: a.tagName,
        ariaLabel: a.getAttribute('aria-label'),
        nestedInteractive: a.querySelectorAll('button, a').length
      }));
    });
    check(cards.length === 4, 'exactly four cards', String(cards.length));
    const labels = cards.map((c) => c.label.toLowerCase());
    for (const expected of ['open jobs', 'active candidates', 'strong matches', 'shortlisted']) {
      check(labels.includes(expected), `"${expected}" card is present`, JSON.stringify(labels));
    }
    check(!labels.includes('hires'), 'the always-empty Hires card has left the snapshot');

    const byLabel = Object.fromEntries(cards.map((c) => [c.label.toLowerCase(), c]));
    check(byLabel['open jobs']?.href === '/jobs', 'Open jobs links to /jobs', byLabel['open jobs']?.href);
    check(/^\/candidates/.test(byLabel['active candidates']?.href || ''), 'Active candidates links to /candidates');
    check(
      /minScore=80/.test(byLabel['strong matches']?.href || ''),
      'Strong matches uses the server threshold, not a hardcoded one',
      byLabel['strong matches']?.href
    );
    check(
      /hrStatus=SHORTLISTED/.test(byLabel['shortlisted']?.href || ''),
      'Shortlisted deep-links to the filtered list',
      byLabel['shortlisted']?.href
    );

    section('KPI card accessibility and restraint');
    check(cards.every((c) => c.tag === 'A'), 'each card is a single semantic link');
    check(cards.every((c) => c.nestedInteractive === 0), 'with no nested interactive elements');
    check(cards.every((c) => c.ariaLabel && c.ariaLabel.length > 0), 'each carries an accessible name');

    const visual = await page.evaluate(() => {
      const sec = document.getElementById('dashboard-snapshot-heading').closest('section');
      return [...sec.querySelectorAll('a')].map((a) => {
        const s = getComputedStyle(a);
        const value = a.querySelectorAll('p')[1];
        return {
          bg: s.backgroundColor,
          metricPx: value ? parseFloat(getComputedStyle(value).fontSize) : null,
          metricWeight: value ? getComputedStyle(value).fontWeight : null
        };
      });
    });
    check(new Set(visual.map((v) => v.bg)).size === 1, 'the cards share one neutral surface, not four tints');
    check(
      visual.every((v) => v.metricPx >= 24 && v.metricPx <= 30),
      'the metric sits in the 24-30px band',
      JSON.stringify(visual.map((v) => v.metricPx))
    );
    check(
      visual.every((v) => Number(v.metricWeight) >= 600 && Number(v.metricWeight) < 800),
      'and is semibold rather than heavy',
      JSON.stringify(visual.map((v) => v.metricWeight))
    );

    section('KPI responsive layout');
    /*
     * Four across from 768px, not from 1024px.
     *
     * The control-surface rebuild moved the four-column breakpoint down one
     * step (lg to md). At 768px each card is 171px wide, which holds its label,
     * its figure and its context line on one line apiece, so the row reads as
     * one band instead of leaving half the tablet width empty. dashboard.mjs
     * asserts the same breakpoint across the full width sweep.
     */
    for (const [width, expectedCols] of [[1440, 4], [1024, 4], [768, 4], [430, 2], [390, 2], [360, 2]]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(250);
      const cols = await page.evaluate(() => {
        const sec = document.getElementById('dashboard-snapshot-heading').closest('section');
        const grid = sec.querySelector('div.grid');
        return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(cols === expectedCols, `${width}px lays out ${expectedCols} columns`, `got ${cols}`);
      check(overflow <= 0, `${width}px has no horizontal page scroll`, String(overflow));
    }

    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
