/**
 * Seeds a deterministic dataset for VISUAL / UI acceptance only.
 *
 *   node tests/seedVisualFixtures.js
 *
 * Why this exists
 * ---------------
 * A development database that has been cleaned of E2E fixtures holds one job.
 * A dashboard cannot be evaluated against one job: the attention queue, the
 * active-hiring index and the metric band all need several roles at different
 * stages, and the empty and "nothing waiting" states need roles that genuinely
 * sit at those stages. Screenshotting a one-job workspace and calling the design
 * reviewed would be a fiction.
 *
 * Scores are written directly
 * ---------------------------
 * `Candidate.overallScore` stays backend-authoritative in the product:
 * `services/candidateMatcher.js` remains the only thing that computes a score,
 * nothing here touches it, and no scoring weight, threshold or fallback is
 * changed. This file writes the score column the way a fixture writes any other
 * column, so that a known distribution can be rendered. It lives in tests/,
 * refuses to run in production, and tags every record it creates.
 *
 * Determinism
 * -----------
 * A fixed-seed PRNG, so two runs produce identical data and a screenshot taken
 * today can be compared with one taken next week.
 *
 * Removal
 * -------
 * Every job title begins with the FIXTURE_TAG below, which
 * `tests/cleanupE2EFixtures.js` knows about. Nothing here is identified by age,
 * candidate count, role name or status.
 */
require('dotenv').config();
const prisma = require('../config/prisma');

/** The marker every visual fixture carries. Also listed in cleanupE2EFixtures.js. */
const FIXTURE_TAG = 'visualaudit';

/* ── Production guard ──────────────────────────────────────────────────────
 * Two independent conditions, because a fixture seeder that runs against real
 * recruitment data is not a bug you get to fix afterwards.
 */
const abortIfProduction = () => {
  const env = (process.env.NODE_ENV || '').toLowerCase();
  if (env === 'production') {
    console.error('[seedVisualFixtures] NODE_ENV=production. Refusing to seed fixture data.');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL || '';
  if (/\b(prod|production)\b/i.test(url)) {
    console.error('[seedVisualFixtures] DATABASE_URL looks like a production database. Refusing to seed.');
    process.exit(1);
  }
};

/** Deterministic PRNG (mulberry32) so the dataset is reproducible. */
const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const FIRST = ['Aarav', 'Priya', 'Rahul', 'Ananya', 'Vikram', 'Sneha', 'Karthik', 'Meera', 'Arjun', 'Divya',
  'Rohan', 'Kavya', 'Siddharth', 'Nisha', 'Aditya', 'Pooja', 'Manish', 'Ritu', 'Varun', 'Shreya'];
const LAST = ['Sharma', 'Iyer', 'Verma', 'Nair', 'Reddy', 'Kulkarni', 'Menon', 'Bose', 'Chandra', 'Rao',
  'Joshi', 'Pillai', 'Gupta', 'Desai', 'Kapoor', 'Banerjee'];
const CITIES = ['Bengaluru', 'Gurugram', 'Pune', 'Hyderabad', 'Chennai', 'Noida', 'Mumbai', 'Remote'];

/**
 * The roles. Each is shaped to land a job on a DIFFERENT branch of
 * `deriveNextAction`, so the dashboard's recommendation logic is exercised
 * across its whole range rather than repeatedly hitting one case.
 */
const ROLES = [
  {
    title: 'Senior React Developer',
    required: ['React', 'TypeScript', 'Node.js'],
    preferred: ['Next.js', 'GraphQL'],
    minExp: 5,
    count: 80,
    scored: true,
    strong: 14,          // clears the 80% threshold
    shortlisted: 0,
    needsReview: 6,
    notSuitable: 9,
    exercises: 'review-strong — strong candidates waiting for a first look'
  },
  {
    title: 'Backend Engineer',
    required: ['Node.js', 'PostgreSQL', 'REST API'],
    preferred: ['Docker', 'AWS'],
    minExp: 4,
    count: 32,
    scored: true,
    strong: 7,
    shortlisted: 4,      // a shortlist means a decision is pending
    needsReview: 3,
    notSuitable: 5,
    exercises: 'decide — shortlist ready for a final decision'
  },
  {
    title: 'Product Designer',
    required: ['Figma', 'Design Systems'],
    preferred: ['Prototyping'],
    minExp: 3,
    count: 18,
    scored: false,       // ingested but never scored
    strong: 0,
    shortlisted: 0,
    needsReview: 0,
    notSuitable: 0,
    exercises: 'score — candidates present, none scored'
  },
  {
    title: 'Data Analyst',
    required: ['SQL', 'Python'],
    preferred: ['Tableau'],
    minExp: 2,
    count: 0,
    scored: true,
    strong: 0,
    shortlisted: 0,
    needsReview: 0,
    notSuitable: 0,
    exercises: 'add-candidates — empty pool'
  },
  {
    title: 'QA Engineer',
    required: ['Selenium', 'Test Automation'],
    preferred: ['Playwright'],
    minExp: 3,
    count: 8,
    scored: true,
    strong: 0,           // deliberately nobody clears the bar
    shortlisted: 0,
    needsReview: 2,
    notSuitable: 3,
    exercises: 'review-all — a scored pool with no strong match'
  },
  {
    title: 'DevOps Engineer',
    required: ['Kubernetes', 'Terraform', 'AWS'],
    preferred: ['Go'],
    minExp: 6,
    count: 45,
    scored: true,
    strong: 9,
    shortlisted: 2,
    needsReview: 4,
    notSuitable: 11,
    exercises: 'decide — a second role competing for attention'
  },
  {
    title: 'Platform Engineer',
    required: ['Go', 'Kubernetes'],
    preferred: ['gRPC'],
    minExp: 5,
    count: 24,
    scored: true,
    strong: 5,
    shortlisted: 3,
    needsReview: 2,
    notSuitable: 6,
    closed: true,        // hired — exercises the closed-job relationship
    exercises: 'closed role with a SELECTED hire'
  }
];

/**
 * A believable score, weighted toward the middle.
 *
 * Deliberately NOT a pool of 90s. A dashboard that only ever renders excellent
 * candidates hides exactly the states a recruiter needs the design to handle:
 * mediocre pools, and roles where nobody is good enough yet.
 */
const scoreFor = (rand, strong) => {
  if (strong) return 80 + Math.floor(rand() * 16); // 80-95
  const roll = rand();
  if (roll < 0.30) return 68 + Math.floor(rand() * 11); // 68-78  good
  if (roll < 0.70) return 52 + Math.floor(rand() * 15); // 52-66  partial
  return 31 + Math.floor(rand() * 20);                  // 31-50  low
};

const bandLabel = (score) => {
  if (score >= 90) return 'Excellent Alignment';
  if (score >= 80) return 'Strong Alignment';
  if (score >= 70) return 'Good Alignment';
  if (score >= 60) return 'Partial Alignment';
  return 'Low Alignment';
};

(async () => {
  abortIfProduction();

  const existing = await prisma.job.count({
    where: { title: { startsWith: FIXTURE_TAG, mode: 'insensitive' } }
  });
  if (existing > 0) {
    console.error(`[seedVisualFixtures] ${existing} visual fixture job(s) already exist.`);
    console.error('Run "node tests/cleanupE2EFixtures.js" first so the dataset stays deterministic.');
    process.exit(1);
  }

  const actor = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  const rand = rng(20260831);
  let createdJobs = 0;
  let createdCandidates = 0;

  for (const [index, role] of ROLES.entries()) {
    const job = await prisma.job.create({
      data: {
        title: `${FIXTURE_TAG} ${role.title}`,
        jdFileName: `${role.title.toLowerCase().replace(/\s+/g, '-')}-jd.pdf`,
        jdMimeType: 'application/pdf',
        jdText: `${role.title}\n\nWe are hiring a ${role.title}. Required: ${role.required.join(', ')}. ` +
          `Preferred: ${role.preferred.join(', ')}. Minimum ${role.minExp} years of experience.`,
        requiredSkills: role.required,
        preferredSkills: role.preferred,
        roleKeywords: role.title.split(' '),
        minimumExperience: role.minExp,
        preferredEducation: ['B.Tech', 'B.E.'],
        preferredLocations: ['Bengaluru', 'Gurugram', 'Remote'],
        searchKeywords: role.required
      }
    });
    createdJobs++;

    // Assign statuses deterministically: strong first, then the flagged buckets.
    const rows = [];
    for (let i = 0; i < role.count; i++) {
      const isStrong = i < role.strong;
      const score = role.scored ? scoreFor(rand, isStrong) : null;
      const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;

      let hrStatus = 'REVIEW';
      if (i < role.shortlisted) hrStatus = 'SHORTLISTED';
      else if (i < role.shortlisted + role.needsReview) hrStatus = 'NEEDS_REVIEW';
      else if (i >= role.count - role.notSuitable) hrStatus = 'NOT_SUITABLE';

      const matched = role.required.filter(() => rand() > (isStrong ? 0.15 : 0.55));
      rows.push({
        jobId: job.id,
        name,
        email: `${name.toLowerCase().replace(/\s+/g, '.')}.${i}@example.test`,
        phone: `+9198${String(10000000 + Math.floor(rand() * 89999999)).slice(0, 8)}`,
        currentRole: role.title.replace('Senior ', ''),
        headline: `${role.title.replace('Senior ', '')} · ${role.required[0]}`,
        totalExperience: Math.round((role.minExp - 2 + rand() * 7) * 10) / 10,
        currentLocation: CITIES[Math.floor(rand() * CITIES.length)],
        qualification: rand() > 0.5 ? 'B.Tech' : 'M.Tech',
        skills: [...new Set([...matched, ...role.preferred.filter(() => rand() > 0.6)])],
        education: ['B.Tech Computer Science'],
        source: 'MANUAL_BULK',
        outlookMessageId: `${FIXTURE_TAG}_msg_${index}_${i}`,
        outlookAttachmentId: `${FIXTURE_TAG}_att_${index}_${i}`,
        resumeFileName: `${name.toLowerCase().replace(/\s+/g, '-')}.pdf`,
        resumeMimeType: 'application/pdf',
        extractionStatus: 'SUCCESS',
        hrStatus,
        ...(score !== null
          ? {
              overallScore: score,
              alignmentLabel: bandLabel(score),
              matchedSkills: matched,
              missingRequiredSkills: role.required.filter((s) => !matched.includes(s)),
              analyzedAt: new Date()
            }
          : {})
      });
    }

    if (rows.length) {
      await prisma.candidate.createMany({ data: rows });
      createdCandidates += rows.length;
    }

    /*
     * Closure, done the way the product does it: a candidate becomes SELECTED
     * only as part of closing the job, and only from SHORTLISTED. Seeding an
     * OPEN job with a SELECTED candidate would create a state the application
     * cannot produce and the UI is not built to render.
     */
    if (role.closed) {
      const hire = await prisma.candidate.findFirst({
        where: { jobId: job.id, hrStatus: 'SHORTLISTED' },
        orderBy: { overallScore: 'desc' }
      });
      if (hire) {
        await prisma.candidate.update({
          where: { id: hire.id },
          data: { hrStatus: 'SELECTED', selectedAt: new Date(), selectedByUserId: actor?.id ?? null }
        });
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'CLOSED',
            selectedCandidateId: hire.id,
            closedAt: new Date(),
            closedByUserId: actor?.id ?? null
          }
        });
      }
    }

    console.log(`  ${role.count.toString().padStart(3)} candidates  ${role.title.padEnd(24)} ${role.exercises}`);
  }

  console.log(`\nSeeded ${createdJobs} jobs and ${createdCandidates} candidates tagged "${FIXTURE_TAG}".`);
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error('[seedVisualFixtures] failed:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
