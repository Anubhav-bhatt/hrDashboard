const prisma = require('../config/prisma');
const { formatCandidateForApi, formatCandidateDetail } = require('../utils/candidateSerializer');
const {
  LIST_SELECT,
  parsePagination,
  parseSort,
  buildCandidateWhere,
  buildPaginationMeta
} = require('../utils/candidateQuery');

/**
 * Cross-job candidate listing.
 *
 * The job-scoped route (GET /api/jobs/:jobId/candidates) is unchanged and still
 * serves the job workspace. This endpoint exists so dashboard cards can link to
 * a filtered candidate view that spans every open role — e.g.
 * /api/candidates?hrStatus=SHORTLISTED. Both share the same query builder, so
 * filtering, sorting and pagination behave identically.
 *
 * @desc    List candidates across all jobs
 * @route   GET /api/candidates
 * @access  Private
 */
const listCandidates = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const orderBy = parseSort(req.query.sort);
    const where = buildCandidateWhere(req.query);

    const [total, candidates, statusGroups] = await Promise.all([
      prisma.candidate.count({ where }),
      prisma.candidate.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: { ...LIST_SELECT, job: { select: { id: true, title: true } } }
      }),
      // Status tallies for the current filter set, so the UI can label its tabs
      // without issuing a second round of requests.
      prisma.candidate.groupBy({ by: ['hrStatus'], where, _count: { _all: true } })
    ]);

    return res.status(200).json({
      success: true,
      data: candidates.map((c) => ({
        ...formatCandidateForApi(c, null),
        jobTitle: c.job ? c.job.title : null
      })),
      pagination: buildPaginationMeta({ page, limit, total }),
      facets: {
        statusCounts: statusGroups.reduce((acc, row) => {
          acc[row.hrStatus] = row._count._all;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Full candidate profile by ID, without needing the job ID
 * @route   GET /api/candidates/:candidateId
 * @access  Private
 */
const getCandidate = async (req, res, next) => {
  try {
    const { candidateId } = req.params;

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        job: true,
        noteEntries: { orderBy: { createdAt: 'desc' }, take: 50 },
        activities: { orderBy: { createdAt: 'desc' }, take: 50 }
      }
    });

    if (!candidate) {
      return res.status(404).json({
        success: false,
        code: 'CANDIDATE_NOT_FOUND',
        message: 'This candidate profile could not be found.'
      });
    }

    return res.status(200).json({
      success: true,
      data: formatCandidateDetail(candidate, candidate.job, { includeResumeText: true })
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Distinct filter values (skills, locations, qualifications) present in
 *          the candidate pool, so filter controls only offer real options
 * @route   GET /api/candidates/filters
 * @access  Private
 */
const getFilterOptions = async (req, res, next) => {
  try {
    const rows = await prisma.candidate.findMany({
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

    return res.status(200).json({
      success: true,
      data: {
        skills: tally(rows.flatMap((r) => r.skills || [])).slice(0, 60),
        locations: tally(rows.map((r) => r.currentLocation)).slice(0, 40),
        qualifications: tally(rows.map((r) => r.qualification)).slice(0, 25)
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { listCandidates, getCandidate, getFilterOptions };
