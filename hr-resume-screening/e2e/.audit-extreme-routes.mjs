import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'msedge' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const exceptions = [];
const consoleErrors = [];
const failedResponses = [];

page.on('pageerror', (error) => exceptions.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`);
});

await page.goto(`${process.env.E2E_BASE_URL}/login`);
await page.locator('#email').fill(process.env.E2E_EMAIL);
await page.locator('#password').fill(process.env.E2E_PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForURL((url) => !url.pathname.endsWith('/login'));

const jobsResponse = await page.request.get(`${process.env.E2E_BASE_URL}/api/jobs/summary?limit=100&sort=newest`);
const jobsPayload = await jobsResponse.json();
const job = (jobsPayload.data || []).find((item) => (item.candidateCount || 0) > 0) || (jobsPayload.data || [])[0];
let candidate = null;
if (job) {
  const candidatesResponse = await page.request.get(`${process.env.E2E_BASE_URL}/api/jobs/${job.id}/candidates?limit=1&sort=score_desc`);
  const candidatesPayload = await candidatesResponse.json();
  candidate = (candidatesPayload.data || [])[0] || null;
}

const routes = [
  '/',
  '/jobs',
  '/jobs/new',
  '/jobs/closed',
  '/candidates',
  '/settings',
  '/ai',
  '/ai/screening',
  '/ai/ranking',
  '/ai/comparison',
  '/ai/insights',
  ...(job ? [`/jobs/${job.id}`, `/jobs/${job.id}/candidates`, `/jobs/${job.id}/import`] : []),
  ...(candidate ? [`/candidates/${candidate._id}`] : [])
];

const results = [];
for (const width of [360, 1920]) {
  await page.setViewportSize({ width, height: width === 360 ? 800 : 1080 });
  for (const route of routes) {
    await page.goto(`${process.env.E2E_BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
    await page.locator('main').waitFor({ state: 'visible' });
    await page.waitForTimeout(350);
    results.push(await page.evaluate(({ width, route }) => {
      const main = document.querySelector('main');
      const desktopSidebar = document.querySelector('aside.hidden.lg\\:flex');
      const mobileTrigger = document.querySelector('button[aria-label="Open navigation menu"]');
      return {
        width,
        route,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        mainHasContent: (main?.innerText || '').trim().length > 12,
        desktopSidebarVisible: desktopSidebar ? getComputedStyle(desktopSidebar).display !== 'none' : false,
        mobileTriggerVisible: mobileTrigger ? getComputedStyle(mobileTrigger).display !== 'none' : false
      };
    }, { width, route }));
  }
}

console.log(JSON.stringify({
  routeCount: routes.length,
  checks: results.length,
  failures: results.filter((item) => item.overflow || !item.mainHasContent),
  shellAt360: results.find((item) => item.width === 360 && item.route === '/'),
  shellAt1920: results.find((item) => item.width === 1920 && item.route === '/'),
  exceptions,
  consoleErrors,
  failedResponses
}));

await browser.close();
