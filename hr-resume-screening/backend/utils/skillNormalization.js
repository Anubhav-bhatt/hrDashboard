/**
 * Skill dictionary mapping aliases and variations to canonical skill names
 */
const CANONICAL_SKILL_MAP = {
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
  'rest apis': 'REST API',
  'graphql': 'GraphQL',
  'ci/cd': 'CI/CD'
};

/**
 * Normalizes a single skill string to canonical form
 */
const normalizeSkillName = (skillStr) => {
  if (!skillStr || typeof skillStr !== 'string') return '';
  const lower = skillStr.trim().toLowerCase();
  return CANONICAL_SKILL_MAP[lower] || (skillStr.trim().charAt(0).toUpperCase() + skillStr.trim().slice(1));
};

/**
 * Normalizes an array of skills, removing duplicates
 */
const normalizeSkillList = (skills) => {
  if (!Array.isArray(skills)) return [];
  const set = new Set();
  skills.forEach(s => {
    const normalized = normalizeSkillName(s);
    if (normalized) set.add(normalized);
  });
  return Array.from(set);
};

module.exports = {
  CANONICAL_SKILL_MAP,
  normalizeSkillName,
  normalizeSkillList
};
