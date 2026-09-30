/**
 * Candidate Profile Deep Profiling Service
 *
 * Extracts a structured, normalized CandidateProfile from the complete resume text and structured sections.
 * Extracts skills across all sections (Skills, Experience, Projects, Summary, Education, Certifications),
 * tags skill depth (professional vs project vs listed), computes relevant experience vs total experience,
 * and compiles concrete supporting evidence for every skill.
 */

const {
  canonicalizeSkill,
  normalizeSkillList,
  findSkillsInText,
  getSkillCategory
} = require('../utils/skillTaxonomy');
const { parseResumeProfile } = require('./resumeProfileParser');
const {
  extractEmail,
  extractPhone,
  extractName,
  extractTotalExperience,
  extractCurrentRole,
  extractLocation,
  extractSalary
} = require('./candidateExtractor');

/**
 * Splits text into sentences or meaningful bullet points
 * @param {string} text
 * @returns {string[]}
 */
const extractEvidenceSnippets = (text = '') => {
  if (!text || typeof text !== 'string') return [];
  return text
    .split(/(?:\r?\n|[.!?]\s+)/)
    .map((s) => s.replace(/^[\s*•▪◦●·‣∙+\-–—\d.)]+/, '').trim())
    .filter((s) => s.length >= 10 && s.length <= 250);
};

/**
 * Extracts candidate profile with deep multi-section evidence
 *
 * @param {Object|string} candidateOrText - Candidate model or raw resume text
 * @param {Object} [metadata={}] - Optional metadata (fileName, senderName, targetRoleFamily)
 * @returns {Object} Normalized CandidateProfile
 */
const extractCandidateProfile = (candidateOrText, metadata = {}) => {
  let resumeText = '';
  let parsedProfile = null;
  let existingCandidate = null;

  if (typeof candidateOrText === 'string') {
    resumeText = candidateOrText;
    parsedProfile = parseResumeProfile(resumeText);
  } else if (candidateOrText && typeof candidateOrText === 'object') {
    existingCandidate = candidateOrText;
    resumeText = candidateOrText.resumeText || '';
    parsedProfile = candidateOrText.parsedProfile || (resumeText ? parseResumeProfile(resumeText) : null);
  }

  const { fileName = '', senderName = '', senderEmail = '', targetRoleFamily = '' } = metadata;

  // Contact info
  const emails = parsedProfile?.emails?.length ? parsedProfile.emails : [];
  const phones = parsedProfile?.phones?.length ? parsedProfile.phones : [];
  const primaryEmail = emails[0] || (existingCandidate && existingCandidate.email) || extractEmail(resumeText) || senderEmail || null;
  const primaryPhone = phones[0] || (existingCandidate && existingCandidate.phone) || extractPhone(resumeText) || null;

  // Name
  const nameObj = extractName(resumeText, senderName, fileName);
  const name = (existingCandidate && existingCandidate.name && existingCandidate.name !== 'Unknown Candidate')
    ? existingCandidate.name
    : nameObj.name;

  // Total experience
  const statedExp = extractTotalExperience(resumeText);
  const computedExp = parsedProfile?.computedExperienceYears ?? null;
  const existingExp = existingCandidate?.totalExperience ?? null;
  const totalExperience = existingExp !== null ? existingExp : (statedExp !== null ? statedExp : (computedExp !== null ? computedExp : 0));

  // Role
  const headline = parsedProfile?.headline || existingCandidate?.headline || extractCurrentRole(resumeText);
  const currentRole = headline || existingCandidate?.currentRole || null;

  // Location & Salary
  const currentLocation = parsedProfile?.currentLocation || existingCandidate?.currentLocation || extractLocation(resumeText);
  const salary = extractSalary(resumeText);
  const currentSalary = existingCandidate?.currentSalary ?? salary.currentSalary;
  const expectedSalary = existingCandidate?.expectedSalary ?? salary.expectedSalary;

  // -------------------------------------------------------------
  // DEEP MULTI-SECTION SKILL EXTRACTION & EVIDENCE TRACKING
  // -------------------------------------------------------------
  const skillEvidenceMap = new Map(); // canonical -> { depth, snippets: Set, sourceSections: Set }

  const registerSkillEvidence = (skill, snippet, depth, section) => {
    const canon = canonicalizeSkill(skill);
    if (!canon) return;

    if (!skillEvidenceMap.has(canon)) {
      skillEvidenceMap.set(canon, {
        depth: depth, // 'professional' > 'project' > 'summary' > 'list'
        snippets: new Set(),
        sourceSections: new Set()
      });
    }

    const entry = skillEvidenceMap.get(canon);
    // Upgrade depth if higher priority
    const priority = { professional: 4, project: 3, summary: 2, list: 1 };
    if ((priority[depth] || 0) > (priority[entry.depth] || 0)) {
      entry.depth = depth;
    }
    if (snippet && snippet.length >= 10 && entry.snippets.size < 4) {
      entry.snippets.add(snippet);
    }
    entry.sourceSections.add(section);
  };

  // 1. Scan Work History / Employment
  const employmentHistory = parsedProfile?.experience || [];
  let relevantExperienceYears = 0;

  for (const job of employmentHistory) {
    const roleText = `${job.role || ''} ${job.company || ''} ${job.summary || ''} ${(job.highlights || []).join(' ')}`;
    const roleDuration = job.durationYears || (job.start && job.end ? 1 : 0);

    // Check if this role is in the relevant family (e.g. frontend, react, web)
    const isRelevantRole = targetRoleFamily
      ? new RegExp(`\\b(${targetRoleFamily}|developer|engineer|software)\\b`, 'i').test(roleText)
      : true;

    if (isRelevantRole && roleDuration > 0) {
      relevantExperienceYears += roleDuration;
    }

    // Extract skills with professional depth
    const jobSkills = findSkillsInText(roleText);
    const snippets = extractEvidenceSnippets(roleText);

    for (const skill of jobSkills) {
      // Find the best snippet containing this skill
      const matchingSnippet = snippets.find((s) => s.toLowerCase().includes(skill.toLowerCase())) ||
        (job.role ? `${job.role} at ${job.company || 'Company'}` : null);

      registerSkillEvidence(skill, matchingSnippet, 'professional', 'experience');
    }
  }

  // 2. Scan Projects
  const projects = parsedProfile?.projects || [];
  for (const proj of projects) {
    const projText = `${proj.name || ''} ${proj.description || ''} ${(proj.technologies || []).join(' ')}`;
    const projSkills = findSkillsInText(projText);
    const snippets = extractEvidenceSnippets(projText);

    for (const skill of projSkills) {
      const matchingSnippet = snippets.find((s) => s.toLowerCase().includes(skill.toLowerCase())) ||
        (proj.name ? `Project: ${proj.name}` : null);

      registerSkillEvidence(skill, matchingSnippet, 'project', 'projects');
    }
  }

  // 3. Scan Summary
  const summaryText = parsedProfile?.summary || existingCandidate?.summary || '';
  if (summaryText) {
    const summarySkills = findSkillsInText(summaryText);
    const snippets = extractEvidenceSnippets(summaryText);
    for (const skill of summarySkills) {
      const matchingSnippet = snippets.find((s) => s.toLowerCase().includes(skill.toLowerCase())) || summaryText;
      registerSkillEvidence(skill, matchingSnippet, 'summary', 'summary');
    }
  }

  // 4. Scan Dedicated Skills List & Raw Resume Text
  const rawTextSkills = findSkillsInText(resumeText);
  for (const skill of rawTextSkills) {
    registerSkillEvidence(skill, null, 'list', 'skills');
  }

  // Also include any pre-existing skills array on candidate
  if (Array.isArray(existingCandidate?.skills)) {
    for (const skill of existingCandidate.skills) {
      registerSkillEvidence(skill, null, 'list', 'skills');
    }
  }

  // Compile final skill list
  const allNormalizedSkills = Array.from(skillEvidenceMap.keys());

  // If relevant experience was not calculated from dated jobs, fallback based on role family
  if (relevantExperienceYears === 0) {
    if (targetRoleFamily && targetRoleFamily !== 'general') {
      const hasTargetSkills = allNormalizedSkills.some((s) => {
        const cat = getSkillCategory(s);
        return cat === targetRoleFamily ||
          (targetRoleFamily === 'frontend' && ['React', 'Angular', 'Vue', 'Next.js', 'JavaScript', 'TypeScript'].includes(s)) ||
          (targetRoleFamily === 'backend' && ['Node.js', 'Java', 'Python', 'Go', 'Express', 'Spring Boot'].includes(s));
      });
      relevantExperienceYears = hasTargetSkills ? totalExperience : 0;
    } else {
      relevantExperienceYears = totalExperience;
    }
  }
  relevantExperienceYears = Math.min(totalExperience, Math.round(relevantExperienceYears * 10) / 10);

  // Education strings
  const educationStrings = parsedProfile?.education?.length
    ? parsedProfile.education.map((e) =>
        [e.degree, e.specialisation && `in ${e.specialisation}`, e.institution].filter(Boolean).join(' ')
      )
    : (existingCandidate?.education || []);

  // Format evidence objects
  const skillEvidence = {};
  for (const [skill, data] of skillEvidenceMap.entries()) {
    skillEvidence[skill] = {
      depth: data.depth,
      snippets: Array.from(data.snippets),
      sources: Array.from(data.sourceSections)
    };
  }

  return {
    name,
    email: primaryEmail,
    phone: primaryPhone,
    currentRole,
    headline,
    totalExperience,
    relevantExperience: relevantExperienceYears,
    currentLocation,
    currentSalary,
    expectedSalary,
    skills: allNormalizedSkills,
    skillEvidence,
    education: educationStrings,
    projects: projects.map((p) => p.name || p.description).filter(Boolean),
    employmentHistory,
    summary: summaryText,
    resumeText,
    parsedProfile
  };
};

module.exports = {
  extractCandidateProfile,
  extractEvidenceSnippets
};
