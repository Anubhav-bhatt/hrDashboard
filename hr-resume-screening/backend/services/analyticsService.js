/**
 * Dashboard and job analytics.
 *
 * This logic used to live inside `controllers/analyticsController.js`, where it
 * could only be reached by an Express handler holding a `req` and a `res`. It was
 * moved here unchanged so that anything needing these figures — the HTTP routes
 * today, the AI analytics tools now — computes them from one place. The point is
 * not tidiness: it is that the dashboard a recruiter reads and the numbers an
 * agent quotes must come from the same query, or they will eventually disagree.
 *
 * The queries, the ordering, the rounding and the shape of the returned object
 * are exactly as they were. The controllers are now thin wrappers that choose a
 * status code.
 */
const prisma = require('../config/prisma');
const { formatCandidateForApi } = require('../utils/candidateSerializer');
const { LIST_SELECT } = require('../utils/candidateQuery');
const { getCandidateStatsByJob, emptyStats } = require('./jobSummaryService');
const { SELECTED_CANDIDATE_SELECT } = require('./jobClosureService');
const { STRONG_MATCH_MIN, PENDING_REVIEW_STATUSES, SCORE_BANDS } = require('../utils/scoreThresholds');

/**
 * Recruitment pipeline stages. These mirror the HR statuses the application
 * actually stores — no speculative stages such as "Offer" or "Onboarding" are
 * shown, because nothing in the data model records them. Selected is included
 * because job closure does persist it.
 */
const PIPELINE_STAGES = [
  { key: 'REVIEW', label: 'In Review', description: 'Awaiting recruiter screening' },
  { key: 'NEEDS_REVIEW', label: 'Needs Review', description: 'Flagged for a second look' },
  { key: 'SHORTLISTED', label: 'Shortlisted', description: 'Progressed by a recruiter' },
  { key: 'SELECTED', label: 'Selected', description: 'Hired for the role' },
  { key: 'NOT_SUITABLE', label: 'Not Suitable', description: 'Declined after screening' }
];

/** Number of highest-scoring candidates returned for the dashboard. */
const TOP_CANDIDATE_LIMIT = 5;

/** Most recent hires listed on the dashboard. */
const RECENT_HIRE_LIMIT = 5;

const startOfMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Dashboard KPI metrics, hiring pipeline and recent activity.
 *
 * Every number is a live aggregate produced by grouped queries. Candidate rows
 * are never loaded to be counted in JavaScript.
 *
 * @param {Object} [params]
 * @param {string|null} [params.jobId] Scope every figure to a single job.
 * @returns {Promise<Object|null>} Null when a requested job does not exist, so
 *   the caller decides how to report that.
 */
const getDashboardOverview = async ({ jobId = null } = {}) => {
  const requestedJobId = typeof jobId === 'string' ? jobId.trim() : '';

  // A job filter is enforced in PostgreSQL, not by filtering in the client.
  let job = null;
  if (requestedJobId) {
    job = await prisma.job.findUnique({
      where: { id: requestedJobId },
      select: { id: true, title: true, createdAt: true, requiredSkills: true, preferredSkills: true }
    });

    if (!job) return null;
  }

  const scope = job ? { jobId: job.id } : {};
  const monthStart = startOfMonth();
  const weekStart = daysAgo(7);

  const [
    totalCandidates,
    totalJobs,
    statusGroups,
    analyzedCount,
    strongMatchCount,
    candidatesThisMonth,
    candidatesThisWeek,
    jobsThisMonth,
    scoreAggregate,
    recentCandidates,
    topCandidates,
    scoreBandCounts,
    trendRows
  ] = await Promise.all([
    prisma.candidate.count({ where: scope }),
    job ? Promise.resolve(1) : prisma.job.count(),
    prisma.candidate.groupBy({ by: ['hrStatus'], where: scope, _count: { _all: true } }),
    prisma.candidate.count({ where: { ...scope, overallScore: { not: null } } }),
    prisma.candidate.count({ where: { ...scope, overallScore: { gte: STRONG_MATCH_MIN } } }),
    prisma.candidate.count({ where: { ...scope, createdAt: { gte: monthStart } } }),
    prisma.candidate.count({ where: { ...scope, createdAt: { gte: weekStart } } }),
    job ? Promise.resolve(0) : prisma.job.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.candidate.aggregate({ where: scope, _avg: { overallScore: true }, _max: { overallScore: true } }),
    prisma.candidate.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { ...LIST_SELECT, job: { select: { id: true, title: true } } }
    }),
    // Highest scoring candidates. Unscored candidates are excluded rather than
    // treated as zero, so a "top candidates" list never surfaces a candidate
    // that has not been evaluated.
    prisma.candidate.findMany({
      where: { ...scope, overallScore: { not: null } },
      orderBy: [{ overallScore: 'desc' }, { createdAt: 'desc' }],
      take: TOP_CANDIDATE_LIMIT,
      select: { ...LIST_SELECT, job: { select: { id: true, title: true } } }
    }),
    // One count per band, in parallel, instead of loading every scored row.
    Promise.all(
      SCORE_BANDS.map((band) =>
        prisma.candidate.count({
          where: { ...scope, overallScore: { gte: band.min, lte: band.max } }
        })
      )
    ),
    prisma.candidate.findMany({
      where: { ...scope, createdAt: { gte: daysAgo(13) } },
      select: { createdAt: true }
    })
  ]);

  const statusCounts = statusGroups.reduce((acc, row) => {
    acc[row.hrStatus] = row._count._all;
    return acc;
  }, {});

  const pendingReview = PENDING_REVIEW_STATUSES.reduce((sum, status) => sum + (statusCounts[status] || 0), 0);

  const pipeline = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    count: statusCounts[stage.key] || 0,
    percentage: totalCandidates > 0 ? Math.round(((statusCounts[stage.key] || 0) / totalCandidates) * 100) : 0
  }));

  const scoreBands = SCORE_BANDS.map((band, index) => ({ ...band, count: scoreBandCounts[index] }));

  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const day = daysAgo(i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    trend.push({
      date: day.toISOString().slice(0, 10),
      count: trendRows.filter((row) => row.createdAt >= day && row.createdAt < next).length
    });
  }

  // Hiring outcome. Counted in Postgres rather than by loading jobs, and only
  // across the whole workspace: inside a single job's dashboard these global
  // totals would be noise, so that view stays focused on its own pipeline.
  const [openJobs, closedJobs, selectedCandidates, recentHires] = job
    ? [null, null, null, []]
    : await Promise.all([
        prisma.job.count({ where: { status: 'OPEN' } }),
        prisma.job.count({ where: { status: 'CLOSED' } }),
        prisma.candidate.count({ where: { hrStatus: 'SELECTED' } }),
        // One query with a projected relation — not a per-job candidate lookup.
        prisma.job.findMany({
          where: { status: 'CLOSED', selectedCandidateId: { not: null } },
          orderBy: { closedAt: 'desc' },
          take: RECENT_HIRE_LIMIT,
          select: {
            id: true,
            title: true,
            closedAt: true,
            selectedCandidate: {
              select: { id: true, name: true, currentRole: true, totalExperience: true, overallScore: true }
            }
          }
        })
      ]);

  return {
    // Echoes the active filter so the UI can state plainly what is being shown.
    scope: {
      type: job ? 'JOB' : 'ALL_JOBS',
      jobId: job ? job.id : null,
      jobTitle: job ? job.title : null,
      requiredSkills: job ? job.requiredSkills || [] : []
    },
    metrics: {
      totalCandidates,
      totalJobs,
      shortlisted: statusCounts.SHORTLISTED || 0,
      needsReview: statusCounts.NEEDS_REVIEW || 0,
      inReview: statusCounts.REVIEW || 0,
      notSuitable: statusCounts.NOT_SUITABLE || 0,
      pendingReview,
      analyzed: analyzedCount,
      unanalyzed: Math.max(totalCandidates - analyzedCount, 0),
      strongMatch: strongMatchCount,
      // Retained under its original name for existing consumers.
      highMatch: strongMatchCount,
      candidatesThisMonth,
      candidatesThisWeek,
      jobsThisMonth,
      averageScore:
        scoreAggregate._avg.overallScore !== null && scoreAggregate._avg.overallScore !== undefined
          ? Math.round(scoreAggregate._avg.overallScore * 10) / 10
          : null,
      topScore: scoreAggregate._max.overallScore ?? null,
      bestMatchScore: scoreAggregate._max.overallScore ?? null,
      // Null inside a single-job dashboard, where a workspace-wide count
      // would not describe what the recruiter is looking at.
      openJobs,
      closedJobs,
      selectedCandidates
    },
    pipeline,
    scoreBands,
    trend,
    topCandidates: topCandidates.map((c) => ({
      ...formatCandidateForApi(c, null),
      jobTitle: c.job ? c.job.title : null
    })),
    recentCandidates: recentCandidates.map((c) => ({
      ...formatCandidateForApi(c, null),
      jobTitle: c.job ? c.job.title : null
    })),
    recentHires: recentHires
      .filter((hire) => hire.selectedCandidate)
      .map((hire) => ({
        jobId: hire.id,
        jobTitle: hire.title,
        closedAt: hire.closedAt,
        candidateId: hire.selectedCandidate.id,
        candidateName: hire.selectedCandidate.name,
        currentRole: hire.selectedCandidate.currentRole,
        totalExperience: hire.selectedCandidate.totalExperience,
        overallScore: hire.selectedCandidate.overallScore
      })),
    strongMatchThreshold: STRONG_MATCH_MIN,
    generatedAt: new Date().toISOString()
  };
};

/**
 * Candidate statistics for one job, used by the job workspace header and the
 * job-scoped candidate list's KPI row.
 *
 * @param {string} jobId
 * @returns {Promise<Object|null>} Null when the job does not exist.
 */
const getJobSummaryData = async (jobId) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      jdFileName: true,
      createdAt: true,
      requiredSkills: true,
      preferredSkills: true,
      searchKeywords: true,
      minimumExperience: true,
      maximumExperience: true,
      preferredLocations: true,
      qualifications: true,
      status: true,
      closedAt: true,
      selectedCandidateId: true,
      selectedCandidate: { select: SELECTED_CANDIDATE_SELECT }
    }
  });

  if (!job) return null;

  const stats = (await getCandidateStatsByJob([job.id])).get(job.id) || emptyStats();

  const scoreBandCounts = await Promise.all(
    SCORE_BANDS.map((band) =>
      prisma.candidate.count({ where: { jobId: job.id, overallScore: { gte: band.min, lte: band.max } } })
    )
  );

  return {
    job: {
      _id: job.id,
      id: job.id,
      title: job.title,
      jdFileName: job.jdFileName,
      createdAt: job.createdAt,
      requiredSkills: job.requiredSkills || [],
      preferredSkills: job.preferredSkills || [],
      searchKeywords: job.searchKeywords || [],
      minimumExperience: job.minimumExperience ?? 0,
      maximumExperience: job.maximumExperience ?? null,
      preferredLocations: job.preferredLocations || [],
      qualifications: job.qualifications || [],
      status: job.status,
      isClosed: job.status === 'CLOSED',
      closedAt: job.closedAt,
      selectedCandidateId: job.selectedCandidateId,
      selectedCandidate: job.selectedCandidate || null,
      canClose: job.status === 'OPEN' && stats.shortlistedCount > 0
    },
    stats,
    scoreBands: SCORE_BANDS.map((band, index) => ({ ...band, count: scoreBandCounts[index] })),
    strongMatchThreshold: STRONG_MATCH_MIN
  };
};

module.exports = {
  getDashboardOverview,
  getJobSummaryData,
  PIPELINE_STAGES,
  TOP_CANDIDATE_LIMIT,
  RECENT_HIRE_LIMIT
};
