/**
 * Runs the authentication suite across browser engines, against a disposable
 * database and a same-origin frontend.
 *
 *   node run-auth-matrix.mjs                 # chromium, firefox, webkit
 *   E2E_BROWSERS=webkit node run-auth-matrix.mjs
 *
 * The frontend is served with `VITE_API_URL=/api` and the dev proxy pointed at
 * the backend, so the page and the API share an origin. That is the same shape
 * production has through the Vercel rewrite, and it is the shape the Safari fix
 * depends on — running this against a cross-origin API would prove nothing
 * about the bug it exists to catch.
 *
 * Requires the configured local PostgreSQL role to be able to create a schema.
 * Never touches records in the configured application database.
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
if (!['localhost', '127.0.0.1'].includes(originalUrl.hostname)) {
  throw new Error('The auth matrix runner requires a local PostgreSQL server.');
}

const BROWSERS = (process.env.E2E_BROWSERS || 'chromium,firefox,webkit')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

/**
 * Isolation is a disposable *schema* rather than a disposable database.
 *
 * Creating a database needs CREATEDB, which the application role does not have
 * and should not be given. A schema in the same database gives the same
 * isolation — its own tables, dropped whole at the end — using a privilege the
 * role already has, and never touches the application's own `public` schema.
 */
const schema = `auth_matrix_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(originalUrl);
testUrl.searchParams.set('schema', schema);

const admin = new PrismaClient({ datasources: { db: { url: originalUrl.toString() } } });

let created = false;
let prisma;
let api;
let frontend;
const results = [];

const run = (cmd, args, cwd, env = process.env) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code === 0));
  });

try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  created = true;

  process.env.DATABASE_URL = testUrl.toString();
  process.env.NODE_ENV = 'test';

  // `db push`, not `migrate deploy`, and deliberately so.
  //
  // This repository's migration directory is not a complete history: the schema
  // was originally created with `db push`, and the one pre-existing migration
  // ALTERs tables it never creates. `migrate deploy` therefore cannot build an
  // empty schema — it fails on `relation "Candidate" does not exist`. Pushing
  // the schema is how a fresh database is bootstrapped here (run-regression.mjs
  // does the same), while `migrate deploy` remains the production path against
  // a database that already has those tables. See docs on deployment ordering.
  if (
    !(await run(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'],
      path.join(root, 'backend')
    ))
  ) {
    throw new Error('Schema setup failed on the disposable schema');
  }

  prisma = require('../backend/config/prisma');
  const { hashPassword } = require('../backend/services/authService');
  const { ensureWorkspaceForUser } = require('../backend/services/workspaceService');

  const email = 'auth.matrix@example.invalid';
  const password = randomUUID();
  const seededUser = await prisma.user.create({
    data: { email, name: 'Auth Matrix Recruiter', passwordHash: await hashPassword(password), role: 'ADMIN' }
  });
  // Jobs are workspace-owned and requireAuth refuses an account without one, so
  // the seeded recruiter gets a workspace exactly as a signed-up account would.
  const seededWorkspaceId = await ensureWorkspaceForUser(prisma, {
    userId: seededUser.id,
    userName: 'Auth Matrix Recruiter',
    email
  });

  // One job so the dashboard and jobs routes render something real.
  await prisma.job.create({
    data: {
      workspaceId: seededWorkspaceId,
      title: 'Auth Matrix Role',
      jdFileName: 'role.txt',
      jdMimeType: 'text/plain',
      jdText: 'React and TypeScript. Minimum 2 years.',
      requiredSkills: ['React'],
      preferredSkills: [],
      roleKeywords: ['developer'],
      preferredEducation: [],
      minimumExperience: 2
    }
  });

  const frontendPort = 4195;
  const backendPort = 5098;
  const base = `http://127.0.0.1:${frontendPort}`;

  // The frontend origin is the only trusted one, exactly as in production.
  process.env.FRONTEND_URL = base;
  process.env.API_RATE_LIMIT = '10000';
  process.env.LOGIN_RATE_LIMIT = '1000';
  process.env.REFRESH_RATE_LIMIT = '1000';

  const app = require('../backend/server');
  api = http.createServer(app);
  await new Promise((resolve, reject) => {
    api.once('error', reject);
    api.listen(backendPort, '127.0.0.1', resolve);
  });

  frontend = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'],
    {
      cwd: path.join(root, 'frontend'),
      stdio: 'inherit',
      env: {
        ...process.env,
        // Same origin: the page calls /api on itself and Vite forwards it,
        // standing in for the Vercel rewrite.
        VITE_API_URL: '/api',
        VITE_DEV_API_PROXY: `http://127.0.0.1:${backendPort}`
      }
    }
  );

  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Frontend did not start');

  // Confirm the proxy really is same-origin before drawing conclusions from it.
  const proxied = await fetch(`${base}/api/health`);
  const contentType = proxied.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Same-origin /api is not reaching the backend (content-type: ${contentType})`);
  }
  console.log('\nSame-origin /api proxy verified: the page and the API share an origin.\n');

  for (const browserName of BROWSERS) {
    const env = {
      ...process.env,
      E2E_BASE_URL: base,
      E2E_EMAIL: email,
      E2E_PASSWORD: password,
      E2E_BROWSER: browserName
    };
    // Both suites run per engine: sessions and rotation, then signup and the
    // first run a brand-new account sees.
    const sessionOk = await run(process.execPath, ['auth-session.mjs'], path.join(root, 'e2e'), env);
    const signupOk = await run(process.execPath, ['auth-signup.mjs'], path.join(root, 'e2e'), env);
    results.push({ browser: browserName, ok: sessionOk && signupOk, sessionOk, signupOk });
  }
} catch (error) {
  // Never log connection strings or environment values.
  console.error('Auth matrix could not finish:', error.message || error.code || error.name);
  results.push({ browser: 'runner', ok: false });
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
    console.log('Removed the disposable schema; application records were untouched.');
  }
  await admin.$disconnect();
}

console.log('\n================ Browser matrix ================');
for (const { browser, ok, sessionOk, signupOk } of results) {
  const detail = sessionOk === undefined ? '' : ` (session ${sessionOk ? 'PASS' : 'FAIL'}, signup ${signupOk ? 'PASS' : 'FAIL'})`;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${browser}${detail}`);
}
console.log('================================================\n');

process.exit(results.some((r) => !r.ok) ? 1 : 0);
