/**
 * Candidate reads.
 *
 * The listing and detail logic was extracted from `controllers/candidateController`
 * and `controllers/globalCandidateController` so that a non-HTTP caller can obtain
 * the same records. The queries, the shared `buildCandidateWhere` filter builder,
 * the ordering and the serializers are all unchanged — this file is where the two
 * controllers' bodies now live, not a new way of reading candidates.
 *
 * Keeping one implementation matters more here than anywhere else: the job-scoped
 * list and the cross-job list already went to lengths to filter identically
 * (see `utils/candidateQuery.js`), and a third caller reproducing that composition
 * is exactly how the three would drift apart.
 */
const prisma = require('../config/prisma');
const { formatCandidateForApi, formatCandidateDetail } = require('../utils/candidateSerializer');
const {
  LIST_SELECT,
  parsePagination,
  parseSort,
  buildCandidateWhere,
  buildScopeWhere,
  buildPaginationMeta
} = require('../utils/candidateQuery');
const { STRONG_MATCH_MIN } = require('../utils/scoreThresholds');

/**
 * Builds the facet block both listings return.
 *
 * Tab tallies deliberately ignore the status filter: a recruiter looking at
 * Shortlisted still needs to see how many candidates the other tabs hold.
 */
const buildFacets = ({ statusGroups, strongMatchCount, tabTotal }) => ({
  statusCounts: statusGroups.reduce((acc, row) => {
    acc[row.hrStatus] = row._count._all;
    return acc;
  }, {}),
  strongMatchCount,
  allCount: tabTotal,
  strongMatchThreshold: STRONG_MATCH_MIN
});

/**
 * Candidates belonging to one job.
 *
 * @param {string} jobId
 * @param {Object} [query] Request-style query values (search, minScore, skill,
 *   hrStatus, experienceRange, sort, page, limit, ...).
 * @returns {Promise<Object|null>} Null when the job does not exist.
 */
const listCandidatesForJob = async (jobId, query = {}) => {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query.sort);

  /*
   * The job's own lifecycle decides the scope.
   *
   * A closed job's candidate list is hiring history and must still be readable;
   * an open job's is live work. Deriving this from the record rather than from a
   * caller-supplied flag means a client cannot ask for a closed job's pool "as
   * active", and the archived branch is unreachable for an open job.
   */
  const scope = job.status === 'CLOSED' ? 'archived' : 'active';
  const scopeOptions = { scope, jobId };

  const where = { AND: [{ jobId }, buildCandidateWhere(query, job, scopeOptions)] };

  // Tab tallies for this job, ignoring the status filter so every tab keeps a
  // meaningful count while one of them is selected. Same shape as the global
  // listing, so one component can render either. Built through the same
  // where-builder, so the lifecycle scope can never drift between rows and counts.
  const tabWhere = {
    AND: [{ jobId }, buildCandidateWhere({ ...query, hrStatus: undefined }, job, scopeOptions)]
  };

  const [total, candidates, statusGroups, strongMatchCount, tabTotal] = await Promise.all([
    prisma.candidate.count({ where }),
    prisma.candidate.findMany({ where, orderBy, skip, take: limit, select: LIST_SELECT }),
    prisma.candidate.groupBy({ by: ['hrStatus'], where: tabWhere, _count: { _all: true } }),
    prisma.candidate.count({ where: { AND: [tabWhere, { overallScore: { gte: STRONG_MATCH_MIN } }] } }),
    prisma.candidate.count({ where: tabWhere })
  ]);

  return {
    job,
    candidates: candidates.map((c) => formatCandidateForApi(c, job)),
    pagination: buildPaginationMeta({ page, limit, total }),
    facets: buildFacets({ statusGroups, strongMatchCount, tabTotal })
  };
};

/**
 * Candidates across every job.
 *
 * @param {Object} [query] Same query vocabulary as the job-scoped listing, plus
 *   an optional `jobId` filter.
 */
const listCandidatesAcrossJobs = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query.sort);

  /*
   * The cross-job listing is always active work. There is deliberately no way to
   * ask it for archived candidates: history is reached one closed job at a time,
   * through that job. A `?jobId=` naming a closed job therefore returns nothing
   * here rather than quietly exposing an archived pool in the active talent list.
   */
  const where = buildCandidateWhere(query, null, { scope: 'active' });
  const tabWhere = buildCandidateWhere({ ...query, hrStatus: undefined }, null, { scope: 'active' });

  const [total, candidates, statusGroups, strongMatchCount, tabTotal] = await Promise.all([
    prisma.candidate.count({ where }),
    prisma.candidate.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: { ...LIST_SELECT, job: { select: { id: true, title: true } } }
    }),
    prisma.candidate.groupBy({ by: ['hrStatus'], where: tabWhere, _count: { _all: true } }),
    prisma.candidate.count({ where: { ...tabWhere, overallScore: { gte: STRONG_MATCH_MIN } } }),
    prisma.candidate.count({ where: tabWhere })
  ]);

  return {
    candidates: candidates.map((c) => ({
      ...formatCandidateForApi(c, null),
      jobTitle: c.job ? c.job.title : null
    })),
    pagination: buildPaginationMeta({ page, limit, total }),
    facets: buildFacets({ statusGroups, strongMatchCount, tabTotal })
  };
};

/**
 * One candidate's full profile.
 *
 * When `jobId` is supplied the lookup is scoped to it, so a mismatched job in the
 * URL cannot read another job's candidate — the same protection the job-scoped
 * route has always applied.
 *
 * @param {string} candidateId
 * @param {Object} [options]
 * @param {string|null} [options.jobId]
 * @param {boolean} [options.includeResumeText=true] Include the extracted resume
 *   text. Callers that must not see it (the AI tool layer) pass false.
 * @returns {Promise<Object|null>}
 */
const getCandidateDetail = async (candidateId, { jobId = null, includeResumeText = true } = {}) => {
  if (jobId) {
    const candidate = await prisma.candidate.findFirst({
      where: { id: candidateId, jobId },
      include: {
        job: { select: { id: true, title: true } },
        noteEntries: { orderBy: { createdAt: 'desc' }, take: 50 },
        activities: { orderBy: { createdAt: 'desc' }, take: 50 }
      }
    });

    if (!candidate) return null;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    return formatCandidateDetail(candidate, job, { includeResumeText });
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      job: true,
      noteEntries: { orderBy: { createdAt: 'desc' }, take: 50 },
      activities: { orderBy: { createdAt: 'desc' }, take: 50 }
    }
  });

  if (!candidate) return null;

  return formatCandidateDetail(candidate, candidate.job, { includeResumeText });
};

/**
 * Distinct filter values present in the candidate pool, so filter controls only
 * offer real options.
 */
const getCandidateFilterOptions = async ({ scope = 'active', jobId = null } = {}) => {
  /*
   * Facets must describe the same population the list is drawing from.
   *
   * This previously read every candidate row in the database with no job filter
   * at all, so an active candidate list offered filter values — skills,
   * locations, qualifications — that came from archived pools and matched
   * nothing. Threading the scope rather than hardcoding OPEN keeps the same
   * endpoint usable for a closed job's historical facets.
   */
  const rows = await prisma.candidate.findMany({
    where: { AND: [jobId ? { jobId } : {}, buildScopeWhere(scope, jobId)] },
    select: { skills: true, currentLocation: true, qualification: true },
    take: 5000
  });

  const tally = (values) => {
    const counts = new Map();
    for (const value of values) {
      if (!value) continue;
      const key = String(value).trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  };

  return {
    skills: tally(rows.flatMap((r) => r.skills || [])).slice(0, 60),
    locations: tally(rows.map((r) => r.currentLocation)).slice(0, 40),
    qualifications: tally(rows.map((r) => r.qualification)).slice(0, 25)
  };
};

/**
 * The stored scoring record for one candidate.
 *
 * A narrow projection of the score columns the application already persists.
 * Nothing here recomputes a score: `services/candidateMatcher.js` is the only
 * thing that produces one, and it runs during ingestion and re-analysis. A caller
 * asking "what did this candidate score" must be told what the application
 * decided, not given a fresh opinion.
 *
 * @param {string} candidateId
 * @param {Object} [options]
 * @param {string|null} [options.jobId] Scope the lookup to a job.
 * @returns {Promise<Object|null>}
 */
const getCandidateScoreRecord = async (candidateId, { jobId = null } = {}) =>
  prisma.candidate.findFirst({
    where: jobId ? { id: candidateId, jobId } : { id: candidateId },
    select: {
      id: true,
      jobId: true,
      name: true,
      hrStatus: true,
      overallScore: true,
      alignmentLabel: true,
      requiredSkillScore: true,
      preferredSkillScore: true,
      experienceScore: true,
      roleScore: true,
      projectScore: true,
      educationScore: true,
      matchedSkills: true,
      missingRequiredSkills: true,
      matchedPreferredSkills: true,
      matchedKeywords: true,
      strengths: true,
      gaps: true,
      analysisSummary: true,
      analyzedAt: true,
      totalExperience: true,
      currentLocation: true,
      qualification: true,
      currentSalary: true,
      expectedSalary: true
    }
  });

module.exports = {
  listCandidatesForJob,
  listCandidatesAcrossJobs,
  getCandidateDetail,
  getCandidateFilterOptions,
  getCandidateScoreRecord
};
