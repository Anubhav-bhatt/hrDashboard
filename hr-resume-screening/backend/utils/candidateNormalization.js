/**
 * Normalizes candidate full name
 */
const normalizeName = (name) => {
  if (!name || typeof name !== 'string') return 'Unknown Candidate';
  
  const cleaned = name
    .replace(/[^\w\s\.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 2) return 'Unknown Candidate';

  return cleaned
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Normalizes candidate email address
 */
const normalizeEmail = (email) => {
  if (!email || typeof email !== 'string') return null;
  const cleaned = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleaned) ? cleaned : null;
};

/**
 * Normalizes phone numbers (especially Indian format +91XXXXXXXXXX)
 */
const normalizePhone = (phone) => {
  if (!phone || typeof phone !== 'string') return null;

  // Extract digits
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+91${digits}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  } else if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
};

const {
  canonicalizeSkill,
  normalizeSkillList,
  ALIAS_TO_CANONICAL
} = require('./skillTaxonomy');

/**
 * Map of common skill synonym variations to canonical skill names (backward-compatible)
 */
const SKILL_MAP = Object.fromEntries(ALIAS_TO_CANONICAL.entries());

/**
 * Normalizes and deduplicates an array of skills
 */
const normalizeSkills = (skills) => normalizeSkillList(skills);

module.exports = {
  normalizeName,
  normalizeEmail,
  normalizePhone,
  normalizeSkills,
  SKILL_MAP
};

