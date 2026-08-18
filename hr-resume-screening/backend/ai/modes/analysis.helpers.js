/**
 * Shared analysis helpers used across AI Agent modes (Screening, Ranking, Comparison).
 *
 * Provides deterministic, authoritative rule evaluation for:
 *   - Fit level classification
 *   - Skill criteria matching (mandatory vs. preferred)
 *   - Mandatory requirement gap detection
 *   - Experience threshold evaluation
 *   - Priority instruction parsing
 *   - Evidence-based risk identification
 *   - Data warning detection for missing/unmodelled fields
 */

const FIT_LEVELS = Object.freeze({
  VERY_STRONG: 'VERY_STRONG',
  STRONG: 'STRONG',
  MODERATE: 'MODERATE',
  WEAK: 'WEAK',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
});

const RECOMMENDATIONS = Object.freeze({
  PROCEED_TO_REVIEW: 'PROCEED_TO_REVIEW',
  REVIEW_WITH_CAUTION: 'REVIEW_WITH_CAUTION',
  NEEDS_MORE_INFORMATION: 'NEEDS_MORE_INFORMATION',
  LOW_PRIORITY: 'LOW_PRIORITY'
});

/**
 * Maps an authoritative numeric score (0-100) to standard fit levels.
 *
 * @param {number|null} score
 * @param {boolean} isScored
 * @returns {string}
 */
const computeFitLevel = (score, isScored = true) => {
  if (!isScored || score === null || score === undefined || Number.isNaN(score)) {
    return FIT_LEVELS.INSUFFICIENT_DATA;
  }
  if (score >= 90) return FIT_LEVELS.VERY_STRONG;
  if (score >= 80) return FIT_LEVELS.STRONG;
  if (score >= 65) return FIT_LEVELS.MODERATE;
  return FIT_LEVELS.WEAK;
};

/**
 * Normalizes a skill string for case-insensitive and whitespace-trimmed comparison.
 *
 * @param {string} skill
 * @returns {string}
 */
const normalize = (skill) => (typeof skill === 'string' ? skill.trim().toLowerCase() : '');

/**
 * Checks whether candidate skills include the target skill.
 *
 * @param {string[]} candidateSkills
 * @param {string} targetSkill
 * @returns {boolean}
 */
const candidateHasSkill = (candidateSkills = [], targetSkill) => {
  const normTarget = normalize(targetSkill);
  if (!normTarget) return false;
  return (candidateSkills || []).some((s) => {
    const norm = normalize(s);
    return norm === normTarget || norm.includes(normTarget) || normTarget.includes(norm);
  });
};

/**
 * Evaluates required and preferred skills against candidate skills.
 *
 * @param {string[]} requiredSkills
 * @param {string[]} preferredSkills
 * @param {string[]} candidateSkills
 */
const evaluateSkills = (requiredSkills = [], preferredSkills = [], candidateSkills = []) => {
  const matchedRequired = [];
  const missingRequired = [];
  const matchedPreferred = [];
  const missingPreferred = [];

  for (const skill of requiredSkills || []) {
    if (candidateHasSkill(candidateSkills, skill)) {
      matchedRequired.push(skill);
    } else {
      missingRequired.push(skill);
    }
  }

  for (const skill of preferredSkills || []) {
    if (candidateHasSkill(candidateSkills, skill)) {
      matchedPreferred.push(skill);
    } else {
      missingPreferred.push(skill);
    }
  }

  return {
    matchedRequired,
    missingRequired,
    matchedPreferred,
    missingPreferred,
    hasMandatoryGaps: missingRequired.length > 0
  };
};

/**
 * Detects missing mandatory skills explicitly.
 *
 * @param {string[]} requiredSkills
 * @param {string[]} candidateSkills
 * @returns {string[]}
 */
const detectMandatoryGaps = (requiredSkills = [], candidateSkills = []) => {
  return (requiredSkills || []).filter((skill) => !candidateHasSkill(candidateSkills, skill));
};

/**
 * Evaluates candidate experience against minimum requirement.
 *
 * @param {number|null} minExp
 * @param {number|null} candExp
 */
const evaluateExperience = (minExp, candExp) => {
  if (minExp === null || minExp === undefined || minExp <= 0) {
    return {
      status: 'NOT_REQUIRED',
      meetsRequirement: true,
      minExp: 0,
      candExp: candExp ?? null
    };
  }

  if (candExp === null || candExp === undefined) {
    return {
      status: 'UNKNOWN',
      meetsRequirement: false,
      minExp,
      candExp: null,
      message: 'Candidate experience duration is not recorded.'
    };
  }

  const meets = candExp >= minExp;
  return {
    status: meets ? 'MATCH' : 'GAP',
    meetsRequirement: meets,
    minExp,
    candExp,
    message: meets
      ? `Candidate has ${candExp} years experience (meets minimum ${minExp} years).`
      : `Candidate has ${candExp} years experience (below minimum ${minExp} years).`
  };
};

/**
 * Deterministically checks optional user instruction against candidate skills and profile.
 *
 * @param {string|null} instruction
 * @param {Object} candidate
 * @param {Object} jobRequirements
 * @returns {{ applied: boolean, matches: string[], reason?: string }}
 */
const evaluatePriorityInstruction = (instruction, candidate, jobRequirements) => {
  if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
    return { applied: false, matches: [] };
  }

  const text = instruction.toLowerCase();
  const candSkills = (candidate && candidate.skills) || [];
  const matchedTerms = [];

  // Extract candidate skills mentioned in instruction
  for (const skill of candSkills) {
    const s = normalize(skill);
    if (s && text.includes(s)) {
      matchedTerms.push(skill);
    }
  }

  // Also check all job skills mentioned in instruction that candidate has
  const allJobSkills = [
    ...((jobRequirements && jobRequirements.requiredSkills) || []),
    ...((jobRequirements && jobRequirements.preferredSkills) || [])
  ];

  for (const skill of allJobSkills) {
    const s = normalize(skill);
    if (s && text.includes(s) && candidateHasSkill(candSkills, skill)) {
      if (!matchedTerms.includes(skill)) matchedTerms.push(skill);
    }
  }

  if (matchedTerms.length > 0) {
    return {
      applied: true,
      matches: matchedTerms,
      reason: `Instruction prioritized: ${matchedTerms.join(', ')}`
    };
  }

  return {
    applied: false,
    matches: [],
    reason: 'Instruction did not match known candidate skills.'
  };
};

/**
 * Identifies evidence-based risks without subjective judgments.
 *
 * @param {Object} params
 * @param {string[]} params.missingRequired
 * @param {Object} params.expEval
 * @param {Object} [params.candidateLocation]
 * @param {string[]} [params.preferredLocations]
 * @param {number|null} [params.candSalary]
 * @param {number|null} [params.salaryMax]
 * @returns {string[]}
 */
const identifyRisks = ({
  missingRequired = [],
  expEval,
  candidateLocation,
  preferredLocations = [],
  candSalary,
  salaryMax
}) => {
  const risks = [];

  for (const missing of missingRequired) {
    risks.push(`Missing mandatory skill: ${missing}`);
  }

  if (expEval && expEval.status === 'GAP') {
    risks.push(expEval.message || 'Total experience is below minimum job requirement.');
  }

  if (
    preferredLocations &&
    preferredLocations.length > 0 &&
    candidateLocation &&
    candidateLocation.current
  ) {
    const cur = normalize(candidateLocation.current);
    const inPreferred = preferredLocations.some((loc) => normalize(loc) === cur || cur.includes(normalize(loc)));
    if (!inPreferred) {
      risks.push(`Current location (${candidateLocation.current}) is outside preferred job locations.`);
    }
  }

  if (salaryMax && candSalary && candSalary > salaryMax) {
    risks.push(`Candidate expected compensation (${candSalary}) exceeds job maximum budget (${salaryMax}).`);
  }

  return risks;
};

/**
 * Detects missing or unmodelled data warnings.
 *
 * @param {Object} candidate
 * @param {Object} job
 * @returns {string[]}
 */
const detectDataWarnings = (candidate, job) => {
  const warnings = [];

  if (
    !candidate ||
    candidate.experience?.statedYears === null ||
    candidate.experience?.statedYears === undefined
  ) {
    warnings.push('Candidate experience duration is not recorded in profile.');
  }

  if (!candidate || !candidate.location?.current) {
    warnings.push('Candidate current location is not recorded.');
  }

  warnings.push('Candidate notice period is not captured in the current data model.');

  if (!candidate || !candidate.score?.isScored) {
    warnings.push('Candidate has not been evaluated by the matching engine yet.');
  }

  if (!job || !job.requirements?.requiredSkills || job.requirements.requiredSkills.length === 0) {
    warnings.push('Job has no explicit required skills defined.');
  }

  return warnings;
};

/**
 * Computes recommendation based on score, fit level, and mandatory gaps.
 *
 * @param {string} fitLevel
 * @param {boolean} hasMandatoryGaps
 * @param {boolean} isScored
 * @returns {string}
 */
const computeRecommendation = (fitLevel, hasMandatoryGaps, isScored) => {
  if (!isScored || fitLevel === FIT_LEVELS.INSUFFICIENT_DATA) {
    return RECOMMENDATIONS.NEEDS_MORE_INFORMATION;
  }
  if (hasMandatoryGaps) {
    return RECOMMENDATIONS.REVIEW_WITH_CAUTION;
  }
  if (fitLevel === FIT_LEVELS.VERY_STRONG || fitLevel === FIT_LEVELS.STRONG) {
    return RECOMMENDATIONS.PROCEED_TO_REVIEW;
  }
  if (fitLevel === FIT_LEVELS.MODERATE) {
    return RECOMMENDATIONS.PROCEED_TO_REVIEW;
  }
  return RECOMMENDATIONS.LOW_PRIORITY;
};

module.exports = {
  FIT_LEVELS,
  RECOMMENDATIONS,
  computeFitLevel,
  evaluateSkills,
  detectMandatoryGaps,
  evaluateExperience,
  evaluatePriorityInstruction,
  identifyRisks,
  detectDataWarnings,
  computeRecommendation
};
