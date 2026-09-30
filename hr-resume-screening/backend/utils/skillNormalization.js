/**
 * Skill dictionary and normalization layer
 * Delegates to centralized skillTaxonomy while preserving backwards compatibility.
 */
const {
  canonicalizeSkill,
  normalizeSkillList,
  areSkillsEquivalent,
  findSkillsInText,
  getSkillCategory,
  ALIAS_TO_CANONICAL
} = require('./skillTaxonomy');

// Backward-compatible dictionary object
const CANONICAL_SKILL_MAP = Object.fromEntries(ALIAS_TO_CANONICAL.entries());

const normalizeSkillName = (skillStr) => canonicalizeSkill(skillStr);

module.exports = {
  CANONICAL_SKILL_MAP,
  normalizeSkillName,
  normalizeSkillList,
  areSkillsEquivalent,
  findSkillsInText,
  getSkillCategory
};
