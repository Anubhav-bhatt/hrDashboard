/**
 * Candidate tools.
 *
 *   getCandidate     -> services/candidateService.getCandidateDetail
 *   getCandidates    -> services/candidateService.listCandidatesForJob
 *   searchCandidates -> services/candidateService.listCandidatesAcrossJobs
 *
 * The two listing tools go through the same `buildCandidateWhere` filter builder
 * that the dashboard's own candidate screens use, so a filter means the same
 * thing to an agent as it does to a recruiter.
 *
 * On what a caller may filter by: every input below is validated into a
 * primitive and then assembled into a query object *here*. The caller's object is
 * never forwarded. That is the whole defence against a raw `where` clause, a SQL
 * fragment or a Prisma expression arriving as a "filter" — such a value cannot
 * survive validation, and even if it did it would be discarded, because the query
 * handed to the service is built from named fields only.
 *
 * Resume text is never requested (`includeResumeText: false`) and the mapper
 * strips contact details, so neither a document nor a phone number can leave
 * through these tools.
 */
const {
  listCandidatesForJob,
  listCandidatesAcrossJobs,
  getCandidateDetail
} = require('../../services/candidateService');
const { HR_STATUSES } = require('../../utils/candidateQuery');
const { PERMISSIONS } = require('./permissions');
const { resourceNotFound, toolInvalidInput } = require('../errors/tool.errors');
const { toAICandidateSummary } = require('./mappers');
const {
  requireObject,
  requireId,
  requireLimit,
  requireOffset,
  requireEnum,
  requireScore,
  requireStringArray,
  requireText,
  requireBoolean,
  BOUNDS
} = require('./validators');

/** Experience buckets the shared query builder understands. */
const EXPERIENCE_RANGES = ['0-2', '2-4', '4-6', '6+', '6-10', '10+', 'UNKNOWN', 'MEETS_REQ', 'BELOW_REQ'];

/**
 * Page-size resolution shared by both listing tools.
 *
 * The configured ceiling is not the only one that applies: `parsePagination` in
 * `utils/candidateQuery.js` caps any listing at 100 rows per page, and that cap
 * governs the services these tools call. Taking the smaller of the two keeps the
 * advertised maximum truthful — promising 200 while the service returns 100 would
 * make `resultCount` quietly disagree with the limit in the same response.
 */
const APPLICATION_PAGE_CAP = 100;

const effectiveMaxCandidateLimit = (config) => Math.min(config.limits.maxCandidateLimit, APPLICATION_PAGE_CAP);

const effectiveDefaultCandidateLimit = (config) =>
  Math.min(config.limits.defaultCandidateLimit, effectiveMaxCandidateLimit(config));

const getCandidate = {
  name: 'getCandidate',
  description: 'Retrieve one candidate as a recruitment summary, without contact details or resume text.',
  category: 'candidates',
  readOnly: true,
  permission: PERMISSIONS.CANDIDATES_READ,
  service: 'services/candidateService.getCandidateDetail',

  validate: (input) => {
    const raw = requireObject(input, ['candidateId', 'jobId']);
    return {
      candidateId: requireId(raw.candidateId, 'candidateId'),
      jobId: requireId(raw.jobId, 'jobId', { required: false })
    };
  },

  execute: async ({ candidateId, jobId }) => {
    const candidate = await getCandidateDetail(candidateId, { jobId, includeResumeText: false });
    if (!candidate) throw resourceNotFound('Candidate');

    return {
      data: { candidate: toAICandidateSummary(candidate) },
      metadata: { resultCount: 1, candidateId, jobId: jobId || candidate.jobId || null }
    };
  }
};

const getCandidates = {
  name: 'getCandidates',
  description: 'List the candidates applied to one job, ranked by the application’s existing score order.',
  category: 'candidates',
  readOnly: true,
  permission: PERMISSIONS.CANDIDATES_READ,
  service: 'services/candidateService.listCandidatesForJob',

  validate: (input, { config }) => {
    const raw = requireObject(input, ['jobId', 'status', 'limit', 'offset']);
    const limit = requireLimit(raw.limit, {
      defaultLimit: effectiveDefaultCandidateLimit(config),
      maxLimit: effectiveMaxCandidateLimit(config)
    });

    return {
      jobId: requireId(raw.jobId, 'jobId'),
      status: requireEnum(raw.status, HR_STATUSES, 'status'),
      limit,
      offset: requireOffset(raw.offset, limit)
    };
  },

  execute: async ({ jobId, status, limit, offset }) => {
    const result = await listCandidatesForJob(jobId, {
      hrStatus: status || undefined,
      limit,
      page: Math.floor(offset / limit) + 1,
      sort: 'score_desc'
    });

    if (!result) throw resourceNotFound('Job');

    return {
      data: { candidates: result.candidates.map(toAICandidateSummary) },
      metadata: {
        resultCount: result.candidates.length,
        totalMatching: result.pagination.total,
        limit,
        offset,
        hasMore: result.pagination.hasNextPage,
        jobId,
        filters: { status: status || null }
      }
    };
  }
};

const searchCandidates = {
  name: 'searchCandidates',
  description:
    'Search candidates across jobs using the application’s existing filters: skills, score, experience, location, qualification and status.',
  category: 'candidates',
  readOnly: true,
  permission: PERMISSIONS.CANDIDATES_READ,
  service: 'services/candidateService.listCandidatesAcrossJobs',

  validate: (input, { config }) => {
    const raw = requireObject(input, [
      'jobId',
      'search',
      'skills',
      'minimumScore',
      'maximumScore',
      'experienceRange',
      'location',
      'qualification',
      'status',
      'shortlisted',
      'limit',
      'offset'
    ]);

    const limit = requireLimit(raw.limit, {
      defaultLimit: effectiveDefaultCandidateLimit(config),
      maxLimit: effectiveMaxCandidateLimit(config)
    });

    const minimumScore = requireScore(raw.minimumScore, 'minimumScore');
    const maximumScore = requireScore(raw.maximumScore, 'maximumScore');
    if (minimumScore !== null && maximumScore !== null && maximumScore < minimumScore) {
      throw toolInvalidInput('maximumScore cannot be less than minimumScore.');
    }

    return {
      jobId: requireId(raw.jobId, 'jobId', { required: false }),
      search: requireText(raw.search, 'search', BOUNDS.searchLength),
      skills: requireStringArray(raw.skills, 'skills'),
      minimumScore,
      maximumScore,
      experienceRange: requireEnum(raw.experienceRange, EXPERIENCE_RANGES, 'experienceRange'),
      location: requireText(raw.location, 'location', BOUNDS.locationLength),
      qualification: requireText(raw.qualification, 'qualification', BOUNDS.qualificationLength),
      status: requireEnum(raw.status, HR_STATUSES, 'status'),
      shortlisted: requireBoolean(raw.shortlisted, 'shortlisted'),
      limit,
      offset: requireOffset(raw.offset, limit)
    };
  },

  execute: async (input) => {
    const { jobId, search, skills, minimumScore, maximumScore, experienceRange, location, qualification, limit, offset } =
      input;

    // `shortlisted: true` is a convenience for the status filter, and loses to an
    // explicit status so two conflicting inputs cannot silently combine.
    const status = input.status || (input.shortlisted === true ? 'SHORTLISTED' : null);

    // Assembled field by field from validated primitives. Nothing the caller sent
    // is spread into this object.
    const query = {
      ...(jobId ? { jobId } : {}),
      ...(search ? { search } : {}),
      ...(skills.length ? { skill: skills } : {}),
      ...(minimumScore !== null ? { minScore: minimumScore } : {}),
      ...(maximumScore !== null ? { maxScore: maximumScore } : {}),
      ...(experienceRange ? { experienceRange: experienceRange.toLowerCase() } : {}),
      ...(location ? { location } : {}),
      ...(qualification ? { qualification } : {}),
      ...(status ? { hrStatus: status } : {}),
      limit,
      page: Math.floor(offset / limit) + 1,
      sort: 'score_desc'
    };

    const result = await listCandidatesAcrossJobs(query);

    return {
      data: { candidates: result.candidates.map(toAICandidateSummary) },
      metadata: {
        resultCount: result.candidates.length,
        totalMatching: result.pagination.total,
        limit,
        offset,
        hasMore: result.pagination.hasNextPage,
        filters: {
          jobId: jobId || null,
          search: search || null,
          skills,
          minimumScore,
          maximumScore,
          experienceRange: experienceRange || null,
          location: location || null,
          qualification: qualification || null,
          status: status || null
        }
      }
    };
  }
};

module.exports = {
  getCandidate,
  getCandidates,
  searchCandidates,
  EXPERIENCE_RANGES,
  APPLICATION_PAGE_CAP,
  effectiveMaxCandidateLimit,
  effectiveDefaultCandidateLimit
};
