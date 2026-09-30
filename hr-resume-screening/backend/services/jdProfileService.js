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

const ACTION_VERBS_REGEX = /^(?:build|develop|design|implement|lead|architect|maintain|collaborate|create|deliver|work|participate|optimize|manage|ensure|write|review|deploy|scale|integrate|test|troubleshoot|analyze|coordinate|support|refactor)\b/i;

const BOILERPLATE_TITLE_REGEX = /^(?:about\s+us|company\s+overview|job\s+description|job\s+summary|overview|who\s+we\s+are|the\s+opportunity|join\s+our\s+team|about\s+the\s+role|role\s+overview|position\s+summary|we\s+are\s+hiring|career\s+opportunity|introduction|summary|requirements|qualifications|responsibilities|skills)$/i;

const ROLE_INDICATOR_REGEX = /\b(developer|engineer|architect|lead|designer|analyst|specialist|manager|administrator|consultant|scientist|programmer|intern|tester|qa|sdet|devops|sre|fullstack|frontend|backend)\b/i;

/**
 * Extracts the most confident job title from JD text or file name.
 * Avoids taking boilerplate headings like "Company Overview" or "About Us".
 *
 * @param {string} text
 * @param {string} fileName
 * @returns {string} Clean job title
 */
const extractJobTitle = (text = '', fileName = '') => {
  if (!text && !fileName) return '';

  // 1. Explicit labelled match (highest confidence)
  // e.g. "Job Title: React Developer", "Role: Senior Backend Engineer", "Position: Data Analyst"
  const labelMatch = text.match(/(?:job\s*title|position(?:\s*title)?|role(?:\s*title)?|designation|title)\s*[:\-–]\s*([^\n\r]+)/i);
  if (labelMatch && labelMatch[1]) {
    const candidate = labelMatch[1].trim().replace(/^["']|["']$/g, '');
    if (candidate.length >= 3 && candidate.length <= 80 && !BOILERPLATE_TITLE_REGEX.test(candidate)) {
      return candidate;
    }
  }

  // 2. Explicit "Hiring for <Role>" or "Looking for <Role>"
  const hiringMatch = text.match(/(?:hiring\s+for|we\s+are\s+looking\s+for\s+(?:a|an)?)\s+([A-Za-z0-9+#.\s]{3,60}?)(?:\s+(?:with|who|to|in)\b|\.|\n|$)/i);
  if (hiringMatch && hiringMatch[1]) {
    const candidate = hiringMatch[1].trim().replace(/^["']|["']$/g, '');
    if (candidate.length >= 3 && candidate.length <= 80 && ROLE_INDICATOR_REGEX.test(candidate)) {
      return candidate;
    }
  }

  // 3. Markdown Heading 1 or Heading 2 (e.g. "# React Developer" or "## Senior DevOps Engineer")
  const headingMatch = text.match(/^#{1,3}\s*([^\n\r]+)/m);
  if (headingMatch && headingMatch[1]) {
    const candidate = headingMatch[1].trim().replace(/^["']|["']$/g, '');
    if (candidate.length >= 3 && candidate.length <= 80 && !BOILERPLATE_TITLE_REGEX.test(candidate)) {
      return candidate;
    }
  }

  // 4. First 5 meaningful lines of text
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].replace(/^["']|["']$/g, '').trim();
    if (line.length < 3 || line.length > 80) continue;
    if (BOILERPLATE_TITLE_REGEX.test(line)) continue;
    // If it mentions a known role indicator, e.g. "React Developer", "Data Analyst", "DevOps Engineer"
    if (ROLE_INDICATOR_REGEX.test(line)) {
      return line;
    }
  }

  // If first line doesn't have role indicator but is short and clean (e.g. "React Developer")
  if (lines.length > 0) {
    const firstLine = lines[0].replace(/^["']|["']$/g, '').trim();
    if (firstLine.length >= 3 && firstLine.length <= 50 && !BOILERPLATE_TITLE_REGEX.test(firstLine) && !firstLine.includes('.')) {
      return firstLine;
    }
  }

  // 5. Fallback to clean fileName if valid
  if (fileName && fileName !== 'pasted-job-description.txt') {
    const candidate = fileName
      .replace(/\.(pdf|docx|txt)$/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b(jd|job\s*description|job\s*desc|spec|specification)\b/gi, '')
      .trim();
    if (candidate.length >= 3) {
      return candidate;
    }
  }

  return '';
};

/**
 * Extracts key responsibilities and deliverables from the JD text
 * @param {string} text
 * @returns {string[]} Clean responsibility phrases
 */
const extractResponsibilities = (text) => {
  if (!text || typeof text !== 'string') return [];

  const respSectionMatch = text.match(
    /(?:responsibilities|what\s*(?:you'll|you\s*will)\s*do|role\s*(?:responsibilities|overview)|key\s*responsibilities|your\s*role|day\s*to\s*day|key\s*duties|deliverables)[\s\S]*?(?=(?:requirements|qualifications|about\s*us|what\s*we\s*offer|skills|$))/i
  );

  const responsibilities = [];
  const bulletRegex = /^[\s*•▪◦●·‣∙+\-–—\d.)]+\s*(.*)$/;

  if (respSectionMatch) {
    const lines = respSectionMatch[0].split(/\r?\n/).map((l) => l.trim());
    for (const line of lines) {
      const match = line.match(bulletRegex);
      const content = match ? match[1].trim() : line;
      if (content.length >= 15 && content.length <= 250) {
        if (ACTION_VERBS_REGEX.test(content)) {
          responsibilities.push(content);
          if (responsibilities.length >= 8) break;
        }
      }
    }
  }

  // If no bulleted responsibilities found from section, extract action clauses from sentences
  // e.g. "The developer will build reusable frontend components, integrate backend APIs and optimize web application performance."
  if (responsibilities.length === 0) {
    const actionSentenceMatch = text.match(/(?:(?:the\s+)?(?:developer|candidate|engineer|role|hire|person)\s+will\s+|responsibilities\s+include\s+|you\s+will\s+)([\s\S]+?)(?:\.\s*|\n\s*\n|$)/i);
    if (actionSentenceMatch && actionSentenceMatch[1]) {
      const unwrappedText = actionSentenceMatch[1].replace(/\r?\n+/g, ' ');
      const clauses = unwrappedText.split(/,\s*|\s+and\s+/).map((c) => c.trim()).filter(Boolean);
      for (const clause of clauses) {
        const cleanClause = clause.replace(/^to\s+/i, '').trim();
        if (cleanClause.length >= 10 && cleanClause.length <= 150) {
          if (ACTION_VERBS_REGEX.test(cleanClause)) {
            responsibilities.push(cleanClause);
          }
        }
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
 * Partitions JD into logical sections (Required, Preferred, Responsibilities, Other)
 * @param {string} text
 * @returns {{ required: string[], preferred: string[], responsibilities: string[], header: string[] }}
 */
const partitionJdSections = (text = '') => {
  const lines = text.split(/\r?\n/);
  let currentSection = 'header';
  const sections = { header: [], required: [], preferred: [], responsibilities: [], other: [] };

  const isPreferredHeading = (line) =>
    /^\s*#*\s*(?:preferred(?:\s+(?:qualifications|skills|requirements|experience))?|nice\s*to\s*have|good\s*to\s*have|bonus|plus|advantage|desired|desirable|additional\s*qualifications)\b[:\s-]*$/i.test(line) ||
    /^\s*(?:preferred(?:\s+(?:qualifications|skills|requirements|experience))?|nice\s*to\s*have|good\s*to\s*have)\s*[:\-–]/i.test(line);

  const isRequiredHeading = (line) =>
    /^\s*#*\s*(?:key\s*requirements|requirements|required(?:\s+(?:skills|qualifications|experience))?|must\s*have(?:\s*skills)?|mandatory(?:\s*skills)?|core\s*requirements|basic\s*qualifications|minimum\s*qualifications|technical\s*requirements|technical\s*skills|key\s*skills|skills(?:\s*required)?|qualifications|what\s*(?:you'll|you\s*will)\s*need|(?:qualifications|skills|requirements)\s*(?:&|and)\s*(?:qualifications|skills|requirements))\b[:\s-]*$/i.test(line) ||
    /^\s*(?:key\s*requirements|requirements|required\s*skills|must\s*have|technical\s*skills|key\s*skills|qualifications|skills|(?:qualifications|skills|requirements)\s*(?:&|and)\s*(?:qualifications|skills|requirements))\s*[:\-–]/i.test(line);

  const isRespHeading = (line) =>
    /^\s*#*\s*(?:responsibilities|what\s*(?:you'll|you\s*will)\s*do|role\s*(?:responsibilities|overview)|key\s*responsibilities|your\s*role|day\s*to\s*day|key\s*duties|deliverables)\b[:\s-]*$/i.test(line) ||
    /^\s*(?:responsibilities|role\s*responsibilities|key\s*responsibilities|your\s*role|key\s*duties)\s*[:\-–]/i.test(line);

  const isOtherHeading = (line) =>
    /^\s*#*\s*(?:about\s*us|what\s*we\s*offer|benefits|perks|company\s*overview|who\s*we\s*are)\b[:\s-]*$/i.test(line);

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

/**
 * Evaluates extraction completeness and determines status: 'complete', 'partial', or 'failed'
 */
const evaluateExtractionStatus = ({ text, title, requiredSkills, preferredSkills, minimumExperience, preferredEducation, responsibilities }) => {
  const extractedFields = [];
  const missingFields = [];

  const hasTitle = Boolean(title && title.trim());
  if (hasTitle) extractedFields.push('title');
  else missingFields.push('title');

  const hasRequiredSkills = Array.isArray(requiredSkills) && requiredSkills.length > 0;
  if (hasRequiredSkills) extractedFields.push('requiredSkills');
  else missingFields.push('requiredSkills');

  const hasExperience = minimumExperience !== undefined && minimumExperience !== null && minimumExperience > 0;
  if (hasExperience) extractedFields.push('experience');
  else missingFields.push('experience');

  const hasResponsibilities = Array.isArray(responsibilities) && responsibilities.length > 0;
  if (hasResponsibilities) extractedFields.push('responsibilities');
  else missingFields.push('responsibilities');

  const hasPreferredSkills = Array.isArray(preferredSkills) && preferredSkills.length > 0;
  if (hasPreferredSkills) extractedFields.push('preferredSkills');
  else missingFields.push('preferredSkills');

  const hasEducation = Array.isArray(preferredEducation) && preferredEducation.length > 0;
  if (hasEducation) extractedFields.push('education');
  else missingFields.push('education');

  // FAILED: Empty, almost empty, or completely unrecognizable
  if (!text || text.trim().length < 30 || (!hasTitle && !hasRequiredSkills)) {
    return {
      status: 'failed',
      extractedFields,
      missingFields
    };
  }

  // COMPLETE: Core fields confidently extracted (title and at least 1 required skill)
  // Missing education or preferred skills is normal / optional and MUST NOT downgrade to failed or partial!
  if (hasTitle && hasRequiredSkills) {
    return {
      status: 'complete',
      extractedFields,
      missingFields
    };
  }

  // PARTIAL: Usable content extracted, but either title or required skills need confirmation
  return {
    status: 'partial',
    extractedFields,
    missingFields
  };
};

/**
 * Derives a normalized JobProfile from JD text and job record
 *
 * @param {Object} job - Raw job record or object
 * @returns {Object} Normalized JobProfile
 */
const extractJobProfile = (job = {}) => {
  const rawText = (job.description || job.rawText || '').trim();
  const title = (job.title || extractJobTitle(rawText, job.fileName) || '').trim();
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

  // 4. Section parsing for required vs preferred
  const sections = partitionJdSections(fullText);
  let rawReqSkills = [];
  let rawPrefSkills = [];

  const isPrefLine = (line) => /(?:preferred|nice\s*to\s*have|good\s*to\s*have|plus|advantage|bonus|desired|desirable|optional)/i.test(line);
  const isReqLine = (line) => /(?:must|required|mandatory|essential|strong\s*proficiency|strong\s*knowledge(?:\s*of)?|proficiency\s*in|key\s*requirements|experience\s*with)/i.test(line);

  if (sections.required.length > 0 || sections.preferred.length > 0) {
    // Process required section lines
    for (const line of sections.required) {
      const skills = findSkillsInText(line);
      if (isPrefLine(line)) {
        rawPrefSkills.push(...skills);
      } else {
        rawReqSkills.push(...skills);
      }
    }

    // Process preferred section lines
    for (const line of sections.preferred) {
      const skills = findSkillsInText(line);
      if (/\b(?:must\s*have|mandatory|strictly\s*required)\b/i.test(line) && !isPrefLine(line)) {
        rawReqSkills.push(...skills);
      } else {
        rawPrefSkills.push(...skills);
      }
    }
  } else {
    // If no explicit section headings, parse paragraph by paragraph and sentence by sentence
    const paragraphs = fullText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const sentences = [];
    for (const p of paragraphs) {
      if (/^[\s*•▪◦●·‣∙+\-–\d.)]/m.test(p)) {
        p.split(/\r?\n/).forEach((l) => {
          const trimmed = l.trim();
          if (trimmed) sentences.push(trimmed);
        });
      } else {
        const unwrapped = p.replace(/\r?\n+/g, ' ');
        const sList = unwrapped.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
        sentences.push(...sList);
      }
    }

    for (const s of sentences) {
      const skills = findSkillsInText(s);
      if (isPrefLine(s)) {
        rawPrefSkills.push(...skills);
      } else if (isReqLine(s)) {
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

  const statusInfo = evaluateExtractionStatus({
    text: rawText || fullText,
    title,
    requiredSkills,
    preferredSkills,
    minimumExperience,
    preferredEducation,
    responsibilities
  });

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
    rawText,
    status: statusInfo.status,
    extractedFields: statusInfo.extractedFields,
    missingFields: statusInfo.missingFields
  };
};

module.exports = {
  extractJobProfile,
  extractJobTitle,
  partitionJdSections,
  detectSeniority,
  detectRoleFamily,
  extractNegatedSkills,
  extractResponsibilities,
  extractSpecificExperience,
  evaluateExtractionStatus
};
