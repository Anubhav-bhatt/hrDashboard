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

/**
 * Map of common skill synonym variations to canonical skill names
 */
const SKILL_MAP = {
  'reactjs': 'React',
  'react.js': 'React',
  'react': 'React',
  'nodejs': 'Node.js',
  'node.js': 'Node.js',
  'node': 'Node.js',
  'expressjs': 'Express',
  'express.js': 'Express',
  'express': 'Express',
  'mongodb': 'MongoDB',
  'mongo': 'MongoDB',
  'typescript': 'TypeScript',
  'ts': 'TypeScript',
  'javascript': 'JavaScript',
  'js': 'JavaScript',
  'html5': 'HTML',
  'html': 'HTML',
  'css3': 'CSS',
  'css': 'CSS',
  'tailwindcss': 'Tailwind CSS',
  'tailwind': 'Tailwind CSS',
  'nextjs': 'Next.js',
  'next.js': 'Next.js',
  'vuejs': 'Vue',
  'vue.js': 'Vue',
  'vue': 'Vue',
  'angularjs': 'Angular',
  'angular': 'Angular',
  'python': 'Python',
  'java': 'Java',
  'springboot': 'Spring Boot',
  'spring boot': 'Spring Boot',
  'postgresql': 'PostgreSQL',
  'postgres': 'PostgreSQL',
  'mysql': 'MySQL',
  'redis': 'Redis',
  'aws': 'AWS',
  'amazon web services': 'AWS',
  'docker': 'Docker',
  'kubernetes': 'Kubernetes',
  'git': 'Git',
  'github': 'GitHub',
  'rest api': 'REST API',
  'restful apis': 'REST API',
  'restful api': 'REST API',
  'graphql': 'GraphQL',
  'ci/cd': 'CI/CD'
};

/**
 * Normalizes and deduplicates an array of skills
 */
const normalizeSkills = (skills) => {
  if (!Array.isArray(skills)) return [];

  const uniqueSkills = new Set();

  skills.forEach(skill => {
    if (!skill || typeof skill !== 'string') return;
    const lower = skill.trim().toLowerCase();

    if (SKILL_MAP[lower]) {
      uniqueSkills.add(SKILL_MAP[lower]);
    } else if (skill.trim().length > 1) {
      // Capitalize first letter
      const formatted = skill.trim().charAt(0).toUpperCase() + skill.trim().slice(1);
      uniqueSkills.add(formatted);
    }
  });

  return Array.from(uniqueSkills);
};

module.exports = {
  normalizeName,
  normalizeEmail,
  normalizePhone,
  normalizeSkills
};
