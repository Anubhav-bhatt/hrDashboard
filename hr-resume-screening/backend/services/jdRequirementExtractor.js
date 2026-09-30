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

  // 1. Check for ranges first, e.g. "3-5 years", "2 to 4 years", "3 to 5 yrs", "2-4 years of experience"
  // Captures lower bound (e.g. 3 from "3-5 years", 2 from "2 to 4 years")
  const rangePattern = /\b(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/gi;
  let rangeMatch;
  while ((rangeMatch = rangePattern.exec(text)) !== null) {
    const minVal = parseFloat(rangeMatch[1]);
    if (Number.isNaN(minVal) || minVal < 0 || minVal > MAX_PLAUSIBLE_EXPERIENCE) continue;

    // Check window of words around duration for "experience" or "exp"
    const windowStart = Math.max(0, rangeMatch.index - 50);
    const windowEnd = Math.min(text.length, rangeMatch.index + rangeMatch[0].length + 120);
    const context = text.slice(windowStart, windowEnd);
    if (/experience|exp\b/i.test(context)) {
      return minVal;
    }
  }

  // 2. Explicit keywords: "minimum 3 years", "at least 3 years", "min. 3 years"
  const prefixPattern = /(?:minimum|min\.?|at\s+least)\s+(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/gi;
  let prefixMatch;
  while ((prefixMatch = prefixPattern.exec(text)) !== null) {
    const val = parseFloat(prefixMatch[1]);
    if (!Number.isNaN(val) && val >= 0 && val <= MAX_PLAUSIBLE_EXPERIENCE) {
      return val;
    }
  }

  // 3. Single duration pattern tied to "experience", e.g. "3+ years of experience", "4 years experience"
  const durationPattern = /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/gi;
  let match;
  while ((match = durationPattern.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    if (Number.isNaN(value) || value < 0 || value > MAX_PLAUSIBLE_EXPERIENCE) continue;

    const tail = text.slice(match.index + match[0].length, match.index + match[0].length + 120);
    const words = tail.split(/[^\w-]+/).filter(Boolean).slice(0, MAX_INTERVENING_WORDS);
    const mentionsExperience = words.some((word) => /^(experience|exp)$/i.test(word));

    if (mentionsExperience) return value;
  }

  // 4. Standalone range fallback (if any range exists in text, return lower bound)
  rangePattern.lastIndex = 0;
  const firstRange = rangePattern.exec(text);
  if (firstRange) {
    const val = parseFloat(firstRange[1]);
    if (!Number.isNaN(val) && val >= 0 && val <= MAX_PLAUSIBLE_EXPERIENCE) return val;
  }

  // 5. Standalone duration fallback
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
      responsibilities: [],
      roleKeywords: []
    };
  }

  const { extractJobProfile } = require('./jdProfileService');
  const profile = extractJobProfile({
    title: jobTitle,
    description: jdText
  });

  const roleKeywords = new Set();
  if (jobTitle) {
    roleKeywords.add(jobTitle.trim());
    jobTitle.split(/\s+/).forEach((word) => {
      const clean = word.replace(/[^\w-]/g, '').trim();
      if (clean.length > 3 && !['Senior', 'Lead', 'Junior', 'Role', 'With'].includes(clean)) {
        roleKeywords.add(clean);
      }
    });
  }

  return {
    requiredSkills: profile.requiredSkills || [],
    preferredSkills: profile.preferredSkills || [],
    minimumExperience: profile.minimumExperience || 0,
    preferredEducation: profile.preferredEducation || [],
    responsibilities: profile.responsibilities || [],
    roleKeywords: Array.from(roleKeywords)
  };
};

module.exports = {
  extractJDRequirements,
  extractMinimumExperience
};
