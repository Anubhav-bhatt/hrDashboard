const prisma = require('../config/prisma');
const { formatCandidateForApi } = require('../utils/candidateSerializer');
const { LIST_SELECT } = require('../utils/candidateQuery');
const { getJobSummaries, getCandidateStatsByJob, emptyStats } = require('../services/jobSummaryService');
const { STRONG_MATCH_MIN, PENDING_REVIEW_STATUSES, SCORE_BANDS } = require('../utils/scoreThresholds');

/**
 * Recruitment pipeline stages. These mirror the HR statuses the application
 * actually stores — no speculative stages such as "Offer" or "Hired" are shown,
 * because nothing in the data model records them.
 */
const PIPELINE_STAGES = [
  { key: 'REVIEW', label: 'In Review', description: 'Awaiting recruiter screening' },
  { key: 'NEEDS_REVIEW', label: 'Needs Review', description: 'Flagged for a second look' },
  { key: 'SHORTLISTED', label: 'Shortlisted', description: 'Progressed by a recruiter' },
  { key: 'NOT_SUITABLE', label: 'Not Suitable', description: 'Declined after screening' }
];

/** Number of highest-scoring candidates returned for the dashboard. */
const TOP_CANDIDATE_LIMIT = 5;

/** Jobs shown in the dashboard's overview section before "view all". */
const OVERVIEW_JOB_LIMIT = 6;

const startOfMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * @desc    Dashboard KPI metrics, hiring pipeline and recent activity.
 *          Pass ?jobId=<id> to scope every figure to a single job.
 * @route   GET /api/dashboard/overview
 * @route   GET /api/analytics/overview  (original path, retained)
 * @access  Private
 *
 * Every number is a live aggregate produced by grouped queries. Candidate rows
 * are never loaded to be counted in JavaScript.
 */
const getOverview = async (req, res, next) => {
  try {
    const requestedJobId = typeof req.query.jobId === 'string' ? req.query.jobId.trim() : '';

    // A job filter is enforced in PostgreSQL, not by filtering in the client.
    let job = null;
    if (requestedJobId) {
      job = await prisma.job.findUnique({
        where: { id: requestedJobId },
        select: { id: true, title: true, createdAt: true, requiredSkills: true, preferredSkills: true }
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          code: 'JOB_NOT_FOUND',
          message: 'That job could not be found, so its dashboard cannot be shown.'
        });
      }
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

    // The jobs overview is only meaningful when looking across jobs.
    const jobsOverview = job ? [] : await getJobSummaries({ sort: 'candidates', limit: OVERVIEW_JOB_LIMIT });
    const jobsOverviewTotal = job ? 1 : await prisma.job.count();

    return res.status(200).json({
      success: true,
      data: {
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
          bestMatchScore: scoreAggregate._max.overallScore ?? null
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
        jobsOverview,
        jobsOverviewTotal,
        strongMatchThreshold: STRONG_MATCH_MIN,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Candidate statistics for one job, used by the job workspace header
 *          and the job-scoped candidate list's KPI row
 * @route   GET /api/jobs/:jobId/summary
 * @access  Private
 */
const getJobSummary = async (req, res, next) => {
  try {
    const { jobId } = req.params;

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
        qualifications: true
      }
    });

    if (!job) {
      return res.status(404).json({ success: false, code: 'JOB_NOT_FOUND', message: 'Job not found.' });
    }

    const stats = (await getCandidateStatsByJob([job.id])).get(job.id) || emptyStats();

    const scoreBandCounts = await Promise.all(
      SCORE_BANDS.map((band) =>
        prisma.candidate.count({ where: { jobId: job.id, overallScore: { gte: band.min, lte: band.max } } })
      )
    );

    return res.status(200).json({
      success: true,
      data: {
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
          qualifications: job.qualifications || []
        },
        stats,
        scoreBands: SCORE_BANDS.map((band, index) => ({ ...band, count: scoreBandCounts[index] })),
        strongMatchThreshold: STRONG_MATCH_MIN
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getOverview, getJobSummary, PIPELINE_STAGES };
