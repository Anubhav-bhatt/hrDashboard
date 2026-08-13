/**
 * Structured resume section parser.
 *
 * Turns normalized resume text into the sections a recruiter expects on a
 * candidate profile: contact links, professional summary, work history,
 * education, projects, certifications, languages and achievements.
 *
 * Design rules:
 *  - Never invent a value. A field that cannot be located stays null / empty so
 *    the UI can honestly render "Not provided".
 *  - Section detection is heading driven, which handles the ordering differences
 *    between resumes far better than scanning the whole document for keywords.
 *  - Every extractor is pure and individually unit-testable.
 */

/** Canonical section keys and the headings that introduce them. */
const SECTION_PATTERNS = [
  { key: 'summary', patterns: [/^(professional\s+)?summary$/i, /^profile(\s+summary)?$/i, /^career\s+(objective|summary)$/i, /^objective$/i, /^about(\s+me)?$/i, /^executive\s+summary$/i] },
  { key: 'experience', patterns: [/^(work\s+|professional\s+|employment\s+|relevant\s+)?experience$/i, /^work\s+history$/i, /^employment(\s+history)?$/i, /^career\s+history$/i, /^professional\s+background$/i] },
  { key: 'education', patterns: [/^education(al)?(\s+(qualifications?|background|details))?$/i, /^academic(\s+(qualifications?|background|details|profile))?$/i, /^qualifications?$/i] },
  { key: 'skills', patterns: [/^(technical\s+|core\s+|key\s+|it\s+)?skills(\s+(summary|set|profile))?$/i, /^technical\s+(expertise|proficiency|competencies)$/i, /^competencies$/i, /^technologies$/i] },
  { key: 'projects', patterns: [/^(key\s+|academic\s+|personal\s+|major\s+|selected\s+)?projects?(\s+(undertaken|handled|summary))?$/i] },
  { key: 'certifications', patterns: [/^certifications?(\s+(and|&)\s+(courses|training|licenses))?$/i, /^licenses?\s*(and|&)?\s*certifications?$/i, /^courses?\s*(and|&)?\s*certifications?$/i, /^trainings?(\s+(and|&)\s+certifications?)?$/i] },
  { key: 'languages', patterns: [/^languages?(\s+(known|spoken|proficiency))?$/i, /^linguistic\s+skills$/i] },
  { key: 'achievements', patterns: [/^(key\s+)?achievements?(\s+(and|&)\s+awards?)?$/i, /^awards?(\s+(and|&)\s+(achievements?|recognitions?|honors?))?$/i, /^accomplishments?$/i, /^honors?(\s+(and|&)\s+awards?)?$/i, /^publications?$/i, /^extra[\s-]?curricular(\s+activities)?$/i, /^activities(\s+(and|&)\s+interests)?$/i, /^hackathons?$/i, /^leadership$/i, /^recognitions?$/i] },
  { key: 'contact', patterns: [/^contact(\s+(details|information|info))?$/i, /^personal\s+(details|information|profile)$/i] },
  { key: 'declaration', patterns: [/^declaration$/i, /^references?$/i, /^hobbies(\s+(and|&)\s+interests)?$/i, /^interests$/i] }
];

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

const MONTH_ALT = Object.keys(MONTHS).join('|');
const PRESENT_ALT = 'present|current|till\\s*date|to\\s*date|now|ongoing';

/** Splits text into trimmed, non-empty lines while remembering blank breaks. */
const toLines = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/g, '').trim());

/**
 * Strips bullet glyphs and list markers from the start of a line.
 */
const stripBullet = (line) =>
  String(line || '')
    .replace(/^[\s]*[•▪◦●·‣∙*+\-–—]{1,2}\s*/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .trim();

/**
 * A heading is a short line that matches a known section name. Resumes write
 * headings in many styles ("WORK EXPERIENCE", "Work Experience:", "— Skills —"),
 * so punctuation and decoration are removed before matching.
 */
const matchHeading = (line) => {
  const cleaned = String(line || '')
    .replace(/[|:•▪●·_=~<>\[\]]/g, ' ')
    .replace(/^[\s\-–—*#]+|[\s\-–—*#]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length > 45) return null;
  if (/\d{4}/.test(cleaned)) return null; // date lines are content, not headings

  for (const section of SECTION_PATTERNS) {
    if (!section || !section.patterns) continue;
    if (section.patterns.some((p) => p.test(cleaned))) return section.key;
  }
  return null;
};

/**
 * Slices resume text into { sectionKey: lines[] }. Text before the first
 * recognised heading is kept under `_header`, which is where name and contact
 * details normally live.
 */
const splitIntoSections = (text) => {
  const lines = toLines(text);
  const sections = { _header: [] };
  let current = '_header';

  for (const raw of lines) {
    const heading = raw ? matchHeading(raw) : null;
    if (heading) {
      current = heading;
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (!sections[current]) sections[current] = [];
    sections[current].push(raw);
  }

  return sections;
};

/** Removes leading/trailing blank lines from a line array. */
const trimBlocks = (lines = []) => {
  const out = [...lines];
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
};

/* ------------------------------------------------------------------ links --- */

const normalizeUrl = (value) => {
  if (!value) return null;
  let url = String(value).trim().replace(/[).,;'"\]]+$/, '');
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/\//, '')}`;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname.includes('.')) return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

/**
 * Extracts LinkedIn, GitHub and a general portfolio/personal site.
 */
const extractLinks = (text) => {
  const source = String(text || '');
  const result = { linkedinUrl: null, githubUrl: null, portfolioUrl: null, otherLinks: [] };

  const linkedin = source.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub|profile)\/[A-Za-z0-9_%\-.]+\/?/i);
  if (linkedin) result.linkedinUrl = normalizeUrl(linkedin[0]);

  const github = source.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)?\/?/i);
  if (github) result.githubUrl = normalizeUrl(github[0]);

  // Any other explicit URL becomes a candidate portfolio link.
  const HOSTS_TO_SKIP = /(linkedin|github|gmail|yahoo|outlook|hotmail|example)\./i;
  const urlPattern = /(?:https?:\/\/)[^\s<>()"']+|\b(?:www\.)[^\s<>()"']+/gi;
  const seen = new Set();

  for (const raw of source.match(urlPattern) || []) {
    const url = normalizeUrl(raw);
    if (!url || HOSTS_TO_SKIP.test(url) || seen.has(url)) continue;
    seen.add(url);
    if (!result.portfolioUrl) result.portfolioUrl = url;
    else result.otherLinks.push(url);
  }

  // Bare "domain.dev" style personal sites, when no URL was written out.
  // Email addresses are removed first: "amit.kumar.dev@example.com" contains
  // "kumar.dev", which is not a website.
  if (!result.portfolioUrl) {
    const withoutEmails = source.replace(EMAIL_PATTERN, ' ');
    const bare = withoutEmails.match(/(?:^|[\s(|,])([a-z0-9][a-z0-9-]*\.(?:dev|me|io|app|tech|site|xyz))\b(?!@)/i);
    if (bare && !HOSTS_TO_SKIP.test(bare[1])) result.portfolioUrl = normalizeUrl(bare[1]);
  }

  result.otherLinks = result.otherLinks.slice(0, 5);
  return result;
};

/* --------------------------------------------------------- emails / phones --- */

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** All distinct emails in document order, primary first. */
const extractEmails = (text) => {
  const found = String(text || '').match(EMAIL_PATTERN) || [];
  const unique = [];
  const seen = new Set();
  for (const raw of found) {
    const email = raw.trim().toLowerCase().replace(/[.,;]+$/, '');
    if (!seen.has(email)) {
      seen.add(email);
      unique.push(email);
    }
  }
  return unique;
};

/**
 * Extracts phone numbers, preferring 10-digit Indian mobiles and international
 * numbers. Digit runs that look like years, PIN codes or credential IDs are
 * ignored via length checks.
 */
const extractPhones = (text) => {
  const source = String(text || '');
  const patterns = [
    /\+91[\s-]?[6-9]\d{4}[\s-]?\d{5}/g,
    /\+91[\s-]?[6-9]\d{9}/g,
    /\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/g,
    /\b0?[6-9]\d{4}[\s-]\d{5}\b/g,
    /\b[6-9]\d{9}\b/g,
    /\(\d{3}\)\s?\d{3}-\d{4}/g
  ];

  const unique = [];
  const seenDigits = new Set();

  for (const pattern of patterns) {
    for (const raw of source.match(pattern) || []) {
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) continue;
      const key = digits.slice(-10);
      if (seenDigits.has(key)) continue;
      seenDigits.add(key);
      unique.push(raw.trim().replace(/\s+/g, ' '));
    }
  }

  return unique;
};

/* ---------------------------------------------------------------- summary --- */

/**
 * Returns the professional summary exactly as written. Nothing is generated when
 * the resume has no summary section.
 */
const extractSummary = (sections) => {
  const block = trimBlocks(sections.summary || []);
  if (!block.length) return null;

  const paragraph = block
    .map(stripBullet)
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (paragraph.length < 30) return null;
  return paragraph.length > 1500 ? `${paragraph.slice(0, 1497).trimEnd()}...` : paragraph;
};

/* ------------------------------------------------------------ date ranges --- */

const parseMonthYear = (monthToken, yearToken) => {
  const year = parseInt(yearToken, 10);
  if (!Number.isFinite(year) || year < 1950 || year > 2100) return null;
  const month = monthToken ? MONTHS[String(monthToken).toLowerCase().replace('.', '')] : null;
  return { year, month: month || null };
};

const formatPeriodPart = (part) => {
  if (!part) return null;
  if (part.present) return 'Present';
  if (!part.year) return null;
  if (!part.month) return String(part.year);
  const label = Object.keys(MONTHS).find((k) => MONTHS[k] === part.month && k.length === 3);
  return `${label ? label[0].toUpperCase() + label.slice(1) : ''} ${part.year}`.trim();
};

/**
 * Detects a "Jan 2024 - Present" / "2021 – 2024" / "03/2019 - 07/2021" range.
 */
const parseDateRange = (line) => {
  const text = String(line || '');
  const sep = '\\s*(?:-|–|—|to|until|through)\\s*';

  const monthYear = new RegExp(
    `\\b(${MONTH_ALT})\\.?\\s*,?\\s*(\\d{4})${sep}(?:(${MONTH_ALT})\\.?\\s*,?\\s*(\\d{4})|(${PRESENT_ALT}))`,
    'i'
  );
  const numericMonth = new RegExp(`\\b(\\d{1,2})[\\/.](\\d{4})${sep}(?:(\\d{1,2})[\\/.](\\d{4})|(${PRESENT_ALT}))`, 'i');
  const yearOnly = new RegExp(`\\b(\\d{4})${sep}(?:(\\d{4})|(${PRESENT_ALT}))`, 'i');
  const singleMonthPresent = new RegExp(`\\b(?:since\\s+)?(${MONTH_ALT})\\.?\\s*,?\\s*(\\d{4})\\s*(?:-|–|—)?\\s*(${PRESENT_ALT})\\b`, 'i');

  let m = text.match(monthYear);
  if (m) {
    const start = parseMonthYear(m[1], m[2]);
    const end = m[5] ? { present: true } : parseMonthYear(m[3], m[4]);
    if (start) return { start, end, raw: m[0].trim() };
  }

  m = text.match(numericMonth);
  if (m) {
    const start = parseMonthYear(null, m[2]);
    if (start) {
      const mo = parseInt(m[1], 10);
      if (mo >= 1 && mo <= 12) start.month = mo;
      let end = null;
      if (m[5]) end = { present: true };
      else if (m[4]) {
        end = parseMonthYear(null, m[4]);
        const em = parseInt(m[3], 10);
        if (end && em >= 1 && em <= 12) end.month = em;
      }
      return { start, end, raw: m[0].trim() };
    }
  }

  m = text.match(singleMonthPresent);
  if (m) {
    const start = parseMonthYear(m[1], m[2]);
    if (start) return { start, end: { present: true }, raw: m[0].trim() };
  }

  m = text.match(yearOnly);
  if (m) {
    const start = parseMonthYear(null, m[1]);
    const end = m[3] ? { present: true } : parseMonthYear(null, m[2]);
    if (start) return { start, end, raw: m[0].trim() };
  }

  return null;
};

/** Months between two range endpoints; null when it cannot be determined. */
const rangeMonths = (range, now = new Date()) => {
  if (!range || !range.start || !range.start.year) return null;
  const startMonth = range.start.month || 1;
  const start = range.start.year * 12 + startMonth;

  let endYear;
  let endMonth;
  if (range.end && range.end.present) {
    endYear = now.getFullYear();
    endMonth = now.getMonth() + 1;
  } else if (range.end && range.end.year) {
    endYear = range.end.year;
    endMonth = range.end.month || 12;
  } else {
    return null;
  }

  const end = endYear * 12 + endMonth;
  // Elapsed months between the two endpoints. "Jan 2024 – Aug 2026" is 31
  // months, so the endpoints are subtracted rather than counted inclusively.
  const months = end - start;
  return months > 0 && months < 12 * 60 ? months : null;
};

/* ------------------------------------------------------------- experience --- */

const KNOWN_CITIES = [
  'Gurugram', 'Gurgaon', 'Noida', 'New Delhi', 'Delhi', 'Bengaluru', 'Bangalore', 'Hyderabad',
  'Pune', 'Mumbai', 'Navi Mumbai', 'Thane', 'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur',
  'Chandigarh', 'Indore', 'Coimbatore', 'Kochi', 'Trivandrum', 'Bhopal', 'Lucknow', 'Nagpur',
  'Vadodara', 'Surat', 'Mohali', 'Faridabad', 'Ghaziabad', 'Mysuru', 'Mysore', 'Remote'
];

const CITY_CANONICAL = { gurgaon: 'Gurugram', bangalore: 'Bengaluru', mysore: 'Mysuru' };

const canonicalCity = (city) => {
  if (!city) return null;
  const key = city.trim().toLowerCase();
  return CITY_CANONICAL[key] || city.trim();
};

// Words that identify an employer with high confidence. Deliberately excludes
// generic terms like "software" or "services", which appear just as often inside
// a job title ("Software Engineer") as inside a company name.
const COMPANY_HINT = /\b(technolog(y|ies)|solutions?|labs?|consult(ing|ancy)|infotech|pvt\.?|private|limited|ltd\.?|llp|inc\.?|corp(oration)?|company|group|enterprises?|industries|networks?|studios?|university|college|institute|bank|motors?)\b/i;

const ROLE_HINT = /\b(engineer|developer|programmer|architect|analyst|consultant|manager|lead|specialist|designer|administrator|scientist|intern|trainee|associate|executive|officer|head|director|president|founder|technician|tester|qa|sre|devops|support|recruiter|coordinator)\b/i;

// Seniority prefixes are a strong signal that a fragment is a job title.
const SENIORITY_HINT = /\b(senior|sr\.?|junior|jr\.?|lead|principal|staff|chief|head|associate|assistant|intern|trainee|graduate|entry[\s-]level)\b/i;

/**
 * Splits an experience section into entries. A new entry starts on a line that
 * carries a date range, or on a title-like line that follows a bullet block.
 */
const extractExperience = (sections) => {
  const lines = trimBlocks(sections.experience || []);
  if (!lines.length) return [];

  const entries = [];
  let current = null;
  // Tracks whether the entry under construction has already collected bullet
  // points. Once it has, the next plain-text line belongs to the *next* role,
  // not to this one's header. This must survive blank lines, because resumes
  // normally put a blank line between roles.
  let entryHasBullets = false;

  const isBullet = (line) => /^[\s]*[•▪◦●·‣∙*+\-–—]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line);

  const pushCurrent = () => {
    if (!current) return;
    const headerText = current.headerLines.join(' | ');
    const parsed = interpretExperienceHeader(current.headerLines, current.range);

    const entry = {
      title: parsed.title,
      company: parsed.company,
      location: parsed.location,
      employmentType: parsed.employmentType,
      startDate: current.range ? formatPeriodPart(current.range.start) : null,
      endDate: current.range ? formatPeriodPart(current.range.end) : null,
      isCurrent: Boolean(current.range && current.range.end && current.range.end.present),
      period: current.range ? current.range.raw : null,
      durationMonths: rangeMonths(current.range),
      highlights: current.bullets.slice(0, 12),
      rawHeader: headerText || null
    };

    if (entry.title || entry.company || entry.highlights.length) entries.push(entry);
    current = null;
    entryHasBullets = false;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const range = parseDateRange(line);
    const bullet = isBullet(line);

    if (bullet) {
      if (!current) current = { headerLines: [], bullets: [], range: null };
      const content = stripBullet(line);
      if (content) current.bullets.push(content);
      entryHasBullets = true;
      continue;
    }

    const residueOf = (value) =>
      value.replace(range.raw, '').replace(/^[\s|,\-–—]+|[\s|,\-–—]+$/g, '').trim();

    // A date range belongs to the entry being built when that entry has no dates
    // and no bullets yet; otherwise it opens the next entry.
    if (range) {
      if (current && !current.range && !entryHasBullets) {
        current.range = range;
        const residue = residueOf(line);
        if (residue) current.headerLines.push(residue);
      } else {
        pushCurrent();
        current = { headerLines: [], bullets: [], range };
        const residue = residueOf(line);
        if (residue) current.headerLines.push(residue);
      }
      continue;
    }

    // Plain text line: either a header for a new entry or continuation.
    if (!current) {
      current = { headerLines: [line], bullets: [], range: null };
    } else if (entryHasBullets) {
      // Text after this entry's bullets means the next role's header began.
      pushCurrent();
      current = { headerLines: [line], bullets: [], range: null };
    } else if (current.headerLines.length < 4) {
      current.headerLines.push(line);
    } else {
      current.bullets.push(line);
    }
  }

  pushCurrent();
  return entries.slice(0, 15);
};

/**
 * Works out which header fragment is the job title, which is the employer and
 * which is the location. Falls back to leaving fields null rather than guessing
 * when the signals conflict.
 */
const interpretExperienceHeader = (headerLines = [], range = null) => {
  const parts = [];
  for (const line of headerLines) {
    for (const chunk of String(line).split(/\s*[|•]\s*|\s{3,}|,\s(?=[A-Z])/)) {
      const value = chunk.replace(/^[\s\-–—,]+|[\s\-–—,]+$/g, '').trim();
      if (value) parts.push(value);
    }
  }

  const result = { title: null, company: null, location: null, employmentType: null };
  const remaining = [];

  const TYPE_PATTERN = /\b(full[\s-]?time|part[\s-]?time|contract|internship|freelance|permanent|consultant)\b/i;

  for (const part of parts) {
    const typeMatch = part.match(TYPE_PATTERN);
    if (typeMatch && part.length <= 20) {
      result.employmentType = typeMatch[0];
      continue;
    }

    const city = KNOWN_CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(part));
    if (city && part.length <= 40) {
      // First city wins: later fragments often name a different office or the
      // next role's city, and overwriting would attribute it to this entry.
      if (!result.location) {
        const country = /\b(india|usa|uk|united states|united kingdom|germany|canada|australia|singapore|uae)\b/i.exec(part);
        result.location = country
          ? `${canonicalCity(city)}, ${country[0].replace(/\b\w/g, (c) => c.toUpperCase())}`
          : canonicalCity(city);
      }
      continue;
    }

    remaining.push(part);
  }

  // Score each fragment instead of taking the first hint match: "Lead Software
  // Engineer" contains a company-ish word ("software") yet is clearly a title,
  // so relative strength has to decide.
  const scored = remaining.map((part, index) => {
    let role = 0;
    let company = 0;
    if (ROLE_HINT.test(part)) role += 2;
    if (SENIORITY_HINT.test(part)) role += 1;
    if (COMPANY_HINT.test(part)) company += 3;
    if (/\b(at|with)\s+$/i.test(part)) company += 1;
    if (/\b(pvt|ltd|llp|inc)\b/i.test(part)) company += 2;
    return { part, index, role, company };
  });

  const titlePick = scored
    .filter((s) => s.role > s.company)
    .sort((a, b) => b.role - a.role || a.index - b.index)[0];
  if (titlePick) result.title = titlePick.part;

  const companyPick = scored
    .filter((s) => s !== titlePick && s.company > 0)
    .sort((a, b) => b.company - a.company || a.index - b.index)[0];
  if (companyPick) result.company = companyPick.part;

  // Nothing matched a hint: fall back to reading order (title then company),
  // which is how the overwhelming majority of resumes are written.
  const leftovers = remaining.filter((p) => p !== result.title && p !== result.company);
  if (!result.title && leftovers.length) result.title = leftovers.shift();
  if (!result.company && leftovers.length) result.company = leftovers.shift();

  const clean = (v) => (v ? v.replace(/[:;,]+$/, '').trim() || null : null);
  result.title = clean(result.title);
  result.company = clean(result.company);
  return result;
};

/**
 * Total professional experience in years, derived from dated employment entries.
 * Overlapping ranges are merged so concurrent roles are not double counted.
 * Returns null when no entry carries a usable date range.
 */
const computeExperienceYears = (entries = [], now = new Date()) => {
  const intervals = [];

  for (const entry of entries) {
    if (!entry.period) continue;
    const range = parseDateRange(entry.period);
    if (!range || !range.start || !range.start.year) continue;

    const startIdx = range.start.year * 12 + (range.start.month || 1);
    let endIdx;
    if (range.end && range.end.present) endIdx = now.getFullYear() * 12 + (now.getMonth() + 1);
    else if (range.end && range.end.year) endIdx = range.end.year * 12 + (range.end.month || 12);
    else continue;

    if (endIdx >= startIdx) intervals.push([startIdx, endIdx]);
  }

  if (!intervals.length) return null;

  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [intervals[0]];
  for (const [start, end] of intervals.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  const months = merged.reduce((sum, [start, end]) => sum + (end - start), 0);
  if (months <= 0 || months > 12 * 55) return null;
  return Math.round((months / 12) * 10) / 10;
};

/* -------------------------------------------------------------- education --- */

const DEGREE_PATTERN = /\b(b\.?\s?tech|bachelor of technology|b\.?\s?e\.?|bachelor of engineering|m\.?\s?tech|master of technology|m\.?\s?e\.?|b\.?\s?sc|bachelor of science|m\.?\s?sc|master of science|bca|bachelor of computer applications?|mca|master of computer applications?|mba|master of business administration|b\.?\s?com|m\.?\s?com|bba|b\.?\s?a\.?|m\.?\s?a\.?|ph\.?\s?d|doctorate|diploma|polytechnic|higher secondary|senior secondary|intermediate|12th|10th|hsc|ssc|class xii|class x)\b/i;

const INSTITUTION_HINT = /\b(university|univ\.?|college|institute|institution|school|academy|polytechnic|iit|nit|iiit|bits|vit|srm|manipal|amity)\b/i;

const GRADE_PATTERN = /\b(?:cgpa|gpa|sgpa)\s*[:=-]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*(?:\/\s*(\d{1,2}(?:\.\d{1,2})?))?|\b(\d{1,3}(?:\.\d{1,2})?)\s*%|\bpercentage\s*[:=-]?\s*(\d{1,3}(?:\.\d{1,2})?)/i;

/** Restores conventional punctuation on abbreviated degree names. */
const canonicalDegree = (degree) => {
  if (!degree) return null;
  const compact = degree.replace(/[\s.]/g, '').toLowerCase();
  const MAP = {
    btech: 'B.Tech', mtech: 'M.Tech', be: 'B.E.', me: 'M.E.', bsc: 'B.Sc',
    msc: 'M.Sc', bca: 'BCA', mca: 'MCA', mba: 'MBA', bba: 'BBA',
    bcom: 'B.Com', mcom: 'M.Com', ba: 'B.A.', ma: 'M.A.', phd: 'Ph.D'
  };
  if (MAP[compact]) return MAP[compact];
  return degree.replace(/\s+/g, ' ').trim();
};

const extractGrade = (text) => {
  const match = String(text || '').match(GRADE_PATTERN);
  if (!match) return null;
  if (match[1]) return `CGPA ${match[1]}${match[2] ? `/${match[2]}` : ''}`;
  const percent = match[3] || match[4];
  if (percent) {
    const value = parseFloat(percent);
    if (value > 0 && value <= 100) return `${percent}%`;
  }
  return null;
};

/**
 * Parses education entries. Entries are separated by degree mentions, since
 * every education block leads with (or contains) a degree name.
 */
const extractEducation = (sections) => {
  const lines = trimBlocks(sections.education || []);
  if (!lines.length) return [];

  const blocks = [];
  let currentBlock = [];

  for (const raw of lines) {
    const line = stripBullet(raw);
    if (!line) {
      if (currentBlock.length) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
      continue;
    }
    const startsNew = DEGREE_PATTERN.test(line) && currentBlock.some((l) => DEGREE_PATTERN.test(l));
    if (startsNew) {
      blocks.push(currentBlock);
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length) blocks.push(currentBlock);

  const entries = [];

  for (const block of blocks) {
    const joined = block.join(' | ');
    if (!joined.trim()) continue;

    const degreeMatch = joined.match(DEGREE_PATTERN);
    const range = parseDateRange(joined);
    const years = joined.match(/\b(19|20)\d{2}\b/g) || [];

    const institutionLine =
      block.find((l) => INSTITUTION_HINT.test(l)) ||
      (block.length > 1 ? block.find((l, i) => i > 0 && !DEGREE_PATTERN.test(l) && !/^\d/.test(l)) : null);

    // Specialisation: "B.Tech in Information Technology" / "B.Tech (CSE)"
    let specialisation = null;
    const specMatch = joined.match(/(?:in|of|,|\()\s*((?:computer|information|electrical|electronics|mechanical|civil|chemical|software|data|business|commerce|science|arts|instrumentation|communication|automobile|production|biotech)[A-Za-z&\s.]{0,45})/i);
    if (specMatch) specialisation = specMatch[1].replace(/[)\s.]+$/, '').trim();

    const city = KNOWN_CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(joined));

    const entry = {
      degree: degreeMatch ? canonicalDegree(degreeMatch[0]) : null,
      specialisation: specialisation || null,
      institution: institutionLine ? institutionLine.replace(/[|,;]+$/, '').trim() : null,
      startYear: range && range.start ? range.start.year : years.length > 1 ? parseInt(years[0], 10) : null,
      endYear:
        range && range.end && range.end.year
          ? range.end.year
          : years.length
            ? parseInt(years[years.length - 1], 10)
            : null,
      grade: extractGrade(joined),
      location: city ? canonicalCity(city) : null,
      raw: joined.length > 220 ? `${joined.slice(0, 217)}...` : joined
    };

    if (entry.degree || entry.institution) entries.push(entry);
  }

  return entries.slice(0, 10);
};

/* --------------------------------------------------------------- projects --- */

const extractProjects = (sections) => {
  const lines = trimBlocks(sections.projects || []);
  if (!lines.length) return [];

  const TECH_LABEL = /^(tech(nolog(y|ies))?|stack|tools?|built with|skills used)\s*(used)?\s*[:\-–]\s*/i;
  const ROLE_LABEL = /^role\s*[:\-–]\s*/i;

  const entries = [];
  let current = null;

  const push = () => {
    if (!current) return;
    const description = current.description.join(' ').replace(/\s{2,}/g, ' ').trim();
    if (current.name || description) {
      entries.push({
        name: current.name || null,
        role: current.role || null,
        description: description || null,
        technologies: current.technologies.slice(0, 15),
        url: current.url || null,
        repositoryUrl: current.repositoryUrl || null
      });
    }
    current = null;
  };

  const splitTech = (value) =>
    String(value)
      .split(/[,|/•]|\s{2,}|\sand\s/)
      .map((t) => t.trim().replace(/[.;]+$/, ''))
      .filter((t) => t && t.length <= 30);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const bullet = /^[\s]*[•▪◦●·‣∙*+\-–—]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line);
    const content = stripBullet(line);
    if (!content) continue;

    const links = extractLinks(content);

    // "Project Name - React, Node. Description..." on one line
    const titleSplit = content.match(/^([A-Z][^-–—:|]{2,60})\s*[-–—:|]\s*(.+)$/);

    if (!bullet || !current) {
      push();
      current = { name: null, role: null, description: [], technologies: [], url: null, repositoryUrl: null };

      if (titleSplit) {
        current.name = titleSplit[1].trim();
        const rest = titleSplit[2].trim();
        const techPart = rest.match(/^([A-Za-z0-9.#+\s,/]+?)(?:\.\s|$)/);
        if (techPart && techPart[1].split(',').length >= 2) {
          current.technologies.push(...splitTech(techPart[1]));
          const remainder = rest.slice(techPart[0].length).trim();
          if (remainder) current.description.push(remainder);
        } else {
          current.description.push(rest);
        }
      } else {
        current.name = content.length <= 80 ? content.replace(/[.:;]+$/, '') : null;
        if (!current.name) current.description.push(content);
      }
    } else if (TECH_LABEL.test(content)) {
      current.technologies.push(...splitTech(content.replace(TECH_LABEL, '')));
    } else if (ROLE_LABEL.test(content)) {
      current.role = content.replace(ROLE_LABEL, '').trim();
    } else {
      current.description.push(content);
    }

    if (links.githubUrl && !current.repositoryUrl) current.repositoryUrl = links.githubUrl;
    if (links.portfolioUrl && !current.url) current.url = links.portfolioUrl;
  }

  push();
  return entries.slice(0, 12);
};

/* --------------------------------------------------------- certifications --- */

const extractCertifications = (sections) => {
  const lines = trimBlocks(sections.certifications || []);
  if (!lines.length) return [];

  const ISSUERS = /\b(amazon web services|aws|microsoft|google cloud|google|oracle|cisco|comptia|red hat|linux foundation|cncf|coursera|udemy|edx|udacity|scrum alliance|pmi|salesforce|hackerrank|nptel|simplilearn|great learning|meta|ibm|databricks|snowflake|mongodb|docker|hashicorp)\b/i;

  const entries = [];

  for (const raw of lines) {
    const content = stripBullet(raw);
    if (!content || content.length < 4) continue;

    const parts = content.split(/\s*[|–—]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    const joined = parts.join(' | ');

    const credentialId = (joined.match(/\b(?:credential\s*id|cert(?:ificate)?\s*(?:id|no\.?|number)|id)\s*[:#-]?\s*([A-Za-z0-9-]{4,40})\b/i) || [])[1] || null;
    const links = extractLinks(joined);
    const dateMatch = joined.match(new RegExp(`\\b(?:(${MONTH_ALT})\\.?\\s+)?((?:19|20)\\d{2})\\b`, 'i'));

    // The issuer is searched from the second fragment onwards: the certification
    // name itself often contains an issuer word ("AWS Certified Developer"),
    // and treating that as the issuer would leave the field empty.
    let issuer = null;
    for (const part of parts.slice(1)) {
      if (ISSUERS.test(part) && part.length <= 60) {
        issuer = part.replace(/\b(issued|by)\b/gi, '').trim();
        break;
      }
    }
    if (!issuer && parts.length > 1) {
      const candidate = parts[1];
      const looksLikeMetadata = /^\d/.test(candidate) || /credential|\b(19|20)\d{2}\b/i.test(candidate);
      if (candidate.length <= 60 && !looksLikeMetadata) issuer = candidate;
    }

    const name = parts[0]
      .replace(/\b(?:credential\s*id|cert(?:ificate)?\s*(?:id|no\.?|number))\s*[:#-]?\s*[A-Za-z0-9-]+/i, '')
      .replace(/[,;]+$/, '')
      .trim();

    if (!name) continue;

    entries.push({
      name: name.length > 140 ? `${name.slice(0, 137)}...` : name,
      issuer: issuer && issuer !== name ? issuer : null,
      issueDate: dateMatch ? [dateMatch[1] ? dateMatch[1][0].toUpperCase() + dateMatch[1].slice(1).toLowerCase() : null, dateMatch[2]].filter(Boolean).join(' ') : null,
      credentialId,
      credentialUrl: links.portfolioUrl || links.otherLinks[0] || null
    });
  }

  return entries.slice(0, 15);
};

/* -------------------------------------------------------------- languages --- */

const KNOWN_LANGUAGES = [
  'English', 'Hindi', 'Punjabi', 'Bengali', 'Marathi', 'Gujarati', 'Tamil', 'Telugu',
  'Kannada', 'Malayalam', 'Urdu', 'Odia', 'Assamese', 'Sanskrit', 'Nepali', 'Konkani',
  'French', 'German', 'Spanish', 'Japanese', 'Mandarin', 'Chinese', 'Korean', 'Russian',
  'Portuguese', 'Italian', 'Dutch', 'Arabic'
];

const PROFICIENCIES = ['Native', 'Bilingual', 'Fluent', 'Professional', 'Proficient', 'Advanced', 'Intermediate', 'Conversational', 'Basic', 'Beginner', 'Elementary', 'Read', 'Write', 'Speak'];

const extractLanguages = (sections) => {
  const lines = trimBlocks(sections.languages || []);
  if (!lines.length) return [];

  const found = new Map();

  for (const raw of lines) {
    const content = stripBullet(raw);
    if (!content) continue;

    for (const chunk of content.split(/[,;|]|\s{3,}/)) {
      const text = chunk.trim();
      if (!text) continue;

      const language = KNOWN_LANGUAGES.find((l) => new RegExp(`\\b${l}\\b`, 'i').test(text));
      if (!language || found.has(language)) continue;

      const levels = PROFICIENCIES.filter((p) => new RegExp(`\\b${p}\\b`, 'i').test(text));
      found.set(language, { name: language, proficiency: levels.length ? levels.join(', ') : null });
    }
  }

  return Array.from(found.values()).slice(0, 12);
};

/* ----------------------------------------------------------- achievements --- */

const extractAchievements = (sections) => {
  const lines = trimBlocks(sections.achievements || []);
  if (!lines.length) return [];

  const items = [];
  for (const raw of lines) {
    const content = stripBullet(raw);
    if (!content || content.length < 8) continue;
    items.push(content.length > 300 ? `${content.slice(0, 297)}...` : content);
  }

  return items.slice(0, 15);
};

/* ------------------------------------------------------------- headline ----- */

/**
 * Longest plausible job title. Anything longer is a sentence or a merged line,
 * and showing it as the candidate's role would look broken on the profile.
 */
const MAX_TITLE_LENGTH = 48;

const asTitle = (value) => {
  if (!value) return null;
  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  return cleaned && cleaned.length <= MAX_TITLE_LENGTH ? cleaned : null;
};

/**
 * Current job title. Prefers the most recent dated employment entry, then a
 * title-looking line near the top of the resume.
 */
const extractHeadline = (sections, experience = []) => {
  const currentRole = experience.find((e) => e.isCurrent && asTitle(e.title));
  if (currentRole) return asTitle(currentRole.title);

  const firstTitled = experience.find((e) => asTitle(e.title));
  if (firstTitled) return asTitle(firstTitled.title);

  const header = trimBlocks(sections._header || []);
  for (const raw of header.slice(0, 6)) {
    const line = stripBullet(raw);
    if (!line) continue;
    if (/@|\d{5,}|https?:/i.test(line)) continue;
    if (ROLE_HINT.test(line)) {
      const title = asTitle(line.replace(/[|,;]+$/, ''));
      if (title) return title;
    }
  }
  return null;
};

/**
 * Current location. Prefers an explicit label ("Current Location: Pune"), then
 * the header block, then the most recent employment entry. Scanning the whole
 * document is the last resort because past employers and education institutions
 * add cities that are not where the candidate lives.
 */
const extractCurrentLocation = (text, sections, experience = []) => {
  const cityFrom = (value) => {
    if (!value) return null;
    const city = KNOWN_CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(value));
    return city ? canonicalCity(city) : null;
  };

  const labelled = String(text || '').match(
    /\b(?:current\s+)?(?:location|based\s+in|city|residing\s+at|address|domicile)\s*[:=-]\s*([^\n|]{2,60})/i
  );
  const fromLabel = cityFrom(labelled && labelled[1]);
  if (fromLabel) return fromLabel;

  const header = trimBlocks(sections._header || []).concat(trimBlocks(sections.contact || []));
  for (const line of header.slice(0, 12)) {
    const city = cityFrom(line);
    if (city) return city;
  }

  const currentRole = experience.find((e) => e.isCurrent && e.location) || experience.find((e) => e.location);
  if (currentRole) return cityFrom(currentRole.location) || currentRole.location;

  return cityFrom(text);
};

/**
 * Parses a resume into structured sections.
 *
 * @param {string} resumeText Normalized resume text.
 * @returns {Object} Structured profile. Absent data is null or an empty array.
 */
const parseResumeProfile = (resumeText) => {
  const text = String(resumeText || '');
  const sections = splitIntoSections(text);

  const links = extractLinks(text);
  const emails = extractEmails(text);
  const phones = extractPhones(text);
  const experience = extractExperience(sections);
  const education = extractEducation(sections);

  const detectedSections = Object.keys(sections).filter((k) => k !== '_header' && (sections[k] || []).some((l) => l.trim()));

  return {
    emails,
    phones,
    links,
    summary: extractSummary(sections),
    headline: extractHeadline(sections, experience),
    currentLocation: extractCurrentLocation(text, sections, experience),
    experience,
    education,
    projects: extractProjects(sections),
    certifications: extractCertifications(sections),
    languages: extractLanguages(sections),
    achievements: extractAchievements(sections),
    computedExperienceYears: computeExperienceYears(experience),
    detectedSections,
    parserVersion: 2
  };
};

module.exports = {
  parseResumeProfile,
  splitIntoSections,
  matchHeading,
  extractLinks,
  extractEmails,
  extractPhones,
  extractSummary,
  extractExperience,
  extractEducation,
  extractProjects,
  extractCertifications,
  extractLanguages,
  extractAchievements,
  extractHeadline,
  extractCurrentLocation,
  parseDateRange,
  computeExperienceYears,
  normalizeUrl,
  canonicalCity,
  canonicalDegree,
  interpretExperienceHeader
};
