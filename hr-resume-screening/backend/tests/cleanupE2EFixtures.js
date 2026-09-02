/**
 * Removes jobs (and their candidates, notes and activity) created by the
 * browser E2E suites.
 *
 * The API deliberately has no job-delete route — closing a job preserves its
 * history rather than destroying it — so test fixtures are cleaned up here
 * instead. Only jobs whose title carries an E2E fixture tag are touched.
 *
 *   node tests/cleanupE2EFixtures.js
 */
require('dotenv').config();
const prisma = require('../config/prisma');

/*
 * Every prefix the browser suites stamp onto a fixture job title.
 *
 * `e2eaudit` was missing, so two fixture jobs created by the audit runs — one
 * of them a CLOSED job carrying 12 candidates — survived every cleanup and
 * accumulated in the development database indefinitely. A tag that no cleanup
 * knows about is worse than no tag at all: it looks deliberate and reads as
 * real data.
 *
 * Anything added here must be a prefix only the suites generate. A tag that
 * could occur in a real job title would make this script destructive.
 */
const TAGS = ['e2eclosure', 'e2erank', 'e2ecomp', 'e2eaudit', 'e2esimpl', 'visualaudit', 'e2edelete'];

/*
 * Optional `--tag=<prefix>` restricts the run to one marker.
 *
 * A suite that creates a fixture needs to remove its own records without
 * touching anyone else's — calling the unscoped script from inside a test run
 * would delete every other fixture in the database, including the visual-audit
 * dataset a screenshot comparison depends on. The argument must still match one
 * of the recognised TAGS below, so this narrows the blast radius and can never
 * widen it into genuine data.
 */
const tagArg = (process.argv.find((arg) => arg.startsWith('--tag=')) || '').slice('--tag='.length).trim();
const activeTags = tagArg
  ? TAGS.filter((tag) => tagArg.toLowerCase().startsWith(tag))
  : TAGS;

if (tagArg && activeTags.length === 0) {
  console.error(`Refusing to clean up "${tagArg}": it is not a recognised fixture tag.`);
  process.exit(1);
}

(async () => {
  const jobs = await prisma.job.findMany({
    where: tagArg
      ? { title: { contains: tagArg, mode: 'insensitive' } }
      : { OR: TAGS.map((tag) => ({ title: { contains: tag, mode: 'insensitive' } })) },
    select: { id: true, title: true }
  });

  if (jobs.length === 0) {
    console.log('No E2E fixture jobs found.');
    await prisma.$disconnect();
    return;
  }

  const jobIds = jobs.map((job) => job.id);
  const candidates = await prisma.candidate.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } });
  const candidateIds = candidates.map((candidate) => candidate.id);

  // Clear the job -> selected candidate reference before the candidates go.
  await prisma.job.updateMany({ where: { id: { in: jobIds } }, data: { selectedCandidateId: null } });
  await prisma.candidateActivity.deleteMany({ where: { candidateId: { in: candidateIds } } });
  await prisma.candidateNote.deleteMany({ where: { candidateId: { in: candidateIds } } });
  await prisma.candidate.deleteMany({ where: { id: { in: candidateIds } } });
  await prisma.importSession.deleteMany({ where: { jobId: { in: jobIds } } });
  await prisma.job.deleteMany({ where: { id: { in: jobIds } } });

  console.log(`Removed ${jobs.length} fixture job(s) and ${candidateIds.length} candidate(s):`);
  jobs.forEach((job) => console.log(`  - ${job.title}`));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error('Cleanup failed:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
