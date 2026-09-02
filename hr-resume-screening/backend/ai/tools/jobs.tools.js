/**
 * Job tools.
 *
 *   getJobs            -> services/jobSummaryService.getJobSummaries
 *   getJob             -> services/jobService.getJobDetails
 *   getJobRequirements -> services/jobService.getJobDetails
 *
 * Every one of these calls a service the application already uses to render its
 * own screens. None of them queries Prisma.
 *
 * `getJob` and `getJobRequirements` pass `backfillRequirements: false`. The HTTP
 * route repairs legacy records on read; a tool must not, because an agent reading
 * a job is not a reason to write to it. The caller still sees the same computed
 * requirements — they are simply not persisted.
 *
 * There is no separate `searchJobs`: the application's job search is a parameter
 * of the same listing (`buildJobWhere` handles title, JD filename, skills and the
 * hired candidate's name), so `getJobs({ search })` is that capability. A second
 * tool would be a different name for the same call.
 */
const { getJobSummaries } = require('../../services/jobSummaryService');
const { getJobDetails } = require('../../services/jobService');
const { PERMISSIONS } = require('./permissions');
const { resourceNotFound } = require('../errors/tool.errors');
const { toAIJobSummary, toAIJobListItem } = require('./mappers');
const { requireObject, requireId, requireLimit, requireEnum, requireText, BOUNDS } = require('./validators');

/** Lifecycle values the Job model actually stores. */
const JOB_STATUSES = ['OPEN', 'CLOSED'];

const getJobs = {
  name: 'getJobs',
  description: 'List recruitment jobs with their candidate counts. Supports a status filter and free-text search.',
  category: 'jobs',
  readOnly: true,
  permission: PERMISSIONS.JOBS_READ,
  service: 'services/jobSummaryService.getJobSummaries',

  validate: (input, { config }) => {
    const raw = requireObject(input, ['status', 'search', 'limit']);
    return {
      status: requireEnum(raw.status, JOB_STATUSES, 'status'),
      search: requireText(raw.search, 'search', BOUNDS.searchLength),
      limit: requireLimit(raw.limit, {
        defaultLimit: config.limits.defaultJobLimit,
        maxLimit: config.limits.maxJobLimit
      })
    };
  },

  execute: async ({ status, search, limit }) => {
    /*
     * Open roles unless the agent asks otherwise.
     *
     * Omitting the status previously returned open and closed roles interleaved,
     * so an agent asked to screen, rank or compare could pick a filled vacancy
     * and work its archived pool as though it were live recruitment. The default
     * follows the same direction as the candidate scope: forgetting to specify
     * yields less, not more. History stays reachable with `status: 'CLOSED'`,
     * the only other value the validator accepts.
     */
    const lifecycle = status || 'OPEN';

    const result = await getJobSummaries({
      status: lifecycle,
      search: search || '',
      limit,
      page: 1
    });

    return {
      data: { jobs: result.jobs.map(toAIJobListItem) },
      metadata: {
        resultCount: result.jobs.length,
        totalMatching: result.pagination.total,
        limit,
        filters: { status: lifecycle, search: search || null }
      }
    };
  }
};

const getJob = {
  name: 'getJob',
  description: 'Retrieve one job with its requirements and pipeline counts.',
  category: 'jobs',
  readOnly: true,
  permission: PERMISSIONS.JOBS_READ,
  service: 'services/jobService.getJobDetails',

  validate: (input) => {
    const raw = requireObject(input, ['jobId']);
    return { jobId: requireId(raw.jobId, 'jobId') };
  },

  execute: async ({ jobId }) => {
    const job = await getJobDetails(jobId, { backfillRequirements: false, includeJdText: true });
    if (!job) throw resourceNotFound('Job');

    return {
      data: { job: toAIJobSummary(job) },
      metadata: { resultCount: 1, jobId }
    };
  }
};

const getJobRequirements = {
  name: 'getJobRequirements',
  description:
    'Retrieve the structured hiring criteria for one job: skills, experience, locations, qualifications and salary range.',
  category: 'jobs',
  readOnly: true,
  permission: PERMISSIONS.JOBS_READ,
  service: 'services/jobService.getJobDetails',

  validate: (input) => {
    const raw = requireObject(input, ['jobId']);
    return { jobId: requireId(raw.jobId, 'jobId') };
  },

  execute: async ({ jobId }) => {
    const job = await getJobDetails(jobId, { backfillRequirements: false, includeJdText: true });
    if (!job) throw resourceNotFound('Job');

    const summary = toAIJobSummary(job);

    return {
      data: {
        jobId: summary.jobId,
        title: summary.title,
        status: summary.status,
        requirements: summary.requirements,
        jobDescription: summary.jobDescription
      },
      metadata: {
        resultCount: 1,
        jobId,
        // Named explicitly so a future agent does not have to infer that an
        // absent criterion means "no preference" rather than "not recorded".
        unmodelledCriteria: ['noticePeriodPreference']
      }
    };
  }
};

module.exports = { getJobs, getJob, getJobRequirements, JOB_STATUSES };
