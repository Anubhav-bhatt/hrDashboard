/**
 * Shared query-building helpers for candidate listings.
 *
 * Both the job-scoped listing (GET /api/jobs/:jobId/candidates) and the global
 * listing (GET /api/candidates) build their Prisma queries here so filtering,
 * sorting and pagination behave identically on every screen.
 */

/**
 * Every HR status a candidate row may hold.
 *
 * SELECTED is the hiring outcome and is deliberately distinct from SHORTLISTED:
 * shortlisted means still under consideration, selected means chosen for the
 * vacancy. It is only ever written by job closure, never by the ordinary status
 * endpoint, which is why it is excluded from ASSIGNABLE_HR_STATUSES below.
 */
const HR_STATUSES = ['REVIEW', 'SHORTLISTED', 'NOT_SUITABLE', 'NEEDS_REVIEW', 'SELECTED'];

/**
 * Statuses a recruiter may set directly through PATCH .../status.
 *
 * Reaching SELECTED requires closing the job so that the candidate flag and the
 * job's selectedCandidateId can never disagree.
 */
const ASSIGNABLE_HR_STATUSES = HR_STATUSES.filter((status) => status !== 'SELECTED');

const SORT_OPTIONS = {
  score_desc: [{ overallScore: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  score_asc: [{ overallScore: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
  exp_desc: [{ totalExperience: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  exp_asc: [{ totalExperience: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
  newest: [{ createdAt: 'desc' }],
  oldest: [{ createdAt: 'asc' }],
  name_asc: [{ name: 'asc' }],
  name_desc: [{ name: 'desc' }],
  updated_desc: [{ updatedAt: 'desc' }]
};

const DEFAULT_SORT = 'score_desc';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Columns that never belong in a list response. `resumeData` would put the
 * whole file into every row; `resumeText` and `parsedProfile` are large and only
 * needed on the detail screen.
 */
const LIST_SELECT = {
  id: true,
  jobId: true,
  name: true,
  nameSource: true,
  email: true,
  phone: true,
  linkedinUrl: true,
  githubUrl: true,
  portfolioUrl: true,
  currentRole: true,
  headline: true,
  totalExperience: true,
  currentLocation: true,
  preferredLocations: true,
  currentSalary: true,
  expectedSalary: true,
  qualification: true,
  skills: true,
  education: true,
  projects: true,
  source: true,
  resumeFileName: true,
  resumeMimeType: true,
  resumeSize: true,
  receivedAt: true,
  extractionStatus: true,
  extractionWarnings: true,
  overallScore: true,
  alignmentLabel: true,
  requiredSkillScore: true,
  experienceScore: true,
  roleScore: true,
  preferredSkillScore: true,
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
  hrStatus: true,
  notes: true,
  selectedAt: true,
  createdAt: true,
  updatedAt: true
};

/** Parses page/limit into safe integers with sane bounds. */
const parsePagination = (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const requested = parseInt(query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : DEFAULT_LIMIT, 1), MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
};

/** Resolves a sort key to a Prisma orderBy clause, falling back to the default. */
const parseSort = (sort) => SORT_OPTIONS[sort] || SORT_OPTIONS[DEFAULT_SORT];

const EXPERIENCE_RANGES = {
  '0-2': { gte: 0, lte: 2 },
  '2-4': { gte: 2, lte: 4 },
  '4-6': { gte: 4, lte: 6 },
  '6+': { gte: 6 },
  '6-10': { gte: 6, lte: 10 },
  '10+': { gte: 10 }
};

/**
 * Builds the Prisma `where` clause for a candidate listing.
 *
 * Every independent condition is pushed onto an AND list. This is what keeps
 * combined filters correct: a free-text search and a location filter each need
 * their own OR group, and assigning both to a single top-level `OR` key would
 * make the second silently replace the first.
 *
 * @param {Object} query Request query string values
 * @param {Object} [job] Job record, used to resolve requirement-relative ranges
 * @returns {Object} Prisma where clause
 */
const buildCandidateWhere = (query = {}, job = null) => {
  const and = [];

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    // Case-insensitive across every field a recruiter would search by. Array
    // columns need `hasSome` with a case variant list because Postgres array
    // containment has no case-insensitive form.
    const variants = Array.from(new Set([search, search.toLowerCase(), search.toUpperCase(), titleCase(search)]));
    and.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { alternateEmail: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { alternatePhone: { contains: search, mode: 'insensitive' } },
        { currentRole: { contains: search, mode: 'insensitive' } },
        { headline: { contains: search, mode: 'insensitive' } },
        { currentLocation: { contains: search, mode: 'insensitive' } },
        { qualification: { contains: search, mode: 'insensitive' } },
        { skills: { hasSome: variants } },
        { matchedKeywords: { hasSome: variants } }
      ]
    });
  }

  if (query.minScore !== undefined && query.minScore !== '') {
    const min = parseFloat(query.minScore);
    if (Number.isFinite(min)) and.push({ overallScore: { gte: min } });
  }

  if (query.maxScore !== undefined && query.maxScore !== '') {
    const max = parseFloat(query.maxScore);
    if (Number.isFinite(max)) and.push({ overallScore: { lte: max } });
  }

  if (query.hrStatus) {
    const requested = String(query.hrStatus)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => HR_STATUSES.includes(s));
    if (requested.length === 1) and.push({ hrStatus: requested[0] });
    else if (requested.length > 1) and.push({ hrStatus: { in: requested } });
  }

  if (query.jobId) and.push({ jobId: String(query.jobId) });

  // Skills may be repeated (?skill=React&skill=Node.js) for an AND match.
  const skillValues = []
    .concat(query.skill || [])
    .concat(query.skills ? String(query.skills).split(',') : [])
    .map((s) => String(s).trim())
    .filter(Boolean);

  for (const skill of skillValues) {
    const variants = Array.from(new Set([skill, skill.toLowerCase(), skill.toUpperCase(), titleCase(skill)]));
    and.push({ skills: { hasSome: variants } });
  }

  const location = typeof query.location === 'string' ? query.location.trim() : '';
  if (location) {
    const variants = Array.from(new Set([location, titleCase(location)]));
    and.push({
      OR: [
        { currentLocation: { contains: location, mode: 'insensitive' } },
        { preferredLocations: { hasSome: variants } }
      ]
    });
  }

  const qualification = typeof query.qualification === 'string' ? query.qualification.trim() : '';
  if (qualification) and.push({ qualification: { contains: qualification, mode: 'insensitive' } });

  const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : '';
  if (keyword) {
    const variants = Array.from(new Set([keyword, keyword.toLowerCase(), titleCase(keyword)]));
    and.push({ matchedKeywords: { hasSome: variants } });
  }

  if (query.source) and.push({ source: String(query.source).toUpperCase() });

  if (query.experienceRange) {
    const range = String(query.experienceRange);
    if (EXPERIENCE_RANGES[range]) {
      and.push({ totalExperience: EXPERIENCE_RANGES[range] });
    } else if (range === 'unknown') {
      and.push({ totalExperience: null });
    } else if (range === 'meets_req' && job) {
      const filter = { gte: job.minimumExperience || 0 };
      if (job.maximumExperience !== null && job.maximumExperience !== undefined) {
        filter.lte = job.maximumExperience;
      }
      and.push({ totalExperience: filter });
    } else if (range === 'below_req' && job) {
      and.push({ totalExperience: { lt: job.minimumExperience || 0 } });
    }
  }

  // Application date window (inclusive of the whole end day).
  const appliedFrom = parseDate(query.appliedFrom);
  const appliedTo = parseDate(query.appliedTo);
  if (appliedFrom || appliedTo) {
    const filter = {};
    if (appliedFrom) {
      appliedFrom.setHours(0, 0, 0, 0);
      filter.gte = appliedFrom;
    }
    if (appliedTo) {
      appliedTo.setHours(23, 59, 59, 999);
      filter.lte = appliedTo;
    }
    and.push({ createdAt: filter });
  }

  return and.length ? { AND: and } : {};
};

const titleCase = (value) =>
  String(value)
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Standard pagination envelope returned alongside `data`. */
const buildPaginationMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.max(Math.ceil(total / limit), 1),
  hasNextPage: page * limit < total,
  hasPreviousPage: page > 1
});

module.exports = {
  HR_STATUSES,
  ASSIGNABLE_HR_STATUSES,
  SORT_OPTIONS,
  DEFAULT_SORT,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  LIST_SELECT,
  parsePagination,
  parseSort,
  buildCandidateWhere,
  buildPaginationMeta,
  titleCase
};
