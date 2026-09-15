const prisma = require('../config/prisma');
const { formatCandidateForApi } = require('../utils/candidateSerializer');
const { LIST_SELECT } = require('../utils/candidateQuery');
const { STRONG_MATCH_THRESHOLD } = require('../config/recruitmentMetrics');
const { buildDashboardWorkflow } = require('../services/dashboardWorkflow');

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

/** Bounds match the candidate list's minScore/maxScore filters the dashboard links to. */
const SCORE_BANDS = [
  { key: 'excellent', label: '90-100%', min: 90, max: 100 },
  { key: 'strong', label: '80-89%', min: 80, max: 89.999 },
  { key: 'good', label: '70-79%', min: 70, max: 79.999 },
  { key: 'partial', label: '60-69%', min: 60, max: 69.999 },
  { key: 'low', label: 'Below 60%', min: 0, max: 59.999 }
];

const RECENT_CANDIDATE_LIMIT = 5;

/**
 * @desc    Dashboard metrics, workflow priorities, pipeline and recent candidates
 * @route   GET /api/analytics/overview
 * @access  Private
 *
 * Every number is a live aggregate. Per-job grouped counts feed both the
 * workflow summaries and the global totals, so no candidate rows are loaded
 * just to count them.
 */
const getOverview = async (req, res, next) => {
  try {
    const [totalCandidates, jobs, jobStatusGroups, jobScoreGroups, recentCandidates, ...bandCounts] = await Promise.all([
      prisma.candidate.count(),
      prisma.job.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, createdAt: true }
      }),
      prisma.candidate.groupBy({ by: ['jobId', 'hrStatus'], _count: { _all: true } }),
      prisma.candidate.groupBy({ by: ['jobId'], _count: { _all: true, overallScore: true }, _max: { overallScore: true } }),
      prisma.candidate.findMany({
        orderBy: { createdAt: 'desc' },
        take: RECENT_CANDIDATE_LIMIT,
        select: { ...LIST_SELECT, job: { select: { id: true, title: true } } }
      }),
      ...SCORE_BANDS.map((band) =>
        prisma.candidate.count({ where: { overallScore: { gte: band.min, lte: band.max } } })
      )
    ]);

    const statusCounts = {};
    for (const row of jobStatusGroups) {
      statusCounts[row.hrStatus] = (statusCounts[row.hrStatus] || 0) + row._count._all;
    }
    const analyzed = jobScoreGroups.reduce((sum, row) => sum + row._count.overallScore, 0);

    const pipeline = PIPELINE_STAGES.map((stage) => ({
      ...stage,
      count: statusCounts[stage.key] || 0,
      percentage: totalCandidates > 0 ? Math.round(((statusCounts[stage.key] || 0) / totalCandidates) * 100) : 0
    }));

    const scoreBands = SCORE_BANDS.map((band, i) => ({ ...band, count: bandCounts[i] }));

    return res.status(200).json({
      success: true,
      data: {
        metrics: {
          totalCandidates,
          totalJobs: jobs.length,
          shortlisted: statusCounts.SHORTLISTED || 0,
          needsReview: statusCounts.NEEDS_REVIEW || 0,
          inReview: statusCounts.REVIEW || 0,
          notSuitable: statusCounts.NOT_SUITABLE || 0,
          pendingReview: (statusCounts.REVIEW || 0) + (statusCounts.NEEDS_REVIEW || 0),
          analyzed,
          unanalyzed: Math.max(totalCandidates - analyzed, 0)
        },
        pipeline,
        scoreBands,
        strongMatchThreshold: STRONG_MATCH_THRESHOLD,
        ...buildDashboardWorkflow(jobs, jobStatusGroups, jobScoreGroups),
        recentCandidates: recentCandidates.map((c) => ({
          ...formatCandidateForApi(c, null),
          jobTitle: c.job ? c.job.title : null
        })),
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getOverview, PIPELINE_STAGES };
