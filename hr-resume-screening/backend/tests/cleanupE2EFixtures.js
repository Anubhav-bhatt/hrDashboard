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

const TAGS = ['e2eclosure', 'e2erank', 'e2ecomp'];

(async () => {
  const jobs = await prisma.job.findMany({
    where: { OR: TAGS.map((tag) => ({ title: { contains: tag, mode: 'insensitive' } })) },
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
