/**
 * Analytics tools.
 *
 *   getDashboardMetrics -> services/analyticsService.getDashboardOverview
 *   getJobMetrics       -> services/analyticsService.getJobSummaryData
 *   getPipelineMetrics  -> services/analyticsService.getDashboardOverview
 *
 * These call the very same functions that serve `GET /api/dashboard/overview` and
 * `GET /api/jobs/:jobId/summary`. That is the point of having extracted them: the
 * count an agent quotes and the count on the recruiter's dashboard come from one
 * query, so they cannot drift apart.
 *
 * The alternative — letting an agent fetch candidate rows and tally them itself —
 * is what these tools exist to prevent. It would be slower, it would pull
 * thousands of records through the AI layer, and its arithmetic would eventually
 * disagree with the product for reasons nobody could reconstruct.
 *
 * Candidate collections are deliberately dropped from these responses. The
 * dashboard payload carries `topCandidates`, `recentCandidates` and `recentHires`
 * as full candidate objects; an analytics question needs counts, and a caller who
 * wants people should ask a candidate tool, which sanitizes them.
 */
const { getDashboardOverview, getJobSummaryData } = require('../../services/analyticsService');
const { PERMISSIONS } = require('./permissions');
const { resourceNotFound } = require('../errors/tool.errors');
const { requireObject, requireId } = require('./validators');

const getDashboardMetrics = {
  name: 'getDashboardMetrics',
  description:
    'Retrieve the workspace dashboard totals — candidates, jobs, pipeline counts and score bands. Pass a jobId to scope them to one job.',
  category: 'analytics',
  readOnly: true,
  permission: PERMISSIONS.ANALYTICS_READ,
  service: 'services/analyticsService.getDashboardOverview',

  validate: (input) => {
    const raw = requireObject(input, ['jobId']);
    return { jobId: requireId(raw.jobId, 'jobId', { required: false }) };
  },

  execute: async ({ jobId }) => {
    const overview = await getDashboardOverview({ jobId });
    if (!overview) throw resourceNotFound('Job');

    return {
      data: {
        scope: overview.scope,
        metrics: overview.metrics,
        scoreBands: overview.scoreBands,
        strongMatchThreshold: overview.strongMatchThreshold
      },
      metadata: {
        resultCount: 1,
        jobId: jobId || null,
        source: 'services/analyticsService.getDashboardOverview',
        // Named so a consumer knows these exist and must be fetched through the
        // candidate tools rather than assumed absent.
        omitted: ['topCandidates', 'recentCandidates', 'recentHires', 'trend']
      }
    };
  }
};

const getJobMetrics = {
  name: 'getJobMetrics',
  description: 'Retrieve the candidate statistics and score distribution for one job.',
  category: 'analytics',
  readOnly: true,
  permission: PERMISSIONS.ANALYTICS_READ,
  service: 'services/analyticsService.getJobSummaryData',

  validate: (input) => {
    const raw = requireObject(input, ['jobId']);
    return { jobId: requireId(raw.jobId, 'jobId') };
  },

  execute: async ({ jobId }) => {
    const summary = await getJobSummaryData(jobId);
    if (!summary) throw resourceNotFound('Job');

    return {
      data: {
        jobId: summary.job.id,
        title: summary.job.title,
        status: summary.job.status,
        isClosed: summary.job.isClosed,
        closedAt: summary.job.closedAt,
        stats: summary.stats,
        scoreBands: summary.scoreBands,
        strongMatchThreshold: summary.strongMatchThreshold
      },
      metadata: {
        resultCount: 1,
        jobId,
        source: 'services/analyticsService.getJobSummaryData'
      }
    };
  }
};

const getPipelineMetrics = {
  name: 'getPipelineMetrics',
  description:
    'Retrieve the recruitment pipeline stage counts (In Review, Needs Review, Shortlisted, Selected, Not Suitable).',
  category: 'analytics',
  readOnly: true,
  permission: PERMISSIONS.ANALYTICS_READ,
  service: 'services/analyticsService.getDashboardOverview',

  validate: (input) => {
    const raw = requireObject(input, ['jobId']);
    return { jobId: requireId(raw.jobId, 'jobId', { required: false }) };
  },

  execute: async ({ jobId }) => {
    const overview = await getDashboardOverview({ jobId });
    if (!overview) throw resourceNotFound('Job');

    return {
      data: {
        scope: overview.scope,
        // The stages the data model actually records. No speculative "Offer" or
        // "Onboarding" stage is reported, because nothing stores one.
        pipeline: overview.pipeline,
        totalCandidates: overview.metrics.totalCandidates
      },
      metadata: {
        resultCount: overview.pipeline.length,
        jobId: jobId || null,
        source: 'services/analyticsService.getDashboardOverview'
      }
    };
  }
};

module.exports = { getDashboardMetrics, getJobMetrics, getPipelineMetrics };
