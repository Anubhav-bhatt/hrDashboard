const prisma = require('../config/prisma');
const { formatCandidateForApi } = require('../utils/candidateSerializer');
const { LIST_SELECT } = require('../utils/candidateQuery');

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

const startOfMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * @desc    Dashboard KPI metrics, hiring pipeline and recent activity
 * @route   GET /api/analytics/overview
 * @access  Private
 *
 * Every number is a live aggregate. Counts are produced with grouped queries
 * rather than per-status round trips, so adding stages does not add queries.
 */
const getOverview = async (req, res, next) => {
  try {
    const monthStart = startOfMonth();
    const weekStart = daysAgo(7);

    const [
      totalCandidates,
      totalJobs,
      statusGroups,
      analyzedCount,
      highMatchCount,
      candidatesThisMonth,
      candidatesThisWeek,
      jobsThisMonth,
      scoreAggregate,
      recentCandidates,
      recentJobs,
      pendingReview
    ] = await Promise.all([
      prisma.candidate.count(),
      prisma.job.count(),
      prisma.candidate.groupBy({ by: ['hrStatus'], _count: { _all: true } }),
      prisma.candidate.count({ where: { overallScore: { not: null } } }),
      prisma.candidate.count({ where: { overallScore: { gte: 80 } } }),
      prisma.candidate.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.candidate.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.job.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.candidate.aggregate({ _avg: { overallScore: true }, _max: { overallScore: true } }),
      prisma.candidate.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { ...LIST_SELECT, job: { select: { id: true, title: true } } }
      }),
      prisma.job.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, jdFileName: true, createdAt: true, requiredSkills: true }
      }),
      prisma.candidate.count({ where: { hrStatus: { in: ['REVIEW', 'NEEDS_REVIEW'] } } })
    ]);

    const statusCounts = statusGroups.reduce((acc, row) => {
      acc[row.hrStatus] = row._count._all;
      return acc;
    }, {});

    const pipeline = PIPELINE_STAGES.map((stage) => ({
      ...stage,
      count: statusCounts[stage.key] || 0,
      percentage: totalCandidates > 0 ? Math.round(((statusCounts[stage.key] || 0) / totalCandidates) * 100) : 0
    }));

    // Score bands, computed in one grouped pass over scored candidates.
    const scored = await prisma.candidate.findMany({
      where: { overallScore: { not: null } },
      select: { overallScore: true }
    });

    const scoreBands = [
      { key: 'excellent', label: '90-100%', min: 90, max: 100, count: 0 },
      { key: 'strong', label: '80-89%', min: 80, max: 89.999, count: 0 },
      { key: 'good', label: '70-79%', min: 70, max: 79.999, count: 0 },
      { key: 'partial', label: '60-69%', min: 60, max: 69.999, count: 0 },
      { key: 'low', label: 'Below 60%', min: 0, max: 59.999, count: 0 }
    ];

    for (const { overallScore } of scored) {
      const band = scoreBands.find((b) => overallScore >= b.min && overallScore <= b.max);
      if (band) band.count++;
    }

    // Applications per day for the last 14 days, for the trend chart.
    const trendStart = daysAgo(13);
    const trendRows = await prisma.candidate.findMany({
      where: { createdAt: { gte: trendStart } },
      select: { createdAt: true }
    });

    const trend = [];
    for (let i = 13; i >= 0; i--) {
      const day = daysAgo(i);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      trend.push({
        date: day.toISOString().slice(0, 10),
        count: trendRows.filter((r) => r.createdAt >= day && r.createdAt < next).length
      });
    }

    return res.status(200).json({
      success: true,
      data: {
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
          highMatch: highMatchCount,
          candidatesThisMonth,
          candidatesThisWeek,
          jobsThisMonth,
          averageScore:
            scoreAggregate._avg.overallScore !== null && scoreAggregate._avg.overallScore !== undefined
              ? Math.round(scoreAggregate._avg.overallScore * 10) / 10
              : null,
          topScore: scoreAggregate._max.overallScore ?? null
        },
        pipeline,
        scoreBands,
        trend,
        recentCandidates: recentCandidates.map((c) => ({
          ...formatCandidateForApi(c, null),
          jobTitle: c.job ? c.job.title : null
        })),
        recentJobs: recentJobs.map((j) => ({
          _id: j.id,
          id: j.id,
          title: j.title,
          jdFileName: j.jdFileName,
          createdAt: j.createdAt,
          requiredSkillCount: (j.requiredSkills || []).length
        })),
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getOverview, PIPELINE_STAGES };
