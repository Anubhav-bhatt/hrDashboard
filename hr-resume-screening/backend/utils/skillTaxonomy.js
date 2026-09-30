/**
 * Centralized Skill Taxonomy and Normalization Layer
 *
 * Provides a canonical taxonomy, comprehensive alias dictionary, multi-word pattern matching,
 * category classification, and boundary-safe text extraction for both Job Descriptions and Resumes.
 */

/** Canonical skill definitions with categories and aliases */
const SKILL_TAXONOMY = [
  // Languages
  {
    canonical: 'JavaScript',
    category: 'language',
    aliases: ['javascript', 'js', 'es6', 'es6+', 'es2015', 'es2020', 'ecmascript']
  },
  {
    canonical: 'TypeScript',
    category: 'language',
    aliases: ['typescript', 'ts']
  },
  {
    canonical: 'Python',
    category: 'language',
    aliases: ['python', 'python3', 'python 3', 'py']
  },
  {
    canonical: 'Java',
    category: 'language',
    aliases: ['java', 'core java', 'java 8', 'java 11', 'java 17', 'j2ee']
  },
  {
    canonical: 'C++',
    category: 'language',
    aliases: ['c++', 'cpp']
  },
  {
    canonical: 'C#',
    category: 'language',
    aliases: ['c#', 'csharp', 'c-sharp']
  },
  {
    canonical: 'Go',
    category: 'language',
    aliases: ['golang', 'go language']
  },
  {
    canonical: 'PHP',
    category: 'language',
    aliases: ['php', 'php7', 'php8']
  },
  {
    canonical: 'Ruby',
    category: 'language',
    aliases: ['ruby']
  },
  {
    canonical: 'Rust',
    category: 'language',
    aliases: ['rust', 'rustlang']
  },
  {
    canonical: 'SQL',
    category: 'language',
    aliases: ['sql', 't-sql', 'pl/sql', 'plsql', 'structured query language']
  },
  {
    canonical: 'HTML',
    category: 'frontend',
    aliases: ['html', 'html5']
  },
  {
    canonical: 'CSS',
    category: 'frontend',
    aliases: ['css', 'css3', 'scss', 'sass', 'less']
  },

  // Frontend Frameworks & Libraries
  {
    canonical: 'React',
    category: 'frontend',
    aliases: ['react', 'reactjs', 'react.js', 'react js', 'react framework', 'react library']
  },
  {
    canonical: 'React Native',
    category: 'mobile',
    aliases: ['react native', 'react-native']
  },
  {
    canonical: 'Next.js',
    category: 'frontend',
    aliases: ['nextjs', 'next.js', 'next js', 'next']
  },
  {
    canonical: 'Vue',
    category: 'frontend',
    aliases: ['vue', 'vuejs', 'vue.js', 'vue js', 'vue 3', 'vue 2']
  },
  {
    canonical: 'Nuxt.js',
    category: 'frontend',
    aliases: ['nuxtjs', 'nuxt.js', 'nuxt']
  },
  {
    canonical: 'Angular',
    category: 'frontend',
    aliases: ['angular', 'angularjs', 'angular.js', 'angular 2+', 'angular 14', 'angular 15', 'angular 16']
  },
  {
    canonical: 'Svelte',
    category: 'frontend',
    aliases: ['svelte', 'sveltekit', 'svelte.js']
  },
  {
    canonical: 'Redux',
    category: 'frontend',
    aliases: ['redux', 'redux toolkit', 'rtk', 'redux-thunk', 'redux-saga']
  },
  {
    canonical: 'Tailwind CSS',
    category: 'frontend',
    aliases: ['tailwindcss', 'tailwind css', 'tailwind', 'tailwind-css']
  },
  {
    canonical: 'Material UI',
    category: 'frontend',
    aliases: ['material ui', 'material-ui', 'mui']
  },
  {
    canonical: 'Bootstrap',
    category: 'frontend',
    aliases: ['bootstrap', 'bootstrap 5', 'bootstrap 4']
  },
  {
    canonical: 'Webpack',
    category: 'frontend',
    aliases: ['webpack', 'webpack 5']
  },
  {
    canonical: 'Vite',
    category: 'frontend',
    aliases: ['vite', 'vitejs', 'vite.js']
  },

  // APIs & Architecture
  {
    canonical: 'REST API',
    category: 'architecture',
    aliases: [
      'rest api', 'rest apis', 'restful api', 'restful apis', 'restful services',
      'restful web services', 'restful', 'rest services', 'rest architecture', 'web apis', 'rest'
    ]
  },
  {
    canonical: 'GraphQL',
    category: 'architecture',
    aliases: ['graphql', 'apollo graphql', 'apollo client', 'apollo server']
  },
  {
    canonical: 'Microservices',
    category: 'architecture',
    aliases: ['microservices', 'micro-services', 'microservice architecture']
  },
  {
    canonical: 'gRPC',
    category: 'architecture',
    aliases: ['grpc']
  },
  {
    canonical: 'WebSockets',
    category: 'architecture',
    aliases: ['websocket', 'websockets', 'socket.io']
  },
  {
    canonical: 'Reusable Components',
    category: 'architecture',
    aliases: [
      'reusable components', 'component library', 'component libraries',
      'design system', 'design systems', 'ui component library', 'shared components'
    ]
  },
  {
    canonical: 'Scalable Web Applications',
    category: 'architecture',
    aliases: [
      'scalable web applications', 'scalable applications', 'scalable systems',
      'high-throughput systems', 'system architecture', 'large-scale web applications'
    ]
  },

  // Backend Frameworks
  {
    canonical: 'Node.js',
    category: 'backend',
    aliases: ['nodejs', 'node.js', 'node js', 'node']
  },
  {
    canonical: 'Express',
    category: 'backend',
    aliases: ['express', 'expressjs', 'express.js', 'express js']
  },
  {
    canonical: 'NestJS',
    category: 'backend',
    aliases: ['nestjs', 'nest.js', 'nest js']
  },
  {
    canonical: 'Spring Boot',
    category: 'backend',
    aliases: ['spring boot', 'springboot', 'spring framework', 'spring mvc']
  },
  {
    canonical: 'Django',
    category: 'backend',
    aliases: ['django', 'django rest framework', 'drf']
  },
  {
    canonical: 'FastAPI',
    category: 'backend',
    aliases: ['fastapi', 'fast api']
  },
  {
    canonical: 'Flask',
    category: 'backend',
    aliases: ['flask']
  },
  {
    canonical: '.NET',
    category: 'backend',
    aliases: ['.net', '.net core', 'dotnet', 'asp.net', 'asp.net core']
  },
  {
    canonical: 'Ruby on Rails',
    category: 'backend',
    aliases: ['ruby on rails', 'rails']
  },
  {
    canonical: 'Laravel',
    category: 'backend',
    aliases: ['laravel']
  },

  // Databases & Storage
  {
    canonical: 'PostgreSQL',
    category: 'database',
    aliases: ['postgresql', 'postgres', 'psql', 'postgres db', 'pg']
  },
  {
    canonical: 'MongoDB',
    category: 'database',
    aliases: ['mongodb', 'mongo', 'mongo db']
  },
  {
    canonical: 'MySQL',
    category: 'database',
    aliases: ['mysql']
  },
  {
    canonical: 'Redis',
    category: 'database',
    aliases: ['redis', 'redis cache']
  },
  {
    canonical: 'SQLite',
    category: 'database',
    aliases: ['sqlite', 'sqlite3']
  },
  {
    canonical: 'Oracle',
    category: 'database',
    aliases: ['oracle', 'oracle database', 'oracle db']
  },
  {
    canonical: 'SQL Server',
    category: 'database',
    aliases: ['sql server', 'mssql', 'microsoft sql server']
  },
  {
    canonical: 'DynamoDB',
    category: 'database',
    aliases: ['dynamodb', 'dynamo db', 'aws dynamodb']
  },
  {
    canonical: 'Cassandra',
    category: 'database',
    aliases: ['cassandra', 'apache cassandra']
  },
  {
    canonical: 'Elasticsearch',
    category: 'database',
    aliases: ['elasticsearch', 'elastic search']
  },
  {
    canonical: 'Prisma',
    category: 'database',
    aliases: ['prisma', 'prisma orm']
  },
  {
    canonical: 'Mongoose',
    category: 'database',
    aliases: ['mongoose']
  },

  // Cloud & DevOps
  {
    canonical: 'AWS',
    category: 'cloud',
    aliases: [
      'aws', 'amazon web services', 'amazon aws', 'aws s3', 'aws ec2',
      'aws lambda', 'aws ecs', 'aws rds', 'aws cloudfront'
    ]
  },
  {
    canonical: 'Azure',
    category: 'cloud',
    aliases: ['azure', 'microsoft azure', 'azure devops', 'azure cloud']
  },
  {
    canonical: 'GCP',
    category: 'cloud',
    aliases: ['gcp', 'google cloud', 'google cloud platform']
  },
  {
    canonical: 'Docker',
    category: 'devops',
    aliases: ['docker', 'containerization', 'docker containers', 'dockerfile', 'docker-compose']
  },
  {
    canonical: 'Kubernetes',
    category: 'devops',
    aliases: ['kubernetes', 'k8s']
  },
  {
    canonical: 'CI/CD',
    category: 'devops',
    aliases: ['ci/cd', 'ci cd', 'continuous integration', 'continuous deployment']
  },
  {
    canonical: 'Git',
    category: 'devops',
    aliases: ['git', 'github', 'gitlab', 'bitbucket', 'version control', 'git flow']
  },
  {
    canonical: 'Jenkins',
    category: 'devops',
    aliases: ['jenkins']
  },
  {
    canonical: 'Terraform',
    category: 'devops',
    aliases: ['terraform', 'iac', 'infrastructure as code']
  },
  {
    canonical: 'Linux',
    category: 'devops',
    aliases: ['linux', 'ubuntu', 'centos', 'debian', 'bash scripting', 'shell scripting']
  },
  {
    canonical: 'Nginx',
    category: 'devops',
    aliases: ['nginx']
  },
  {
    canonical: 'Kafka',
    category: 'data',
    aliases: ['kafka', 'apache kafka']
  },
  {
    canonical: 'RabbitMQ',
    category: 'data',
    aliases: ['rabbitmq', 'rabbit mq']
  },

  // Testing
  {
    canonical: 'Jest',
    category: 'testing',
    aliases: ['jest', 'jestjs']
  },
  {
    canonical: 'React Testing Library',
    category: 'testing',
    aliases: ['react testing library', 'rtl', '@testing-library/react']
  },
  {
    canonical: 'Cypress',
    category: 'testing',
    aliases: ['cypress', 'cypress.io']
  },
  {
    canonical: 'Playwright',
    category: 'testing',
    aliases: ['playwright']
  },
  {
    canonical: 'Selenium',
    category: 'testing',
    aliases: ['selenium', 'selenium webdriver']
  },
  {
    canonical: 'Vitest',
    category: 'testing',
    aliases: ['vitest']
  },
  {
    canonical: 'Mocha',
    category: 'testing',
    aliases: ['mocha', 'mocha.js']
  }
];

/** Fast lookup map: lower-case string -> canonical name */
const ALIAS_TO_CANONICAL = new Map();
const CANONICAL_TO_CATEGORY = new Map();
const ALL_CANONICAL_SET = new Set();

// Pre-populate lookups
for (const entry of SKILL_TAXONOMY) {
  const canonical = entry.canonical;
  ALL_CANONICAL_SET.add(canonical);
  CANONICAL_TO_CATEGORY.set(canonical, entry.category);

  // Map lowercase canonical
  ALIAS_TO_CANONICAL.set(canonical.toLowerCase(), canonical);

  // Map each alias
  for (const alias of entry.aliases) {
    ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
  }
}

/**
 * Escapes regex special characters
 */
const escapeRegex = (str) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

/**
 * Normalizes a single skill string to canonical form
 * @param {string} skillStr
 * @returns {string}
 */
const canonicalizeSkill = (skillStr) => {
  if (!skillStr || typeof skillStr !== 'string') return '';
  const trimmed = skillStr.trim();
  const lower = trimmed.toLowerCase();

  if (ALIAS_TO_CANONICAL.has(lower)) {
    return ALIAS_TO_CANONICAL.get(lower);
  }

  // Handle common trailing punctuation or version suffixes (e.g. "React.js" -> "React", "Python 3.10" -> "Python")
  const stripped = lower.replace(/\.(js|ts|py|net)$/i, '').replace(/\sv?\d+(\.\d+)*$/i, '').trim();
  if (ALIAS_TO_CANONICAL.has(stripped)) {
    return ALIAS_TO_CANONICAL.get(stripped);
  }

  // Format non-dictionary skills in Title Case
  return trimmed
    .split(/\s+/)
    .map((w) => (w.length <= 3 && !['and', 'for', 'the'].includes(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
};

/**
 * Deduplicates and normalizes an array of skills
 * @param {string[]} skills
 * @returns {string[]}
 */
const normalizeSkillList = (skills) => {
  if (!Array.isArray(skills)) return [];
  const set = new Set();
  for (const s of skills) {
    if (!s) continue;
    const canon = canonicalizeSkill(s);
    if (canon && canon.length > 0) {
      set.add(canon);
    }
  }
  return Array.from(set);
};

/**
 * Checks if two skill representations are equivalent
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const areSkillsEquivalent = (a, b) => {
  if (!a || !b) return false;
  return canonicalizeSkill(a) === canonicalizeSkill(b);
};

/**
 * Returns skill category (e.g. 'frontend', 'backend', 'database', etc.)
 * @param {string} skill
 * @returns {string}
 */
const getSkillCategory = (skill) => {
  const canon = canonicalizeSkill(skill);
  return CANONICAL_TO_CATEGORY.get(canon) || 'general';
};

/**
 * Sort aliases by length descending so longer multi-word phrases match before single words
 */
const SORTED_ALIASES = Array.from(ALIAS_TO_CANONICAL.keys()).sort((a, b) => b.length - a.length);

/**
 * Scans text using word boundaries to safely extract all mentioned skills.
 * Handles multi-word phrases (e.g. 'REST APIs', 'Spring Boot', 'Tailwind CSS')
 * and short symbols ('C++', 'C#', 'Go').
 *
 * @param {string} text
 * @returns {string[]} Deduplicated canonical skills found
 */
const findSkillsInText = (text) => {
  if (!text || typeof text !== 'string') return [];
  const found = new Set();
  const lowerText = ` ${text.toLowerCase()} `;

  for (const alias of SORTED_ALIASES) {
    // Avoid single-letter false matches unless very specific
    if (alias.length <= 1) continue;

    // Word boundary handling for symbols like C++, C#, .NET
    let pattern;
    if (alias === 'c++') {
      pattern = /(?:^|[^\w])c\+\+(?:$|[^\w])/i;
    } else if (alias === 'c#') {
      pattern = /(?:^|[^\w])c#(?:$|[^\w])/i;
    } else if (alias === '.net' || alias === '.net core') {
      pattern = /(?:^|[^\w])\.net(?:\s*core)?(?:$|[^\w])/i;
    } else if (alias === 'go') {
      // Must be uppercase GO or followed by language/developer/engineer to avoid common word 'go'
      pattern = /\b(?:golang|go\s+(?:language|developer|dev|engineer|backend))\b/i;
    } else {
      const escaped = escapeRegex(alias);
      pattern = new RegExp(`(?:^|[^a-zA-Z0-9_])${escaped}(?:$|[^a-zA-Z0-9_])`, 'i');
    }

    if (pattern.test(lowerText)) {
      const canon = ALIAS_TO_CANONICAL.get(alias);
      if (canon) found.add(canon);
    }
  }

  return Array.from(found);
};

module.exports = {
  SKILL_TAXONOMY,
  ALIAS_TO_CANONICAL,
  CANONICAL_TO_CATEGORY,
  ALL_CANONICAL_SET,
  canonicalizeSkill,
  normalizeSkillList,
  areSkillsEquivalent,
  getSkillCategory,
  findSkillsInText
};
