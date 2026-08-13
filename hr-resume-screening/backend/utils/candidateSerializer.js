/**
 * Candidate API serializers.
 *
 * The response shape is deliberately stable: `_id` and every field the existing
 * frontend consumed are preserved, and richer data is added alongside. Nothing
 * here invents values — a field the resume did not provide stays null so the UI
 * can say "Not provided" honestly.
 */

/**
 * Compares a candidate against a job's requirements. Each flag is true, false,
 * or null when the comparison cannot be made (candidate data or job criterion
 * missing). Null must not be rendered as "no match".
 */
const computeCompatibilityFlags = (cand, job) => {
  const empty = { experienceMatch: null, locationMatch: null, qualificationMatch: null, salaryMatch: null };
  if (!job || !cand) return empty;

  const reqs = job.requirements || job;
  const flags = { ...empty };

  // Experience
  const minExp = reqs.minimumExperience ?? job.minimumExperience ?? 0;
  const maxExp = reqs.maximumExperience ?? job.maximumExperience ?? null;
  if (cand.totalExperience !== null && cand.totalExperience !== undefined) {
    flags.experienceMatch =
      maxExp !== null && maxExp !== undefined
        ? cand.totalExperience >= minExp && cand.totalExperience <= maxExp
        : cand.totalExperience >= minExp;
  }

  // Location
  const normalizeLoc = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/gurgaon/g, 'gurugram')
      .replace(/bangalore/g, 'bengaluru')
      .trim();

  const preferredLocations = reqs.preferredLocations || job.preferredLocations || [];
  if (preferredLocations.length > 0 && cand.currentLocation) {
    const candLoc = normalizeLoc(cand.currentLocation);
    flags.locationMatch = preferredLocations.some((l) => {
      const jobLoc = normalizeLoc(l);
      return jobLoc === candLoc || candLoc.includes(jobLoc) || jobLoc.includes(candLoc);
    });
  }

  // Qualification
  const jobQualifications = reqs.qualifications || job.qualifications || [];
  if (jobQualifications.length > 0 && cand.qualification) {
    const normQual = (q) => String(q || '').toLowerCase().replace(/[.\s]/g, '').trim();
    const candQual = normQual(cand.qualification);
    flags.qualificationMatch = jobQualifications.some((q) => {
      const jobQual = normQual(q);
      return jobQual === candQual || candQual.includes(jobQual);
    });
  }

  // Salary — expected CTC is the meaningful comparison; current CTC is a proxy.
  const salMin = reqs.salaryMin ?? job.salaryMin ?? null;
  const salMax = reqs.salaryMax ?? job.salaryMax ?? null;
  const candSalary = cand.expectedSalary ?? cand.currentSalary ?? null;
  if ((salMin !== null || salMax !== null) && candSalary !== null) {
    if (salMin !== null && salMax !== null) flags.salaryMatch = candSalary >= salMin && candSalary <= salMax;
    else if (salMin !== null) flags.salaryMatch = candSalary >= salMin;
    else flags.salaryMatch = candSalary <= salMax;
  }

  return flags;
};

const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * Serializes a candidate for list rows and as the base of the detail payload.
 */
const formatCandidateForApi = (cand, job = null) => {
  if (!cand) return null;
  const flags = computeCompatibilityFlags(cand, job);
  const hasScore = cand.overallScore !== null && cand.overallScore !== undefined;

  return {
    _id: cand.id,
    id: cand.id,
    jobId: cand.jobId,
    jobTitle: cand.job ? cand.job.title : undefined,
    name: cand.name,
    nameSource: cand.nameSource,
    email: cand.email || null,
    alternateEmail: cand.alternateEmail || null,
    phone: cand.phone || null,
    alternatePhone: cand.alternatePhone || null,
    linkedinUrl: cand.linkedinUrl || null,
    githubUrl: cand.githubUrl || null,
    portfolioUrl: cand.portfolioUrl || null,
    currentRole: cand.currentRole || null,
    headline: cand.headline || cand.currentRole || null,
    summary: cand.summary || null,
    totalExperience: cand.totalExperience ?? null,
    currentLocation: cand.currentLocation || null,
    preferredLocations: asArray(cand.preferredLocations),
    currentSalary: cand.currentSalary ?? null,
    expectedSalary: cand.expectedSalary ?? null,
    qualification: cand.qualification || null,
    skills: asArray(cand.skills),
    education: asArray(cand.education),
    projects: asArray(cand.projects),
    source: cand.source,
    resumeFileName: cand.resumeFileName,
    resumeMimeType: cand.resumeMimeType,
    resumeSize: cand.resumeSize ?? null,
    receivedAt: cand.receivedAt,
    extractionStatus: cand.extractionStatus,
    extractionWarnings: asArray(cand.extractionWarnings),
    hrStatus: cand.hrStatus,
    notes: cand.notes || null,
    createdAt: cand.createdAt,
    updatedAt: cand.updatedAt,
    compatibilityFlags: flags,
    matchAnalysis: hasScore
      ? {
          overallScore: cand.overallScore,
          alignmentLabel: cand.alignmentLabel,
          requiredSkillScore: cand.requiredSkillScore,
          experienceScore: cand.experienceScore,
          roleScore: cand.roleScore,
          preferredSkillScore: cand.preferredSkillScore,
          projectScore: cand.projectScore,
          educationScore: cand.educationScore,
          matchedSkills: asArray(cand.matchedSkills),
          missingRequiredSkills: asArray(cand.missingRequiredSkills),
          matchedPreferredSkills: asArray(cand.matchedPreferredSkills),
          matchedKeywords: asArray(cand.matchedKeywords),
          compatibilityFlags: flags,
          strengths: asArray(cand.strengths),
          gaps: asArray(cand.gaps),
          summary: cand.analysisSummary,
          analyzedAt: cand.analyzedAt
        }
      : null
  };
};

/**
 * Full candidate profile for the detail screen. Groups fields into the sections
 * the profile page renders so the client never has to re-parse resume text.
 *
 * @param {Object} cand Candidate record (may include job, noteEntries, activities)
 * @param {Object} [job] Job record for compatibility flags
 * @param {Object} [options]
 * @param {boolean} [options.includeResumeText=false] Include raw resume text
 */
const formatCandidateDetail = (cand, job = null, options = {}) => {
  if (!cand) return null;
  const base = formatCandidateForApi(cand, job);
  const parsed = cand.parsedProfile && typeof cand.parsedProfile === 'object' ? cand.parsedProfile : {};
  const links = parsed.links || {};

  const experience = asArray(parsed.experience);
  const totalExperienceYears = base.totalExperience ?? parsed.computedExperienceYears ?? null;

  return {
    ...base,

    personal: {
      name: base.name,
      email: base.email,
      alternateEmail: base.alternateEmail,
      phone: base.phone,
      alternatePhone: base.alternatePhone,
      currentLocation: base.currentLocation,
      preferredLocations: base.preferredLocations,
      linkedin: base.linkedinUrl || links.linkedinUrl || null,
      github: base.githubUrl || links.githubUrl || null,
      portfolio: base.portfolioUrl || links.portfolioUrl || null,
      otherLinks: asArray(links.otherLinks)
    },

    professional: {
      headline: base.headline,
      summary: base.summary || parsed.summary || null,
      currentRole: base.currentRole,
      currentCompany: experience.find((e) => e.isCurrent)?.company || experience[0]?.company || null,
      totalExperienceYears,
      // Exposed separately so the UI can show how the figure was obtained rather
      // than presenting a derived number as if the candidate stated it.
      statedExperienceYears: base.totalExperience ?? null,
      computedExperienceYears: parsed.computedExperienceYears ?? null,
      qualification: base.qualification,
      currentSalary: base.currentSalary,
      expectedSalary: base.expectedSalary
    },

    skills: base.skills,
    experience,
    educationDetail: asArray(parsed.education),
    projectsDetail: asArray(parsed.projects),
    certifications: asArray(parsed.certifications),
    languages: asArray(parsed.languages),
    achievements: asArray(parsed.achievements),

    application: {
      jobId: base.jobId,
      jobTitle: base.jobTitle || (cand.job ? cand.job.title : null),
      status: base.hrStatus,
      appliedAt: base.createdAt,
      receivedAt: base.receivedAt,
      source: base.source,
      lastUpdatedAt: base.updatedAt
    },

    resume: {
      fileName: base.resumeFileName,
      mimeType: base.resumeMimeType,
      sizeBytes: base.resumeSize,
      // Whether the original document can be opened, and if not, why.
      available: Boolean(cand.resumeData) || String(cand.source || '').toUpperCase() === 'OUTLOOK',
      storage: cand.resumeData ? 'DATABASE' : String(cand.source || '').toUpperCase() === 'OUTLOOK' ? 'OUTLOOK' : 'NONE',
      hasExtractedText: Boolean(cand.resumeText),
      extractionStatus: base.extractionStatus,
      extractionWarnings: base.extractionWarnings,
      ...(options.includeResumeText && cand.resumeText ? { text: cand.resumeText } : {})
    },

    parsing: {
      parserVersion: parsed.parserVersion ?? null,
      detectedSections: asArray(parsed.detectedSections)
    },

    noteEntries: asArray(cand.noteEntries).map((n) => ({
      id: n.id,
      body: n.body,
      authorName: n.authorName,
      createdAt: n.createdAt
    })),

    activities: asArray(cand.activities).map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      actorName: a.actorName,
      metadata: a.metadata || null,
      createdAt: a.createdAt
    }))
  };
};

module.exports = { formatCandidateForApi, formatCandidateDetail, computeCompatibilityFlags };
