/** Reproducible regression run in a disposable local database.
 * Requires the configured local PostgreSQL role to have CREATEDB permission.
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
const database = `dashboard_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(originalUrl);
testUrl.pathname = `/${database}`;
testUrl.searchParams.set('schema', 'public');
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
  await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
  created = true;
  process.env.DATABASE_URL = testUrl.toString();
  process.env.NODE_ENV = 'test';
  if (!await run(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], path.join(root, 'backend'))) throw new Error('Temporary schema setup failed');
  if (!await run('npm', ['test'], path.join(root, 'backend'))) failures.push('Backend');

  prisma = require('../backend/config/prisma');
  const { hashPassword } = require('../backend/services/authService');
  const email = 'dashboard.recruiter@example.invalid';
  const password = randomUUID();
  await prisma.user.create({ data: { email, name: 'Test Recruiter', passwordHash: await hashPassword(password), role: 'ADMIN' } });
  const titles = ['React Developer', 'Platform Engineer', 'Data Analyst', 'Product Designer', 'QA Engineer', 'Customer Operations', 'Older Backend Role'];
  for (let j = 0; j < titles.length; j++) {
    const job = await prisma.job.create({ data: {
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
  const app = require('../backend/server');
  api = http.createServer(app);
  await new Promise((resolve, reject) => { api.once('error', reject); api.listen(backendPort, '127.0.0.1', resolve); });
  frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], {
    cwd: path.join(root, 'frontend'), stdio: 'inherit', env: { ...process.env, VITE_API_URL: `http://127.0.0.1:${backendPort}/api` }
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Frontend did not start');
  const env = { ...process.env, E2E_BASE_URL: base, E2E_EMAIL: email, E2E_PASSWORD: password, E2E_BROWSER: 'chromium' };
  for (const suite of ['dashboard.mjs', 'scenarios.mjs', 'accessibility.mjs']) {
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
    await admin.$executeRawUnsafe(`DROP DATABASE "${database}"`);
    console.log('Removed the disposable regression database; application records were untouched.');
  }
  await admin.$disconnect();
}
console.log(failures.length ? `Regression failures: ${failures.join(', ')}` : 'All regression suites passed.');
process.exit(failures.length ? 1 : 0);
