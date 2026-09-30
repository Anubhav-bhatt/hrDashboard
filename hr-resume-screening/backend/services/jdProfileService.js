/**
 * Job Description Deep Profiling Service
 *
 * Extracts a structured, normalized JobProfile from the complete text of a Job Description.
 * Parses sections, distinguishes required vs preferred skills, detects negation (e.g. "No AWS required"),
 * identifies role family, seniority, and responsibility expectations.
 */

const {
  canonicalizeSkill,
  normalizeSkillList,
  findSkillsInText,
  getSkillCategory
} = require('../utils/skillTaxonomy');
const { extractMinimumExperience } = require('./jdRequirementExtractor');
const { extractEducation } = require('./candidateExtractor');

/** Upper bound on experience */
const MAX_EXPERIENCE_YEARS = 30;

/**
 * Extracts explicitly negated skills from text.
 * e.g. "No prior AWS experience required", "Not requiring Python", "Without Docker"
 *
 * @param {string} text
 * @returns {string[]} Canonical names of negated skills
 */
const extractNegatedSkills = (text) => {
  if (!text || typeof text !== 'string') return [];
  const negated = new Set();

  const negationPatterns = [
    /(?:no|not|without|neither)\s+(?:prior|previous|mandatory|essential)?\s*([a-zA-Z0-9#+.\s]{2,30}?)\s*(?:experience\s+)?(?:required|needed|necessary|mandatory)\b/gi,
    /(?:experience\s+with\s+)?([a-zA-Z0-9#+.\s]{2,30}?)\s+is\s+not\s+(?:required|needed|mandatory)/gi,
    /(?:not|no)\s+(?:requiring|needed|required)\s+([a-zA-Z0-9#+.\s]{2,30})/gi
  ];

  for (const regex of negationPatterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const phrase = match[1];
      if (phrase) {
        const found = findSkillsInText(phrase);
        found.forEach((s) => negated.add(s));
      }
    }
  }

  return Array.from(negated);
};

/**
 * Detects seniority level from title and text
 * @param {string} title
 * @param {string} text
 * @returns {'intern'|'junior'|'mid'|'senior'|'lead'|'architect'|'manager'}
 */
const detectSeniority = (title = '', text = '') => {
  const combined = `${title} ${text.slice(0, 500)}`.toLowerCase();
  if (/\b(principal|staff|architect)\b/i.test(combined)) return 'architect';
  if (/\b(lead|team\s*lead|tech\s*lead)\b/i.test(combined)) return 'lead';
  if (/\b(senior|sr\.?|sr\b|lead)\b/i.test(combined)) return 'senior';
  if (/\b(junior|jr\.?|associate|entry\s*level|intern|trainee)\b/i.test(combined)) return 'junior';
  if (/\b(manager|director|head\s+of)\b/i.test(combined)) return 'manager';
  return 'mid';
};

/**
 * Detects primary role family
 * @param {string} title
 * @param {string[]} skills
 * @returns {'frontend'|'backend'|'fullstack'|'devops'|'mobile'|'data'|'qa'|'general'}
 */
const detectRoleFamily = (title = '', skills = []) => {
  const t = (title || '').toLowerCase();
  if (/\b(full\s*stack|fullstack)\b/i.test(t)) return 'fullstack';
  if (/\b(frontend|front-end|front\s*end|ui|react|angular|vue|web\s*developer)\b/i.test(t)) return 'frontend';
  if (/\b(backend|back-end|back\s*end|node|java|python|golang|api|microservices)\b/i.test(t)) return 'backend';
  if (/\b(devops|sre|cloud|infrastructure|platform|kubernetes|docker|aws|azure)\b/i.test(t)) return 'devops';
  if (/\b(mobile|ios|android|react\s*native|flutter)\b/i.test(t)) return 'mobile';
  if (/\b(data|machine\s*learning|ai|ml|data\s*engineer|data\s*scientist)\b/i.test(t)) return 'data';
  if (/\b(qa|quality|sdet|test|tester|automation)\b/i.test(t)) return 'qa';

  // Fallback to checking extracted skills distribution
  let feCount = 0;
  let beCount = 0;
  for (const s of skills) {
    const cat = getSkillCategory(s);
    if (cat === 'frontend') feCount++;
    if (cat === 'backend') beCount++;
  }
  if (feCount > 0 && beCount > 0 && Math.abs(feCount - beCount) <= 2) return 'fullstack';
  if (feCount > beCount) return 'frontend';
  if (beCount > feCount) return 'backend';

  return 'general';
};

/**
 * Extracts key responsibilities and deliverables from the JD text
 * @param {string} text
 * @returns {string[]} Clean responsibility phrases
 */
const extractResponsibilities = (text) => {
  if (!text || typeof text !== 'string') return [];

  const respSectionMatch = text.match(
    /(?:responsibilities|what\s*(?:you'll|you\s*will)\s*do|role\s*overview|day\s*to\s*day|key\s*duties|you\s*will)[\s\S]*?(?=(?:requirements|qualifications|about\s*us|what\s*we\s*offer|skills|$))/i
  );

  const sectionText = respSectionMatch ? respSectionMatch[0] : text;
  const lines = sectionText.split(/\r?\n/).map((l) => l.trim());

  const responsibilities = [];
  const bulletRegex = /^[\s*•▪◦●·‣∙+\-–—\d.)]+\s*(.*)$/;

  for (const line of lines) {
    const match = line.match(bulletRegex);
    const content = match ? match[1].trim() : line;
    if (content.length >= 15 && content.length <= 200) {
      // Must start with an action verb or gerund (Building, Developing, Design, Implement, Collaborate, etc.)
      if (/^(build|develop|design|implement|lead|architect|maintain|collaborate|create|deliver|work|participate|optimize|manage|ensure|write|review|deploy|scale)\b/i.test(content)) {
        responsibilities.push(content);
        if (responsibilities.length >= 8) break;
      }
    }
  }

  return responsibilities;
};

/**
 * Extracts technology-specific experience requirements (e.g. "3+ years React experience")
 * @param {string} text
 * @returns {Array<{ skill: string, years: number }>}
 */
const extractSpecificExperience = (text) => {
  if (!text) return [];
  const results = [];
  const pattern = /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s*(?:of|in|with))?\s*([a-zA-Z0-9#+.\s]{2,25})/gi;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const years = parseFloat(match[1]);
    const phrase = match[2];
    if (years > 0 && years <= MAX_EXPERIENCE_YEARS && phrase) {
      const skills = findSkillsInText(phrase);
      for (const skill of skills) {
        results.push({ skill, years });
      }
    }
  }

  return results;
};

/**
 * Derives a normalized JobProfile from JD text and job record
 *
 * @param {Object} job - Raw job record or object
 * @returns {Object} Normalized JobProfile
 */
const extractJobProfile = (job = {}) => {
  const title = (job.title || '').trim();
  const rawText = (job.description || job.rawText || '').trim();
  const fullText = `${title}\n${rawText}`.trim();

  // 1. Minimum general experience
  const rawMinExp = extractMinimumExperience(fullText);
  const minimumExperience = job.minimumExperience !== undefined && job.minimumExperience !== null && job.minimumExperience > 0
    ? job.minimumExperience
    : rawMinExp;

  // 2. Specific tech experience
  const specificExperience = extractSpecificExperience(fullText);

  // 3. Negated skills
  const negatedSkills = extractNegatedSkills(fullText);

/**
 * Partitions JD into logical sections (Required, Preferred, Responsibilities, Other)
 * @param {string} text
 * @returns {{ required: string[], preferred: string[], responsibilities: string[], header: string[] }}
 */
const partitionJdSections = (text = '') => {
  const lines = text.split(/\r?\n/);
  let currentSection = 'header';
  const sections = { header: [], required: [], preferred: [], responsibilities: [], other: [] };

  const isPreferredHeading = (line) =>
    /^\s*#*\s*(?:preferred(?:\s+qualifications|\s+skills|\s+requirements)?|nice\s*to\s*have|good\s*to\s*have|bonus|plus|advantage|desired|additional\s*qualifications)\b[:\s-]*$/i.test(line) ||
    /^\s*(?:preferred\s*qualifications|preferred\s*skills|nice\s*to\s*have|good\s*to\s*have)\s*[:]/i.test(line);

  const isRequiredHeading = (line) =>
    /^\s*#*\s*(?:key\s*requirements|requirements|required(?:\s+skills|\s+qualifications)?|must\s*have|mandatory(?:\s+skills)?|core\s*requirements|basic\s*qualifications|minimum\s*qualifications|technical\s*requirements|what\s*(?:you'll|you\s*will)\s*need)\b[:\s-]*$/i.test(line) ||
    /^\s*(?:key\s*requirements|requirements|required\s*skills|must\s*have)\s*[:]/i.test(line);

  const isRespHeading = (line) =>
    /^\s*#*\s*(?:responsibilities|what\s*(?:you'll|you\s*will)\s*do|role\s*overview|day\s*to\s*day|key\s*duties)\b[:\s-]*$/i.test(line) ||
    /^\s*(?:responsibilities|key\s*duties)\s*[:]/i.test(line);

  const isOtherHeading = (line) =>
    /^\s*#*\s*(?:about\s*us|what\s*we\s*offer|benefits|perks|company\s*overview)\b[:\s-]*$/i.test(line);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isPreferredHeading(trimmed)) {
      currentSection = 'preferred';
    } else if (isRequiredHeading(trimmed)) {
      currentSection = 'required';
    } else if (isRespHeading(trimmed)) {
      currentSection = 'responsibilities';
    } else if (isOtherHeading(trimmed)) {
      currentSection = 'other';
    } else {
      sections[currentSection].push(trimmed);
    }
  }

  return sections;
};

// 4. Section parsing for required vs preferred
  const sections = partitionJdSections(fullText);
  let rawReqSkills = [];
  let rawPrefSkills = [];

  if (sections.required.length > 0 || sections.preferred.length > 0) {
    if (sections.required.length > 0) {
      rawReqSkills = findSkillsInText(sections.required.join('\n'));
    }
    if (sections.preferred.length > 0) {
      rawPrefSkills = findSkillsInText(sections.preferred.join('\n'));
    }
  } else {
    // If no explicit section headings, parse sentence by sentence
    const sentences = fullText.split(/(?:\r?\n|[.!?]\s+)/).map((s) => s.trim()).filter(Boolean);
    for (const s of sentences) {
      const skills = findSkillsInText(s);
      if (/(?:preferred|nice\s*to\s*have|good\s*to\s*have|plus|advantage|bonus|desired)/i.test(s)) {
        rawPrefSkills.push(...skills);
      } else if (/(?:must|required|mandatory|essential|strong\s*proficiency|key\s*requirements)/i.test(s)) {
        rawReqSkills.push(...skills);
      }
    }

    if (rawReqSkills.length === 0 && rawPrefSkills.length === 0) {
      const allFound = findSkillsInText(fullText);
      if (allFound.length > 3) {
        rawReqSkills = allFound.slice(0, Math.ceil(allFound.length * 0.7));
        rawPrefSkills = allFound.slice(Math.ceil(allFound.length * 0.7));
      } else {
        rawReqSkills = allFound;
      }
    }
  }

  // 5. Recruiter overrides have HIGHEST authority (Prompt section 22)
  const recruiterReq = normalizeSkillList(job.requiredSkills || (job.requirements && job.requirements.requiredSkills) || []);
  const recruiterPref = normalizeSkillList(job.preferredSkills || (job.requirements && job.requirements.preferredSkills) || []);

  const mergedRequiredSet = new Set();
  // Add recruiter confirmed first
  recruiterReq.forEach((s) => mergedRequiredSet.add(s));
  // Add parsed skills that are not negated
  rawReqSkills.forEach((s) => {
    if (!negatedSkills.includes(s)) {
      mergedRequiredSet.add(s);
    }
  });

  const mergedPreferredSet = new Set();
  recruiterPref.forEach((s) => mergedPreferredSet.add(s));
  rawPrefSkills.forEach((s) => {
    if (!negatedSkills.includes(s) && !mergedRequiredSet.has(s)) {
      mergedPreferredSet.add(s);
    }
  });

  const requiredSkills = Array.from(mergedRequiredSet);
  const preferredSkills = Array.from(mergedPreferredSet).filter((s) => !requiredSkills.includes(s));

  // 6. Seniority & Role Family
  const seniority = detectSeniority(title, fullText);
  const roleFamily = detectRoleFamily(title, requiredSkills);

  // 7. Responsibilities
  const responsibilities = extractResponsibilities(fullText);

  // 8. Education
  const preferredEducation = (job.preferredEducation && job.preferredEducation.length > 0)
    ? job.preferredEducation
    : extractEducation(fullText);

  // 9. Categorized Breakdown
  const categories = {
    languages: [],
    frontend: [],
    backend: [],
    database: [],
    cloud: [],
    devops: [],
    testing: [],
    architecture: []
  };

  for (const skill of [...requiredSkills, ...preferredSkills]) {
    const cat = getSkillCategory(skill);
    if (categories[cat]) {
      categories[cat].push(skill);
    }
  }

  return {
    title,
    roleFamily,
    seniority,
    requiredSkills,
    preferredSkills,
    minimumExperience,
    specificExperience,
    responsibilities,
    negatedSkills,
    preferredEducation,
    categories,
    rawText
  };
};

module.exports = {
  extractJobProfile,
  detectSeniority,
  detectRoleFamily,
  extractNegatedSkills,
  extractResponsibilities,
  extractSpecificExperience
};
