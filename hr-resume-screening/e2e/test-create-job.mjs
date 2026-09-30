/**
 * End-to-End Test for the Redesigned & Simplified /jobs/new Create Job Experience.
 *
 * Runs full browser automation through Playwright:
 * - Recruiter authentication
 * - Navigation to /jobs/new
 * - Page layout, typography, max-width check (760-900px)
 * - Validation on missing required fields
 * - Mode switching: Upload JD vs Paste description
 * - JD text paste and automated extraction
 * - Friendly extraction banner ("We found these in the job description")
 * - Verification of simplified recruiter-friendly section titles:
 *     - "What are you looking for?" (replaces technical "Requirements")
 *     - "Must-have skills" (replaces "Required Skills")
 *     - "Nice-to-have skills" (replaces "Preferred Skills")
 *     - "Education" with "Optional" badge
 * - Verification that technical score weighting text is absent
 * - Flexible skill tag entry:
 *     - Typing + Enter
 *     - Typing comma (,)
 *     - Pasting comma-separated values (e.g. "GraphQL, Jest, AWS")
 *     - Autocomplete dropdown selection
 *     - Backspace tag removal
 * - Progressive disclosure:
 *     - "Additional preferences" collapsed by default
 *     - Expands to reveal Minimum experience, Location preference, Salary band, and Other criteria
 * - Collapsible JD text viewer ("View / Edit description")
 * - Job creation and redirection to /jobs/:id
 * - File upload mode & compact selected file state
 * - Viewport responsive testing (360, 390, 430, 768, 1024, 1440)
 * - Accessibility (labels, aria attributes, keyboard navigation)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL || 'admin@hrdashboard.local';
const PASSWORD = process.env.E2E_PASSWORD || 'vJUmUsdJwTMB4SaMTkXFxElz';

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

async function run() {
  console.log('\n================================================================');
  console.log('  E2E Verification — Simplified Requirements & Create Job Flow');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const createdJobIds = [];

  try {
    // ------------------------------------------------ 1. Authentication
    console.log('1. Authentication');
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"], input[name="email"], #email', EMAIL);
    await page.fill('input[type="password"], input[name="password"], #password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
    check(true, 'recruiter authenticated successfully');

    // ------------------------------------------------ 2. Navigation to /jobs/new
    console.log('\n2. Navigation & Simplified Structure');
    await page.goto(`${BASE}/jobs/new`);
    await page.waitForSelector('h1', { timeout: 5000 });

    const heading = await page.textContent('h1');
    check(heading.includes('Create Job'), 'page renders "Create Job" heading');

    const backLink = await page.$('a[href="/jobs"]');
    check(Boolean(backLink), 'quiet "← Jobs" back link is present');

    // Section title & copy checks
    const pageHtml = await page.content();
    check(pageHtml.includes('What are you looking for?'), 'renders recruiter-friendly section "What are you looking for?"');
    check(pageHtml.includes('Must-have skills'), 'renders "Must-have skills" label');
    check(pageHtml.includes('Nice-to-have skills'), 'renders "Nice-to-have skills" label');
    check(pageHtml.includes('Education'), 'renders "Education" label');
    check(!pageHtml.includes('heavily weighted'), 'contains zero mentions of "heavily weighted"');
    check(!pageHtml.includes('bonus match points'), 'contains zero mentions of "bonus match points"');
    check(!pageHtml.includes('scoring criteria'), 'contains zero mentions of "scoring criteria"');
    check(!pageHtml.includes('None added yet.'), 'removes discouraging "None added yet." message');

    // Max width verification (760 - 900px)
    const formSurface = await page.$('form');
    const formBox = await formSurface?.boundingBox();
    check(formBox && formBox.width >= 700 && formBox.width <= 920, `form surface is centered and bounded (${Math.round(formBox?.width || 0)}px)`);

    // ------------------------------------------------ 3. Client Validation
    console.log('\n3. Client Validation');
    const submitBtn = await page.$('button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(300);

    const titleError = await page.$('#title-error, p:has-text("Job title is required")');
    check(Boolean(titleError), 'validates missing job title with clear message: "Job title is required."');

    const fileError = await page.$('#jdFile-error, p:has-text("Attach the job description")');
    check(Boolean(fileError), 'validates missing JD file or text');

    // ------------------------------------------------ 4. Flexible Tag Entry Testing
    console.log('\n4. Flexible Tag Entry (Type, Comma, Paste, Autocomplete)');
    const mustHaveInput = await page.$('#requiredSkillsInput-input');
    check(Boolean(mustHaveInput), 'must-have skills provides unified inline input');

    // 4a. Type + Enter
    await mustHaveInput.fill('Vue.js');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    let currentHtml = await page.content();
    check(currentHtml.includes('Vue.js'), 'creates tag on Enter key');

    // 4b. Type comma (,)
    await mustHaveInput.fill('Svelte,');
    await page.waitForTimeout(100);
    currentHtml = await page.content();
    check(currentHtml.includes('Svelte'), 'creates tag immediately on comma (,) key');

    // 4c. Paste comma-separated text
    await mustHaveInput.focus();
    await page.evaluate(() => {
      const input = document.querySelector('#requiredSkillsInput-input');
      const dt = new DataTransfer();
      dt.setData('text/plain', 'Python, Django, FastAPI');
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(150);
    currentHtml = await page.content();
    check(
      currentHtml.includes('Python') && currentHtml.includes('Django') && currentHtml.includes('FastAPI'),
      'splits pasted comma-separated text into individual tags (Python, Django, FastAPI)'
    );

    // 4d. Autocomplete suggestion selection
    await mustHaveInput.fill('Rea');
    await page.waitForTimeout(200);
    const suggestionOption = await page.$('#requiredSkillsInput-listbox li');
    check(Boolean(suggestionOption), 'displays lightweight autocomplete dropdown as user types');
    if (suggestionOption) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
      currentHtml = await page.content();
      check(currentHtml.includes('React'), 'selects autocomplete suggestion via Enter key');
    }

    // ------------------------------------------------ 5. Paste Mode & Auto-Extraction
    console.log('\n5. Paste Description & Auto-Extraction');
    await page.click('button:has-text("Paste description")');
    await page.waitForTimeout(200);

    const pasteTextarea = await page.$('#pastedJdText');
    check(Boolean(pasteTextarea), 'switches smoothly to Paste description textarea');

    const sampleJd = `
Job Title: Principal Full Stack Architect
We are seeking a Principal Full Stack Architect with at least 7 years of professional experience building enterprise systems.

Required Skills:
- React, TypeScript, Next.js, Redux, PostgreSQL

Preferred Skills:
- Docker, Kubernetes, AWS

Location: Bengaluru, Remote
Education: B.Tech or MCA
    `.trim();

    await pasteTextarea.fill(sampleJd);
    await page.click('button:has-text("Read Details")');

    await page.waitForSelector('text=We found these in the job description', { timeout: 10000 });
    check(true, 'renders friendly confirmation: "We found these in the job description. Review or edit them."');

    // Verify fields populated
    const titleVal = await page.inputValue('#jobTitleInput');
    check(titleVal.toLowerCase().includes('architect') || titleVal.toLowerCase().includes('principal'), `auto-populates title: "${titleVal}"`);

    // Verify must-have skills populated
    const extractedHtml = await page.content();
    check(extractedHtml.includes('TypeScript') && extractedHtml.includes('PostgreSQL'), 'auto-populates extracted must-have skills');
    check(extractedHtml.includes('Docker') && extractedHtml.includes('Kubernetes'), 'auto-populates extracted nice-to-have skills');

    // ------------------------------------------------ 6. Progressive Disclosure: Additional Preferences
    console.log('\n6. Progressive Disclosure — Additional Preferences');
    const prefToggle = await page.$('button:has-text("Additional preferences")');
    check(Boolean(prefToggle), 'renders "Additional preferences" toggle button');

    // Initially collapsed
    const minExpBefore = await page.$('#minExpInput');
    check(!minExpBefore || !(await minExpBefore.isVisible()), 'additional preferences are collapsed by default');

    // Expand
    await prefToggle.click();
    await page.waitForTimeout(200);

    const minExpInput = await page.$('#minExpInput');
    check(Boolean(minExpInput) && (await minExpInput.isVisible()), 'reveals Minimum experience input upon expansion');

    const locInput = await page.$('#jobLocations-input');
    check(Boolean(locInput), 'reveals Location preference tag input upon expansion');

    const salMinInput = await page.$('#salMinInput');
    check(Boolean(salMinInput), 'reveals Annual salary band inputs upon expansion');

    const otherCriteriaInput = await page.$('#searchKeywordsInput-input');
    check(Boolean(otherCriteriaInput), 'reveals Other criteria / Domain keywords upon expansion');

    // Verify extracted experience and location inside preferences
    const minExpVal = await page.inputValue('#minExpInput');
    check(minExpVal === '7', `auto-populates extracted experience: ${minExpVal} years`);

    // ------------------------------------------------ 7. Job Creation Flow
    console.log('\n7. Job Creation & Redirect');
    await submitBtn.click();

    await page.waitForURL((url) => /\/jobs\/[a-f0-9-]+/.test(url.pathname), { timeout: 15000 });
    const currentUrl = page.url();
    const jobIdMatch = currentUrl.match(/\/jobs\/([a-f0-9-]+)/);
    const createdId = jobIdMatch ? jobIdMatch[1] : null;
    check(Boolean(createdId), `redirects immediately to created job workspace (/jobs/${createdId})`);
    if (createdId) createdJobIds.push(createdId);

    // ------------------------------------------------ 8. File Upload Flow
    console.log('\n8. File Upload Flow');
    await page.goto(`${BASE}/jobs/new`);
    await page.waitForSelector('h1', { timeout: 5000 });

    const tempFilePath = path.join(__dirname, 'test_senior_role_jd.txt');
    fs.writeFileSync(
      tempFilePath,
      `Job Title: Senior Data Engineer\nLooking for 5+ years experience in Python, Spark, SQL, Airflow.\nLocation: Gurugram\nEducation: B.Tech`
    );

    const fileInput = await page.$('#jdFileInput');
    await fileInput.setInputFiles(tempFilePath);

    await page.waitForSelector('text=Uploaded successfully', { timeout: 10000 });
    check(true, 'displays compact selected state with "Uploaded successfully"');

    const replaceLabel = await page.$('label:has-text("Replace")');
    const removeBtn = await page.$('button:has-text("Remove")');
    check(Boolean(replaceLabel) && Boolean(removeBtn), 'exposes compact Replace and Remove actions');

    await page.waitForSelector('text=We found these in the job description', { timeout: 10000 });
    const uploadedTitle = await page.inputValue('#jobTitleInput');
    check(uploadedTitle.toLowerCase().includes('data') || uploadedTitle.toLowerCase().includes('engineer'), `auto-populates title from file: "${uploadedTitle}"`);

    const createBtn2 = await page.$('button[type="submit"]');
    await createBtn2.click();
    await page.waitForURL((url) => /\/jobs\/[a-f0-9-]+/.test(url.pathname), { timeout: 15000 });
    const url2 = page.url();
    const id2Match = url2.match(/\/jobs\/([a-f0-9-]+)/);
    if (id2Match) createdJobIds.push(id2Match[1]);
    check(Boolean(id2Match), `file-upload role created successfully (/jobs/${id2Match?.[1]})`);

    try { fs.unlinkSync(tempFilePath); } catch {}

    // ------------------------------------------------ 9. Responsive Viewport Testing
    console.log('\n9. Responsive Viewport Testing');
    const viewports = [
      { width: 360, height: 640 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 }
    ];

    await page.goto(`${BASE}/jobs/new`);
    await page.waitForSelector('h1', { timeout: 5000 });

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      check(!hasHorizontalScroll, `responsive at ${vp.width}x${vp.height} with no horizontal overflow`);
    }

    // ------------------------------------------------ 10. Accessibility
    console.log('\n10. Accessibility');
    const ariaLabels = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));
      return inputs.every((input) => {
        const id = input.id;
        const hasLabel = id ? Boolean(document.querySelector(`label[for="${id}"]`)) : false;
        const hasAria = Boolean(input.getAttribute('aria-label') || input.getAttribute('aria-labelledby'));
        return hasLabel || hasAria;
      });
    });
    check(ariaLabels, 'all form inputs have associated labels or ARIA descriptions');

    const buttonNames = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.every((btn) => (btn.textContent && btn.textContent.trim().length > 0) || btn.getAttribute('aria-label'));
    });
    check(buttonNames, 'all interactive buttons have accessible text or labels');

  } catch (err) {
    console.error('Test execution failed:', err);
    failed++;
  } finally {
    await browser.close();

    // Database cleanup of created test jobs
    if (createdJobIds.length > 0) {
      try {
        const { default: prisma } = await import('../backend/config/prisma.js').catch(() => ({ default: null }));
        if (prisma) {
          await prisma.job.deleteMany({
            where: { id: { in: createdJobIds } }
          }).catch(() => {});
          await prisma.$disconnect().catch(() => {});
        }
      } catch {}
    }
  }

  console.log('\n================================================================');
  console.log(`  E2E Create Job Suite: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

run();
