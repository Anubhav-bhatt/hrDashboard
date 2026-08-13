const { normalizeSkillList } = require('../utils/skillNormalization');
const { extractSkills, extractEducation } = require('./candidateExtractor');

/** Upper bound on a plausible "minimum years of experience" figure. */
const MAX_PLAUSIBLE_EXPERIENCE = 30;

/**
 * Words allowed between the duration and the word "experience", e.g.
 * "5 years of strong hands-on professional experience".
 */
const MAX_INTERVENING_WORDS = 8;

/**
 * Finds the minimum years of experience stated in a job description.
 *
 * Implemented as a bounded scan rather than one large pattern. The previous
 * single regex contained `(?:\s*[\w-]+)*` — a quantifier nested over a group
 * that can match nothing — so any job description containing a duration that is
 * not followed by the word "experience" drove the engine into exponential
 * backtracking and pinned the process at 100% CPU indefinitely. Every step here
 * is linear in the length of the text.
 *
 * @param {string} text Job description text
 * @returns {number} Years of experience, or 0 when not stated
 */
const extractMinimumExperience = (text) => {
  if (!text || typeof text !== 'string') return 0;

  // Each candidate duration is located first; no nested quantifiers involved.
  const durationPattern = /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/gi;

  let match;
  while ((match = durationPattern.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    if (Number.isNaN(value) || value < 0 || value > MAX_PLAUSIBLE_EXPERIENCE) continue;

    // Look only at a short, fixed-size window after the duration and check
    // whether "experience" appears within a few words of it.
    const tail = text.slice(match.index + match[0].length, match.index + match[0].length + 120);
    const words = tail.split(/[^\w-]+/).filter(Boolean).slice(0, MAX_INTERVENING_WORDS);
    const mentionsExperience = words.some((word) => /^(experience|exp)$/i.test(word));

    if (mentionsExperience) return value;
  }

  // No duration was tied to the word "experience"; fall back to the first
  // plausible standalone duration, which is how most descriptions read.
  durationPattern.lastIndex = 0;
  const first = durationPattern.exec(text);
  if (first) {
    const value = parseFloat(first[1]);
    if (!Number.isNaN(value) && value >= 0 && value <= MAX_PLAUSIBLE_EXPERIENCE) return value;
  }

  return 0;
};

/**
 * Extracts structured job requirements from raw Job Description text
 *
 * @param {string} jdText - Extracted text of the Job Description
 * @param {string} jobTitle - Title of the job
 * @returns {Object} Structured requirement object
 */
const extractJDRequirements = (jdText, jobTitle = '') => {
  if (!jdText || typeof jdText !== 'string') {
    return {
      requiredSkills: [],
      preferredSkills: [],
      minimumExperience: 0,
      preferredEducation: [],
      roleKeywords: []
    };
  }

  // 1. Minimum Experience Extraction
  const minimumExperience = extractMinimumExperience(jdText);

  // 2. Section Partitioning for Required vs Preferred Skills
  const requiredSectionMatch = jdText.match(/(?:required|must\s*have|qualifications|technical\s*skills|key\s*skills)[\s\S]*?(?=(?:preferred|good\s*to\s*have|nice\s*to\s*have|responsibilities|about\s*us|$))/i);
  const preferredSectionMatch = jdText.match(/(?:preferred|good\s*to\s*have|nice\s*to\s*have|plus)[\s\S]*?(?=(?:responsibilities|about\s*us|$))/i);

  let requiredSkills = [];
  let preferredSkills = [];

  if (requiredSectionMatch && requiredSectionMatch[0]) {
    requiredSkills = extractSkills(requiredSectionMatch[0]);
  }

  if (preferredSectionMatch && preferredSectionMatch[0]) {
    preferredSkills = extractSkills(preferredSectionMatch[0]);
  }

  // If no explicit sections were parsed, fallback to extracting all skills as requiredSkills
  if (requiredSkills.length === 0 && preferredSkills.length === 0) {
    const allSkills = extractSkills(jdText);
    if (allSkills.length > 2) {
      requiredSkills = allSkills.slice(0, Math.ceil(allSkills.length * 0.7));
      preferredSkills = allSkills.slice(Math.ceil(allSkills.length * 0.7));
    } else {
      requiredSkills = allSkills;
    }
  } else {
    // Filter preferredSkills to not overlap with requiredSkills
    preferredSkills = preferredSkills.filter(s => !requiredSkills.includes(s));
  }

  // 3. Education Requirements
  const preferredEducation = extractEducation(jdText);

  // 4. Role Keywords
  const roleKeywords = new Set();
  if (jobTitle) {
    roleKeywords.add(jobTitle.trim());
    jobTitle.split(' ').forEach(word => {
      if (word.length > 3 && !['Senior', 'Lead', 'Junior', 'Role', 'With'].includes(word)) {
        roleKeywords.add(word.trim());
      }
    });
  }

  return {
    requiredSkills: normalizeSkillList(requiredSkills),
    preferredSkills: normalizeSkillList(preferredSkills),
    minimumExperience,
    preferredEducation,
    roleKeywords: Array.from(roleKeywords)
  };
};

module.exports = {
  extractJDRequirements,
  extractMinimumExperience
};
