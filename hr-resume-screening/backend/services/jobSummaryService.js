const prisma = require('../config/prisma');
const { STRONG_MATCH_MIN, EXCELLENT_MATCH_MIN, PENDING_REVIEW_STATUSES } = require('../utils/scoreThresholds');
const { SELECTED_CANDIDATE_SELECT } = require('./jobClosureService');

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
        selectedCount: 0,
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
    else if (row.hrStatus === 'SELECTED') entry.selectedCount += count;

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
  selectedCount: 0,
  bestMatchScore: null,
  averageMatchScore: null
});

/**
 * Derives the *processing* state shown on a job card from its candidate counts.
 *
 * This is an operational display state (New / Importing / Ready to score / All
 * scored) and is entirely separate from the persisted OPEN/CLOSED lifecycle on
 * `job.status`. Both are returned; the UI shows CLOSED in preference to the
 * processing badge once a job is closed.
 */
const deriveProcessingStatus = ({ candidateCount, analyzedCount }) => {
  if (candidateCount === 0) return 'NEW';
  if (analyzedCount === 0) return 'IMPORTING';
  if (analyzedCount < candidateCount) return 'READY_FOR_ANALYSIS';
  return 'COMPLETED';
};

/** Job lifecycle values accepted from the API. */
const JOB_STATUSES = ['OPEN', 'CLOSED'];

/**
 * Normalises a requested lifecycle filter.
 * Anything unrecognised (including "ALL" and an absent value) means no filter.
 */
const parseJobStatus = (status) => {
  if (!status) return null;
  const upper = String(status).trim().toUpperCase();
  return JOB_STATUSES.includes(upper) ? upper : null;
};

/**
 * Ids of jobs with a skill or keyword matching the term, case-insensitively.
 *
 * Prisma's array operators (`hasSome`) compare elements exactly, so a search for
 * "typescript" would miss a job listing "TypeScript". Unnesting the arrays and
 * comparing with ILIKE matches regardless of case and also matches partial terms
 * ("react" finds "React Native"). One query for the whole listing, not per job.
 *
 * The term is passed as a bound parameter, never interpolated into the SQL.
 */
const findJobIdsMatchingSkill = async (term) => {
  const rows = await prisma.$queryRaw`
    SELECT "id" FROM "Job"
    WHERE EXISTS (
      SELECT 1
      FROM unnest("requiredSkills" || "preferredSkills" || "searchKeywords" || "roleKeywords") AS skill
      WHERE skill ILIKE ${`%${term}%`}
    )
  `;
  return rows.map((row) => row.id);
};

/**
 * The single Prisma `where` builder for every job listing.
 *
 * The jobs portal, the closed-jobs history and the dashboard all search the same
 * way through this function, so there is one definition of what "matching a job"
 * means rather than a variant per screen.
 *
 * Free text matches the job title, the JD filename, any required/preferred skill
 * or search keyword, and — via the relation — the name of the candidate selected
 * for a closed job, so searching a person finds the role they were hired for.
 *
 * @param {Object} [params]
 * @param {string} [params.search] Free-text term
 * @param {string} [params.status] OPEN | CLOSED; omit for both
 */
const buildJobWhere = async ({ search = '', status = null } = {}) => {
  const and = [];
  const lifecycle = parseJobStatus(status);
  if (lifecycle) and.push({ status: lifecycle });

  const term = typeof search === 'string' ? search.trim() : '';
  if (term) {
    const skillMatchedIds = await findJobIdsMatchingSkill(term);

    and.push({
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { jdFileName: { contains: term, mode: 'insensitive' } },
        // Skill/keyword matches, resolved case-insensitively above.
        { id: { in: skillMatchedIds } },
        // Relational filter: the hired candidate's name, matched in Postgres.
        { selectedCandidate: { name: { contains: term, mode: 'insensitive' } } }
      ]
    });
  }

  return and.length ? { AND: and } : {};
};

/**
 * Lifecycle counts for the All / Active / Closed selector.
 *
 * Counted under the current search term but ignoring the current lifecycle
 * filter, so the tabs keep showing how many jobs the other tab holds. One
 * grouped query.
 */
const getJobStatusCounts = async ({ search = '' } = {}) => {
  const groups = await prisma.job.groupBy({
    by: ['status'],
    where: await buildJobWhere({ search }),
    _count: { _all: true }
  });

  const counts = { all: 0, open: 0, closed: 0 };
  for (const row of groups) {
    const count = row._count._all;
    counts.all += count;
    if (row.status === 'CLOSED') counts.closed += count;
    else counts.open += count;
  }
  return counts;
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
const getJobSummaries = async ({ sort = 'newest', search = '', status = null, limit = null, page = null } = {}) => {
  const where = await buildJobWhere({ search, status });

  // Sorts that map to a column can be ordered and paginated by Postgres.
  // `candidates` and `best_match` rank on candidate aggregates that do not live
  // on the job row, so those are ordered after the grouped statistics are joined.
  const ROW_ORDER_BY = {
    newest: { createdAt: 'desc' },
    oldest: { createdAt: 'asc' },
    title: { title: 'asc' },
    recently_closed: { closedAt: { sort: 'desc', nulls: 'last' } },
    oldest_closed: { closedAt: { sort: 'asc', nulls: 'last' } }
  };

  const orderBy = ROW_ORDER_BY[sort] || null;
  const isAggregateSort = !orderBy;

  const perPage = Math.min(Math.max(parseInt(limit, 10) || 0, 0), 100);
  const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
  const paginate = perPage > 0 && page !== null;

  const total = await prisma.job.count({ where });

  const JOB_SELECT = {
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
    salaryCurrency: true,
    status: true,
    closedAt: true,
    selectedCandidateId: true,
    // Projection only — never the resume text or full profile, which would make
    // every closed-job card carry a document's worth of data.
    selectedCandidate: { select: SELECTED_CANDIDATE_SELECT }
  };

  const jobs = await prisma.job.findMany({
    where,
    ...(orderBy ? { orderBy } : { orderBy: { createdAt: 'desc' } }),
    // Aggregate sorts must rank the whole result set before a page can be cut,
    // so pagination for those is applied after sorting below.
    ...(paginate && !isAggregateSort ? { skip: (pageNumber - 1) * perPage, take: perPage } : {}),
    select: JOB_SELECT
  });

  if (jobs.length === 0) {
    return {
      jobs: [],
      pagination: { page: pageNumber, limit: perPage || total, total, totalPages: perPage ? Math.ceil(total / perPage) : 1 }
    };
  }

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
      // Persisted lifecycle. `processingStatus` carries the derived operational
      // badge that the portal showed before closure existed.
      status: job.status,
      processingStatus: deriveProcessingStatus(jobStats),
      isClosed: job.status === 'CLOSED',
      closedAt: job.closedAt,
      selectedCandidateId: job.selectedCandidateId,
      selectedCandidate: job.selectedCandidate || null,
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

  if (paginate) {
    // Row sorts were already paginated in SQL; aggregate sorts are cut here.
    const pageItems = isAggregateSort
      ? summaries.slice((pageNumber - 1) * perPage, pageNumber * perPage)
      : summaries;
    return {
      jobs: pageItems,
      pagination: { page: pageNumber, limit: perPage, total, totalPages: Math.ceil(total / perPage) || 1 }
    };
  }

  const max = parseInt(limit, 10);
  const capped = Number.isFinite(max) && max > 0 ? summaries.slice(0, max) : summaries;
  return {
    jobs: capped,
    pagination: { page: 1, limit: capped.length, total, totalPages: 1 }
  };
};

module.exports = {
  getJobSummaries,
  getCandidateStatsByJob,
  getJobStatusCounts,
  buildJobWhere,
  parseJobStatus,
  emptyStats,
  deriveProcessingStatus
};
