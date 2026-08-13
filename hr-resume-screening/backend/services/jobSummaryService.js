const prisma = require('../config/prisma');
const { STRONG_MATCH_MIN, EXCELLENT_MATCH_MIN, PENDING_REVIEW_STATUSES } = require('../utils/scoreThresholds');

/**
 * Per-job candidate statistics, aggregated in PostgreSQL.
 *
 * The cost is a fixed four grouped queries regardless of how many jobs exist.
 * The previous implementation issued three counts per job inside a Promise.all,
 * so a workspace with fifty jobs produced a hundred and fifty round trips. No
 * candidate rows are loaded into memory to compute these numbers.
 *
 * @param {string[]} [jobIds] Restrict aggregation to these jobs; omit for all
 * @returns {Promise<Map<string, Object>>} jobId -> statistics
 */
const getCandidateStatsByJob = async (jobIds = null) => {
  const scope = jobIds && jobIds.length ? { jobId: { in: jobIds } } : {};

  const [totals, statusGroups, strongGroups, analyzedGroups] = await Promise.all([
    // Candidate count and best score per job.
    prisma.candidate.groupBy({
      by: ['jobId'],
      where: scope,
      _count: { _all: true },
      _max: { overallScore: true },
      _avg: { overallScore: true }
    }),
    // HR status breakdown per job.
    prisma.candidate.groupBy({
      by: ['jobId', 'hrStatus'],
      where: scope,
      _count: { _all: true }
    }),
    // Strong matches per job, using the shared threshold.
    prisma.candidate.groupBy({
      by: ['jobId'],
      where: { ...scope, overallScore: { gte: STRONG_MATCH_MIN } },
      _count: { _all: true }
    }),
    // Scored candidates per job.
    prisma.candidate.groupBy({
      by: ['jobId'],
      where: { ...scope, overallScore: { not: null } },
      _count: { _all: true }
    })
  ]);

  const stats = new Map();

  const ensure = (jobId) => {
    if (!stats.has(jobId)) {
      stats.set(jobId, {
        candidateCount: 0,
        analyzedCount: 0,
        strongMatchCount: 0,
        shortlistedCount: 0,
        needsReviewCount: 0,
        pendingReviewCount: 0,
        notSuitableCount: 0,
        inReviewCount: 0,
        bestMatchScore: null,
        averageMatchScore: null
      });
    }
    return stats.get(jobId);
  };

  for (const row of totals) {
    const entry = ensure(row.jobId);
    entry.candidateCount = row._count._all;
    entry.bestMatchScore = row._max.overallScore ?? null;
    entry.averageMatchScore =
      row._avg.overallScore !== null && row._avg.overallScore !== undefined
        ? Math.round(row._avg.overallScore * 10) / 10
        : null;
  }

  for (const row of statusGroups) {
    const entry = ensure(row.jobId);
    const count = row._count._all;
    if (row.hrStatus === 'SHORTLISTED') entry.shortlistedCount += count;
    else if (row.hrStatus === 'NEEDS_REVIEW') entry.needsReviewCount += count;
    else if (row.hrStatus === 'NOT_SUITABLE') entry.notSuitableCount += count;
    else if (row.hrStatus === 'REVIEW') entry.inReviewCount += count;

    if (PENDING_REVIEW_STATUSES.includes(row.hrStatus)) entry.pendingReviewCount += count;
  }

  for (const row of strongGroups) ensure(row.jobId).strongMatchCount = row._count._all;
  for (const row of analyzedGroups) ensure(row.jobId).analyzedCount = row._count._all;

  return stats;
};

/** Zeroed statistics for a job that has no candidates yet. */
const emptyStats = () => ({
  candidateCount: 0,
  analyzedCount: 0,
  strongMatchCount: 0,
  shortlistedCount: 0,
  needsReviewCount: 0,
  pendingReviewCount: 0,
  notSuitableCount: 0,
  inReviewCount: 0,
  bestMatchScore: null,
  averageMatchScore: null
});

/**
 * Derives the workflow status shown on a job card from its candidate counts.
 * Preserves the labels the existing UI already understands.
 */
const deriveJobStatus = ({ candidateCount, analyzedCount }) => {
  if (candidateCount === 0) return 'NEW';
  if (analyzedCount === 0) return 'IMPORTING';
  if (analyzedCount < candidateCount) return 'READY_FOR_ANALYSIS';
  return 'COMPLETED';
};

/**
 * Job records with their candidate statistics attached, ready for the jobs
 * portal and the dashboard's jobs overview.
 *
 * @param {Object} [options]
 * @param {string} [options.sort] newest | oldest | candidates | best_match | title
 * @param {string} [options.search] Matches job title or a required/preferred skill
 * @param {number} [options.limit] Maximum jobs to return after sorting
 * @returns {Promise<Object[]>}
 */
const getJobSummaries = async ({ sort = 'newest', search = '', limit = null } = {}) => {
  const where = {};
  const term = typeof search === 'string' ? search.trim() : '';

  if (term) {
    // Skills are string arrays, which Postgres cannot match case-insensitively,
    // so a small set of case variants is tried alongside the title match.
    const variants = Array.from(
      new Set([
        term,
        term.toLowerCase(),
        term.toUpperCase(),
        term.charAt(0).toUpperCase() + term.slice(1).toLowerCase()
      ])
    );

    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { jdFileName: { contains: term, mode: 'insensitive' } },
      { requiredSkills: { hasSome: variants } },
      { preferredSkills: { hasSome: variants } }
    ];
  }

  // Title and date ordering happen in the database. Ordering by a candidate
  // aggregate is applied after the grouped statistics are joined, because those
  // values do not live on the job row.
  const orderBy =
    sort === 'oldest' ? { createdAt: 'asc' } : sort === 'title' ? { title: 'asc' } : { createdAt: 'desc' };

  const jobs = await prisma.job.findMany({
    where,
    orderBy,
    select: {
      id: true,
      title: true,
      jdFileName: true,
      createdAt: true,
      updatedAt: true,
      requiredSkills: true,
      preferredSkills: true,
      searchKeywords: true,
      minimumExperience: true,
      maximumExperience: true,
      preferredLocations: true,
      qualifications: true,
      preferredEducation: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true
    }
  });

  if (jobs.length === 0) return [];

  const stats = await getCandidateStatsByJob(jobs.map((job) => job.id));

  let summaries = jobs.map((job) => {
    const jobStats = stats.get(job.id) || emptyStats();

    return {
      _id: job.id,
      id: job.id,
      title: job.title,
      jdFileName: job.jdFileName,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      requiredSkills: job.requiredSkills || [],
      preferredSkills: job.preferredSkills || [],
      ...jobStats,
      // Retained for existing consumers of the job list.
      candidatesCount: jobStats.candidateCount,
      highMatchCount: 0,
      status: deriveJobStatus(jobStats),
      requirements: {
        requiredSkills: job.requiredSkills || [],
        preferredSkills: job.preferredSkills || [],
        searchKeywords: job.searchKeywords || [],
        minimumExperience: job.minimumExperience ?? 0,
        maximumExperience: job.maximumExperience ?? null,
        salaryMin: job.salaryMin ?? null,
        salaryMax: job.salaryMax ?? null,
        salaryCurrency: job.salaryCurrency || 'INR',
        preferredLocations: job.preferredLocations || [],
        qualifications: job.qualifications || [],
        preferredEducation: job.preferredEducation || []
      }
    };
  });

  // Excellent-match counts, for the legacy highMatchCount field. One grouped
  // query rather than one per job.
  const excellentGroups = await prisma.candidate.groupBy({
    by: ['jobId'],
    where: { jobId: { in: jobs.map((j) => j.id) }, overallScore: { gte: EXCELLENT_MATCH_MIN } },
    _count: { _all: true }
  });
  const excellentByJob = new Map(excellentGroups.map((row) => [row.jobId, row._count._all]));
  summaries.forEach((summary) => {
    summary.excellentMatchCount = excellentByJob.get(summary.id) || 0;
    summary.highMatchCount = summary.excellentMatchCount;
  });

  if (sort === 'candidates') {
    summaries.sort((a, b) => b.candidateCount - a.candidateCount || a.title.localeCompare(b.title));
  } else if (sort === 'best_match') {
    // Jobs with no scored candidate sort last rather than being treated as zero.
    summaries.sort((a, b) => {
      if (a.bestMatchScore === b.bestMatchScore) return a.title.localeCompare(b.title);
      if (a.bestMatchScore === null) return 1;
      if (b.bestMatchScore === null) return -1;
      return b.bestMatchScore - a.bestMatchScore;
    });
  }

  const max = parseInt(limit, 10);
  return Number.isFinite(max) && max > 0 ? summaries.slice(0, max) : summaries;
};

module.exports = { getJobSummaries, getCandidateStatsByJob, emptyStats, deriveJobStatus };
