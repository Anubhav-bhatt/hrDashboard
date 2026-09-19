/** Reproducible regression run in a disposable local schema.
 * Requires the configured local PostgreSQL role to be able to create a schema.
 * Never modifies records in the configured application database.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../backend/package.json', import.meta.url));
require('dotenv').config({ path: path.join(root, 'backend/.env') });
const { PrismaClient } = require('@prisma/client');
const originalUrl = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(originalUrl.hostname)) throw new Error('Regression runner requires local PostgreSQL.');
/**
 * Isolation is a disposable schema rather than a disposable database.
 *
 * `CREATE DATABASE` needs the CREATEDB privilege, which the application role
 * does not have and should not be given, so this runner could not start at all.
 * A schema gives the same isolation — its own tables, dropped whole at the end —
 * using a privilege the role already has, and the application's own `public`
 * schema is never touched.
 */
const schema = `dashboard_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(originalUrl);
testUrl.searchParams.set('schema', schema);
const admin = new PrismaClient({ datasources: { db: { url: originalUrl.toString() } } });
let created = false;
let prisma;
let api;
let frontend;
const failures = [];
const run = (cmd, args, cwd, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { cwd, env, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', (code) => resolve(code === 0));
});

try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  created = true;
  process.env.DATABASE_URL = testUrl.toString();
  process.env.NODE_ENV = 'test';
  if (!await run(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], path.join(root, 'backend'))) throw new Error('Temporary schema setup failed');
  // Invoked directly rather than through `npm test`: on Windows `npm` is a .cmd
  // shim that spawn() cannot resolve without a shell, and this is the same command.
  if (!await run(process.execPath, ['tests/runAll.js'], path.join(root, 'backend'))) failures.push('Backend');

  prisma = require('../backend/config/prisma');
  const { hashPassword } = require('../backend/services/authService');
  const { ensureWorkspaceForUser } = require('../backend/services/workspaceService');
  const email = 'dashboard.recruiter@example.invalid';
  const password = randomUUID();
  const seededUser = await prisma.user.create({ data: { email, name: 'Test Recruiter', passwordHash: await hashPassword(password), role: 'ADMIN' } });
  // Jobs are workspace-owned; the fixture recruiter needs one to own them.
  const seededWorkspaceId = await ensureWorkspaceForUser(prisma, { userId: seededUser.id, userName: 'Test Recruiter', email });
  const titles = ['React Developer', 'Platform Engineer', 'Data Analyst', 'Product Designer', 'QA Engineer', 'Customer Operations', 'Older Backend Role'];
  for (let j = 0; j < titles.length; j++) {
    const job = await prisma.job.create({ data: {
      workspaceId: seededWorkspaceId,
      title: titles[j], jdFileName: 'test-role.txt', jdMimeType: 'text/plain', jdText: 'React and TypeScript. Minimum 2 years.',
      requiredSkills: ['React', 'TypeScript'], preferredSkills: ['Node.js'], roleKeywords: ['developer'],
      preferredEducation: ['B.Tech'], minimumExperience: 2, createdAt: new Date(Date.now() - j * 86400000)
    } });
    const count = j === 3 ? 0 : j === 0 ? 8 : 2;
    for (let i = 0; i < count; i++) {
      const main = j === 0 && i === 0;
      const candidate = await prisma.candidate.create({ data: {
        jobId: job.id, name: main ? 'Rahul Sharma' : `Candidate ${j}-${i}`,
        email: main ? 'rahul.sharma@example.com' : `candidate-${j}-${i}@example.invalid`,
        phone: main ? '+919876543210' : null, currentRole: 'Senior React Developer',
        headline: 'Senior React Developer', currentLocation: 'Gurugram', totalExperience: 4.5,
        qualification: 'B.Tech', skills: ['React', 'TypeScript', 'Node.js'],
        summary: 'Experienced React developer with a focus on reliable applications.',
        linkedinUrl: main ? 'https://linkedin.com/in/rahulsharma' : null,
        githubUrl: main ? 'https://github.com/rahulsharma' : null,
        source: 'MANUAL', outlookMessageId: randomUUID(), outlookAttachmentId: randomUUID(),
        resumeFileName: 'test-resume.txt', resumeMimeType: 'text/plain', resumeData: Buffer.from('Test resume'), resumeSize: 11,
        resumeText: 'Rahul Sharma. Experienced React developer. React TypeScript Node.js B.Tech.',
        overallScore: j === 6 ? null : main ? 94 : [89.5, 80, 75, 65, 50][i % 5],
        hrStatus: main || j === 4 ? 'SHORTLISTED' : j === 5 ? 'NOT_SUITABLE' : i % 2 ? 'NEEDS_REVIEW' : 'REVIEW',
        parsedProfile: {
          experience: [
            { title: 'Senior React Developer', company: 'ABC Technologies', isCurrent: true, startDate: 'Jan 2022', endDate: 'Present', highlights: ['Built accessible dashboards.'] },
            { title: 'Developer', company: 'XYZ Technologies', startDate: 'Jan 2020', endDate: 'Dec 2021' }
          ],
          education: [{ degree: 'B.Tech', institution: 'Test University', grade: 'CGPA 8.4' }],
          certifications: [{ name: 'AWS Certified Developer' }], projects: [], languages: [{ name: 'English' }]
        }
      } });
      await prisma.candidateActivity.create({ data: { candidateId: candidate.id, type: 'IMPORTED', description: 'Resume imported', actorName: 'System' } });
    }
  }
  const frontendPort = 4185;
  const backendPort = 5099;
  const base = `http://127.0.0.1:${frontendPort}`;
  process.env.FRONTEND_URL = base;
  process.env.API_RATE_LIMIT = '10000';
  // Several suites sign in repeatedly from one address; the production budget of
  // 20 sign-ins per 10 minutes is right for a login form and wrong for a test run.
  process.env.LOGIN_RATE_LIMIT = '1000';
  process.env.REFRESH_RATE_LIMIT = '1000';
  const app = require('../backend/server');
  api = http.createServer(app);
  await new Promise((resolve, reject) => { api.once('error', reject); api.listen(backendPort, '127.0.0.1', resolve); });
  frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], {
    cwd: path.join(root, 'frontend'), stdio: 'inherit',
    // Same origin for the page and the API, with Vite's dev proxy standing in
    // for the Vercel rewrite. This is the shape production has, and the shape
    // the auth cookies depend on.
    env: { ...process.env, VITE_API_URL: '/api', VITE_DEV_API_PROXY: `http://127.0.0.1:${backendPort}` }
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Frontend did not start');
  const env = { ...process.env, E2E_BASE_URL: base, E2E_EMAIL: email, E2E_PASSWORD: password, E2E_BROWSER: 'chromium' };
  for (const suite of ['auth-session.mjs', 'auth-signup.mjs', 'dashboard.mjs', 'scenarios.mjs', 'accessibility.mjs']) {
    if (!await run(process.execPath, [suite], path.join(root, 'e2e'), env)) failures.push(suite);
  }
} catch (error) {
  // Avoid logging connection URLs or environment values.
  console.error('Regression run could not finish:', error.code || error.name);
  failures.push('Runner');
} finally {
  if (frontend && frontend.exitCode === null) {
    const stopped = new Promise((resolve) => frontend.once('exit', resolve));
    frontend.kill('SIGTERM');
    await stopped;
  }
  if (api) await new Promise((resolve) => api.close(resolve));
  if (prisma) await prisma.$disconnect();
  if (created) {
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    console.log('Removed the disposable regression schema; application records were untouched.');
  }
  await admin.$disconnect();
}
console.log(failures.length ? `Regression failures: ${failures.join(', ')}` : 'All regression suites passed.');
process.exit(failures.length ? 1 : 0);
