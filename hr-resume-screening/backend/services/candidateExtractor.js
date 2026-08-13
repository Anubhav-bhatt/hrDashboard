const {
  normalizeName,
  normalizeEmail,
  normalizePhone,
  normalizeSkills
} = require('../utils/candidateNormalization');
const { parseResumeProfile } = require('./resumeProfileParser');

/**
 * List of known tech skills for case-insensitive dictionary matching
 */
const TECH_SKILL_DICTIONARY = [
  'React', 'React.js', 'ReactJS', 'Angular', 'Vue', 'Vue.js', 'JavaScript', 'JS',
  'TypeScript', 'TS', 'HTML', 'HTML5', 'CSS', 'CSS3', 'Tailwind', 'Tailwind CSS',
  'Next.js', 'Node.js', 'Node', 'Express', 'Express.js', 'NestJS', 'Java',
  'Spring Boot', 'Python', 'FastAPI', 'Django', 'C++', 'C#', '.NET', 'MongoDB',
  'PostgreSQL', 'MySQL', 'Redis', 'SQLite', 'AWS', 'Azure', 'GCP', 'Docker',
  'Kubernetes', 'Git', 'GitHub', 'Jenkins', 'CI/CD', 'REST API', 'RESTful API',
  'GraphQL', 'Microservices', 'Kafka', 'Redux', 'Jest', 'Webpack', 'Vite'
];

/**
 * Common job titles for current role inference
 */
const COMMON_ROLES = [
  'Senior React Developer', 'React Developer', 'Frontend Developer', 'Frontend Engineer',
  'Full Stack Developer', 'Full Stack Engineer', 'Software Engineer', 'Backend Developer',
  'Backend Engineer', 'Node.js Developer', 'Java Developer', 'Python Developer',
  'DevOps Engineer', 'Technical Lead', 'Software Developer', 'Web Developer'
];

/**
 * Extracts candidate Email address using regex
 */
const extractEmail = (text) => {
  if (!text) return null;
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches && matches.length > 0 ? normalizeEmail(matches[0]) : null;
};

/**
 * Extracts candidate Phone number
 */
const extractPhone = (text) => {
  if (!text) return null;

  // Regex matching Indian & International phone patterns like +91 9876543210, 98765-43210, (987) 654-3210
  const phoneRegex = /(?:\+91[\s-]?)?[6-9]\d{9}|\+(?:[0-9][\s-]?){10,14}/g;
  const matches = text.match(phoneRegex);

  if (!matches) return null;

  for (const match of matches) {
    const normalized = normalizePhone(match);
    if (normalized) return normalized;
  }

  return null;
};

/**
 * Infers Candidate Name from Resume Text, Email Sender, or Filename
 */
const extractName = (text, senderName = '', fileName = '') => {
  // Strategy 1: Check top 10 lines of resume text
  if (text) {
    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const EXCLUDED_HEADER_WORDS = [
      'CURRICULUM', 'VITAE', 'RESUME', 'CV', 'PROFILE', 'SUMMARY',
      'EMAIL', 'PHONE', 'MOBILE', 'CONTACT', 'EXPERIENCE', 'SKILLS',
      'EDUCATION', 'OBJECTIVE', 'PAGE'
    ];

    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i];
      const upperLine = line.toUpperCase();

      const hasExcludedWord = EXCLUDED_HEADER_WORDS.some(w => upperLine.includes(w));
      const hasNumbersOrSymbols = /[0-9@:\/\\]/.test(line);

      if (!hasExcludedWord && !hasNumbersOrSymbols && line.length >= 3 && line.length <= 40) {
        const candidateName = normalizeName(line);
        if (candidateName !== 'Unknown Candidate') {
          return { name: candidateName, nameSource: 'resume' };
        }
      }
    }
  }

  // Strategy 2: Fallback to Outlook Sender Name
  if (senderName && typeof senderName === 'string') {
    const candidateName = normalizeName(senderName);
    if (candidateName !== 'Unknown Candidate') {
      return { name: candidateName, nameSource: 'email' };
    }
  }

  // Strategy 3: Fallback to filename (e.g. Rahul_Sharma_Resume.pdf)
  if (fileName && typeof fileName === 'string') {
    const cleanFileName = fileName
      .replace(/\.[^/.]+$/, '') // remove extension
      .replace(/[_.-]/g, ' ')
      .replace(/\b(resume|cv|profile|document)\b/gi, '')
      .trim();

    const candidateName = normalizeName(cleanFileName);
    if (candidateName !== 'Unknown Candidate') {
      return { name: candidateName, nameSource: 'filename' };
    }
  }

  return { name: 'Unknown Candidate', nameSource: 'unknown' };
};

/**
 * Extracts Total Professional Experience in years
 */
const extractTotalExperience = (text) => {
  if (!text) return null;

  // Match patterns like "4+ years of experience", "3.5 yrs experience", "Experience: 5 years"
  const expRegexes = [
    /(\d+(?:\.\d+)?)\s*(?:\+|\s*plus)?\s*(?:years?|yrs?)(?:\s*of)?\s*experience/i,
    /total\s*experience\s*:\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i,
    /experience\s*:\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i
  ];

  for (const regex of expRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const years = parseFloat(match[1]);
      if (!isNaN(years) && years >= 0 && years <= 45) {
        return years;
      }
    }
  }

  return null;
};

/**
 * Extracts skills matching dictionary
 */
const extractSkills = (text) => {
  if (!text) return [];

  const foundSkills = [];
  const lowerText = text.toLowerCase();

  TECH_SKILL_DICTIONARY.forEach(skill => {
    // Regex boundary check for exact word matching
    const escaped = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(lowerText)) {
      foundSkills.push(skill);
    }
  });

  return normalizeSkills(foundSkills);
};

/**
 * Extracts education qualifications
 */
const extractEducation = (text) => {
  if (!text) return [];

  const DEGREE_REGEXES = [
    /B\.?Tech\b(?:\s+in\s+[\w\s]+)?/i,
    /B\.?E\.?\b(?:\s+in\s+[\w\s]+)?/i,
    /BCA\b/i,
    /MCA\b/i,
    /M\.?Tech\b/i,
    /MBA\b/i,
    /B\.?Sc\b/i,
    /M\.?Sc\b/i,
    /Bachelor of Technology/i,
    /Master of Computer Applications/i,
    /Bachelor of Computer Applications/i
  ];

  const degrees = new Set();

  DEGREE_REGEXES.forEach(regex => {
    const match = text.match(regex);
    if (match) {
      degrees.add(match[0].trim());
    }
  });

  return Array.from(degrees);
};

/**
 * Extracts Current Role
 */
const extractCurrentRole = (text) => {
  if (!text) return null;

  for (const role of COMMON_ROLES) {
    const regex = new RegExp(`\\b${role}\\b`, 'i');
    if (regex.test(text)) {
      return role;
    }
  }

  return null;
};

/**
 * Known locations for city extraction
 */
const KNOWN_LOCATIONS = [
  'Gurugram', 'Gurgaon', 'Noida', 'Delhi', 'New Delhi', 'NCR', 'Bangalore', 'Bengaluru',
  'Hyderabad', 'Pune', 'Mumbai', 'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Chandigarh', 'Remote'
];

/**
 * Extracts candidate location
 */
const extractLocation = (text) => {
  if (!text) return null;

  for (const loc of KNOWN_LOCATIONS) {
    const regex = new RegExp(`\\b${loc}\\b`, 'i');
    if (regex.test(text)) {
      if (loc.toLowerCase() === 'gurgaon') return 'Gurugram';
      if (loc.toLowerCase() === 'bangalore') return 'Bengaluru';
      return loc;
    }
  }

  return null;
};

/**
 * Extracts candidate salary (Current & Expected CTC) in numeric annual INR
 */
const extractSalary = (text) => {
  if (!text) return { currentSalary: null, expectedSalary: null };

  let currentSalary = null;
  let expectedSalary = null;

  // Pattern for Current CTC (e.g. Current CTC: 7 LPA, Current Salary: 6.5 Lakhs)
  const currentRegex = /(?:current|present|existing)\s*(?:ctc|salary|package)\s*[:=]?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(lpa|lakhs?|lac|l)?/i;
  const currentMatch = text.match(currentRegex);
  if (currentMatch && currentMatch[1]) {
    const num = parseFloat(currentMatch[1]);
    const unit = (currentMatch[2] || 'lpa').toLowerCase();
    if (!isNaN(num)) {
      currentSalary = unit.startsWith('l') ? Math.round(num * 100000) : Math.round(num);
    }
  }

  // Pattern for Expected CTC (e.g. Expected CTC: 10 LPA, Expected Salary: 12 Lakhs)
  const expectedRegex = /(?:expected|desired|target)\s*(?:ctc|salary|package)\s*[:=]?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(lpa|lakhs?|lac|l)?/i;
  const expectedMatch = text.match(expectedRegex);
  if (expectedMatch && expectedMatch[1]) {
    const num = parseFloat(expectedMatch[1]);
    const unit = (expectedMatch[2] || 'lpa').toLowerCase();
    if (!isNaN(num)) {
      expectedSalary = unit.startsWith('l') ? Math.round(num * 100000) : Math.round(num);
    }
  }

  // Generic fallback if LPA mentioned without current/expected label
  if (!currentSalary && !expectedSalary) {
    const genericLpaRegex = /(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|lac)\b/i;
    const genMatch = text.match(genericLpaRegex);
    if (genMatch && genMatch[1]) {
      const num = parseFloat(genMatch[1]);
      if (!isNaN(num) && num > 0 && num <= 100) {
        currentSalary = Math.round(num * 100000);
      }
    }
  }

  return { currentSalary, expectedSalary };
};

/**
 * Derives normalized primary qualification from education degrees
 */
const extractPrimaryQualification = (educationList = []) => {
  if (!Array.isArray(educationList) || educationList.length === 0) return null;

  for (const edu of educationList) {
    const upper = edu.toUpperCase();
    if (upper.includes('B.TECH') || upper.includes('BACHELOR OF TECHNOLOGY')) return 'B.Tech';
    if (upper.includes('B.E.') || upper.includes('BACHELOR OF ENGINEERING')) return 'B.E.';
    if (upper.includes('M.TECH') || upper.includes('MASTER OF TECHNOLOGY')) return 'M.Tech';
    if (upper.includes('MCA') || upper.includes('MASTER OF COMPUTER APPLICATIONS')) return 'MCA';
    if (upper.includes('BCA') || upper.includes('BACHELOR OF COMPUTER APPLICATIONS')) return 'BCA';
    if (upper.includes('MBA') || upper.includes('MASTER OF BUSINESS')) return 'MBA';
    if (upper.includes('B.SC') || upper.includes('BACHELOR OF SCIENCE')) return 'B.Sc';
    if (upper.includes('M.SC') || upper.includes('MASTER OF SCIENCE')) return 'M.Sc';
    if (upper.includes('DIPLOMA')) return 'Diploma';
  }

  return educationList[0] || null;
};

/**
 * Parses full candidate profile from resume text & metadata.
 *
 * Section-aware extraction (services/resumeProfileParser.js) supplies the
 * structured profile; the dictionary-based extractors above remain the source
 * for skills and salary. Where both can supply a field, the section-aware value
 * wins because it understands document context — a city listed under a previous
 * employer is not the candidate's current location.
 */
const extractCandidateProfile = (resumeText, metadata = {}) => {
  const { senderName = '', senderEmail = '', fileName = '' } = metadata;

  const profile = parseResumeProfile(resumeText);

  const email = profile.emails[0] || extractEmail(resumeText) || normalizeEmail(senderEmail);
  const alternateEmail = profile.emails.find((e) => e !== email) || null;

  const phones = profile.phones.map(normalizePhone).filter(Boolean);
  const phone = phones[0] || extractPhone(resumeText);
  const alternatePhone = phones.find((p) => p !== phone) || null;

  const { name, nameSource } = extractName(resumeText, senderName, fileName);

  // An explicitly stated total ("Total Experience: 7 years") is the candidate's
  // own claim and takes precedence; the computed figure from dated employment
  // history is the fallback when no total is stated.
  const statedExperience = extractTotalExperience(resumeText);
  const totalExperience = statedExperience !== null ? statedExperience : profile.computedExperienceYears;

  const skills = extractSkills(resumeText);
  const educationStrings = profile.education.length
    ? profile.education.map((e) => [e.degree, e.specialisation && `in ${e.specialisation}`, e.institution]
        .filter(Boolean)
        .join(' ')
        .trim())
      .filter(Boolean)
    : extractEducation(resumeText);

  const currentRole = profile.headline || extractCurrentRole(resumeText);
  const currentLocation = profile.currentLocation || extractLocation(resumeText);
  const { currentSalary, expectedSalary } = extractSalary(resumeText);
  const qualification =
    (profile.education[0] && profile.education[0].degree) ||
    extractPrimaryQualification(educationStrings.length ? educationStrings : extractEducation(resumeText));

  // Project titles only — descriptions live in the structured profile.
  const projects = profile.projects.map((p) => p.name || p.description).filter(Boolean).slice(0, 10);

  const warnings = [];
  if (!email) warnings.push('Candidate email address could not be extracted.');
  if (!phone) warnings.push('Candidate phone number could not be extracted.');
  if (totalExperience === null) warnings.push('Total experience could not be determined from the resume.');
  if (skills.length === 0) warnings.push('No recognised technical skills were found in the resume.');
  if (!profile.detectedSections.length) {
    warnings.push('No standard resume sections were detected; the document may be unstructured or scanned.');
  }

  const extractionStatus = warnings.length > 0 ? 'PARTIAL' : 'SUCCESS';

  return {
    name,
    nameSource,
    email,
    alternateEmail,
    phone,
    alternatePhone,
    currentRole,
    headline: profile.headline,
    summary: profile.summary,
    linkedinUrl: profile.links.linkedinUrl,
    githubUrl: profile.links.githubUrl,
    portfolioUrl: profile.links.portfolioUrl,
    totalExperience,
    currentLocation,
    preferredLocations: currentLocation ? [currentLocation] : [],
    currentSalary,
    expectedSalary,
    qualification,
    skills,
    education: educationStrings,
    projects,
    parsedProfile: profile,
    extractionStatus,
    extractionWarnings: warnings
  };
};

module.exports = {
  extractEmail,
  extractPhone,
  extractName,
  extractTotalExperience,
  extractSkills,
  extractEducation,
  extractCurrentRole,
  extractLocation,
  extractSalary,
  extractPrimaryQualification,
  extractCandidateProfile
};
