/**
 * Sanitized AI representations of jobs and candidates.
 *
 * Every tool output passes through here. Two jobs:
 *
 * 1. Data minimization. A candidate record holds a phone number, two email
 *    addresses, social links and the full extracted text of their resume. A
 *    screening or ranking agent needs none of that to do its work — it needs
 *    skills, experience, education and the score the application already
 *    computed. What is excluded is listed explicitly below rather than left to
 *    whatever the serializer happened to return, because "we forgot to remove it"
 *    is how personal data reaches a third party.
 *
 * 2. Token economy. When a paid provider is eventually connected, every field
 *    here is billed on every request. Arrays are bounded and long free text is
 *    dropped, so the cost of a comparison across fifty candidates stays bounded
 *    and predictable.
 *
 * These functions read; they never write. The stored candidate record is
 * untouched — this is a projection, not a migration.
 */

/** Caps on repeated fields, so one unusual record cannot dominate a payload. */
const CAPS = Object.freeze({
  skills: 40,
  education: 10,
  preferredLocations: 10,
  matchedSkills: 40,
  missingSkills: 40,
  strengths: 10,
  gaps: 10
});

/**
 * Candidate fields deliberately withheld from every AI representation.
 *
 * Kept as data so a test can assert on it and so the decision is reviewable
 * rather than buried in the shape of an object literal.
 */
const EXCLUDED_CANDIDATE_FIELDS = Object.freeze([
  'email',
  'alternateEmail',
  'phone',
  'alternatePhone',
  'linkedinUrl',
  'githubUrl',
  'portfolioUrl',
  'resumeText',
  'resumeData',
  'resumeFileName',
  'notes',
  'noteEntries',
  'activities',
  'summary',
  'outlookMessageId',
  'outlookAttachmentId',
  'resumeHash',
  'sourceRelativePath',
  'parsedProfile'
]);

/**
 * Job fields deliberately withheld.
 *
 * `jdText` is the significant one: a job description runs to several kilobytes
 * and would be re-sent on every single request. Tools expose a reference to it
 * (filename, length, whether it exists) instead of the text.
 */
const EXCLUDED_JOB_FIELDS = Object.freeze([
  'jdText',
  'jdMimeType',
  'closedByUserId',
  'updatedAt',
  'searchKeywords'
]);

const asArray = (value, cap) => (Array.isArray(value) ? value.slice(0, cap) : []);

const nullIfEmpty = (value) => (value === undefined || value === '' ? null : value);

/**
 * Fields the recruitment domain does not model.
 *
 * The Candidate model has no notice-period column and the Job model has no
 * notice-period preference (see prisma/schema.prisma). Reporting them as an
 * explicit null with a reason is the honest answer — omitting the key entirely
 * would leave a future agent to guess, and inventing a value would be worse.
 */
const NOT_MODELLED = Object.freeze({ value: null, available: false, reason: 'Not captured by this application.' });

/**
 * A candidate, reduced to what recruitment reasoning actually needs.
 *
 * Accepts either a raw Prisma candidate row or the output of
 * `utils/candidateSerializer.formatCandidateForApi` / `formatCandidateDetail`,
 * since different services return different shapes.
 *
 * @param {Object} candidate
 * @returns {Object|null}
 */
const toAICandidateSummary = (candidate) => {
  if (!candidate) return null;

  // formatCandidateDetail nests these; a raw row has them flat.
  const professional = candidate.professional || {};
  const match = candidate.matchAnalysis || {};
  const hasScore = candidate.overallScore !== null && candidate.overallScore !== undefined;

  const overallScore = hasScore ? candidate.overallScore : match.overallScore ?? null;

  return {
    candidateId: candidate.id || candidate._id || null,
    jobId: candidate.jobId ?? null,
    // Recruiters work with people, not opaque ids: a ranking that cannot name a
    // candidate is unusable. Name is the only direct identifier retained, and
    // every contact detail is withheld.
    name: nullIfEmpty(candidate.name) ?? null,
    currentRole: nullIfEmpty(candidate.currentRole ?? professional.currentRole) ?? null,
    currentCompany: nullIfEmpty(professional.currentCompany) ?? null,
    headline: nullIfEmpty(candidate.headline) ?? null,

    experience: {
      // Both figures are exposed because they mean different things: one is what
      // the candidate stated, the other is what the parser computed from dates.
      statedYears: candidate.totalExperience ?? professional.statedExperienceYears ?? null,
      computedYears: professional.computedExperienceYears ?? null,
      // Relevance to a specific role is not stored; the scoring breakdown is the
      // application's answer to that question.
      relevantYears: NOT_MODELLED
    },

    skills: asArray(candidate.skills, CAPS.skills),
    education: asArray(candidate.education, CAPS.education),
    qualification: nullIfEmpty(candidate.qualification) ?? null,

    location: {
      current: nullIfEmpty(candidate.currentLocation) ?? null,
      preferred: asArray(candidate.preferredLocations, CAPS.preferredLocations)
    },

    compensation: {
      currentSalary: candidate.currentSalary ?? null,
      expectedSalary: candidate.expectedSalary ?? null,
      currency: 'INR',
      noticePeriod: NOT_MODELLED
    },

    status: {
      hrStatus: candidate.hrStatus ?? null,
      isShortlisted: candidate.hrStatus === 'SHORTLISTED',
      isSelected: candidate.hrStatus === 'SELECTED',
      selectedAt: candidate.selectedAt ?? null
    },

    // The application's score, read as stored. Never recomputed here.
    score: {
      overallScore,
      alignmentLabel: candidate.alignmentLabel ?? match.alignmentLabel ?? null,
      isScored: overallScore !== null && overallScore !== undefined,
      analyzedAt: candidate.analyzedAt ?? match.analyzedAt ?? null
    },

    // Enough to know a document exists and whether parsing struggled — never the
    // document, and never its filename.
    resume: {
      hasExtractedText: Boolean(candidate.resumeText) || Boolean(candidate.resume?.hasExtractedText),
      extractionStatus: candidate.extractionStatus ?? null,
      sizeBytes: candidate.resumeSize ?? null
    },

    appliedAt: candidate.createdAt ?? null
  };
};

/**
 * A job, reduced to the criteria that drive screening and scoring.
 *
 * Accepts the output of `services/jobService.getJobDetails` or a row from
 * `services/jobSummaryService.getJobSummaries` — both carry a `requirements`
 * object, and both are handled.
 *
 * @param {Object} job
 * @returns {Object|null}
 */
const toAIJobSummary = (job) => {
  if (!job) return null;

  const reqs = job.requirements || {};
  const metrics = job.metrics || {};

  return {
    jobId: job.id || job._id || null,
    title: job.title ?? null,
    status: job.status ?? null,
    isClosed: job.isClosed ?? job.status === 'CLOSED',
    closedAt: job.closedAt ?? null,
    createdAt: job.createdAt ?? null,

    requirements: {
      requiredSkills: asArray(reqs.requiredSkills ?? job.requiredSkills, CAPS.skills),
      preferredSkills: asArray(reqs.preferredSkills ?? job.preferredSkills, CAPS.skills),
      roleKeywords: asArray(reqs.roleKeywords, CAPS.skills),
      minimumExperience: reqs.minimumExperience ?? job.minimumExperience ?? null,
      maximumExperience: reqs.maximumExperience ?? job.maximumExperience ?? null,
      preferredLocations: asArray(reqs.preferredLocations ?? job.preferredLocations, CAPS.preferredLocations),
      qualifications: asArray(reqs.qualifications ?? job.qualifications, CAPS.education),
      preferredEducation: asArray(reqs.preferredEducation, CAPS.education),
      salaryRange: {
        min: reqs.salaryMin ?? job.salaryMin ?? null,
        max: reqs.salaryMax ?? job.salaryMax ?? null,
        currency: reqs.salaryCurrency ?? job.salaryCurrency ?? 'INR'
      },
      noticePeriodPreference: NOT_MODELLED
    },

    // A pointer to the job description, not its contents.
    jobDescription: {
      fileName: job.jdFileName ?? null,
      hasText: typeof job.jdText === 'string' ? job.jdText.length > 0 : null,
      characterCount: typeof job.jdText === 'string' ? job.jdText.length : null
    },

    pipeline: {
      candidateCount: metrics.candidatesCount ?? job.candidateCount ?? job.candidatesCount ?? null,
      analyzedCount: metrics.analyzedCount ?? job.analyzedCount ?? null,
      shortlistedCount: metrics.shortlistedCount ?? job.shortlistedCount ?? null,
      selectedCandidateId: job.selectedCandidateId ?? null
    }
  };
};

/** The compact row used by list responses, where full requirements are noise. */
const toAIJobListItem = (job) => {
  if (!job) return null;
  const summary = toAIJobSummary(job);
  return {
    jobId: summary.jobId,
    title: summary.title,
    status: summary.status,
    isClosed: summary.isClosed,
    createdAt: summary.createdAt,
    candidateCount: summary.pipeline.candidateCount,
    shortlistedCount: summary.pipeline.shortlistedCount,
    requiredSkills: summary.requirements.requiredSkills
  };
};

module.exports = {
  CAPS,
  NOT_MODELLED,
  EXCLUDED_CANDIDATE_FIELDS,
  EXCLUDED_JOB_FIELDS,
  toAICandidateSummary,
  toAIJobSummary,
  toAIJobListItem
};
