/**
 * Runs every backend suite in sequence and exits non-zero if any suite fails.
 *
 *   npm test
 *
 * The API suite needs a reachable PostgreSQL database (DATABASE_URL). When the
 * database is unavailable that suite is reported as skipped rather than failing
 * the whole run, so unit tests remain useful on a machine without a database.
 */
require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

const SUITES = [
  { name: 'Unit', file: 'unit.test.js', requiresDatabase: false },
  { name: 'Scoring & ranking baseline', file: 'scoringBaseline.test.js', requiresDatabase: false },
  { name: 'Scoring & parsing (legacy phase 4)', file: 'phase4.test.js', requiresDatabase: false },
  { name: 'Outlook & matching (legacy phase 5)', file: 'phase5.test.js', requiresDatabase: false },
  { name: 'AI foundation (flags, provider, orchestrator)', file: 'aiFoundation.test.js', requiresDatabase: false },
  { name: 'API integration', file: 'api.test.js', requiresDatabase: true },
  { name: 'Jobs portal & job-wise dashboard', file: 'jobPortal.test.js', requiresDatabase: true },
  { name: 'Job closure & candidate selection', file: 'jobClosure.test.js', requiresDatabase: true },
  { name: 'AI API (POST /api/ai/run)', file: 'aiApi.test.js', requiresDatabase: true }
];

const runSuite = (file) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
    child.on('close', (code) => resolve(code === 0));
  });

const databaseReachable = async () => {
  const prisma = require('../config/prisma');
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
};

const run = async () => {
  const hasDatabase = await databaseReachable();
  if (!hasDatabase) {
    console.log('\n[runAll] PostgreSQL is not reachable — database-backed suites will be skipped.');
  }

  const results = [];

  for (const suite of SUITES) {
    if (suite.requiresDatabase && !hasDatabase) {
      results.push({ name: suite.name, status: 'SKIPPED' });
      continue;
    }
    const ok = await runSuite(suite.file);
    results.push({ name: suite.name, status: ok ? 'PASSED' : 'FAILED' });
  }

  console.log('\n================================================================');
  console.log('  Backend test summary');
  console.log('================================================================');
  for (const result of results) {
    console.log(`  ${result.status.padEnd(8)} ${result.name}`);
  }
  console.log('================================================================\n');

  const failedCount = results.filter((r) => r.status === 'FAILED').length;
  process.exit(failedCount > 0 ? 1 : 0);
};

run();
