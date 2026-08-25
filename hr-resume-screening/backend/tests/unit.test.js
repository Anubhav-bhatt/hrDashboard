/**
 * Unit tests for the pure logic that shapes what recruiters see: resume section
 * parsing, candidate normalisation, query building and API serialisation.
 *
 *   npm run test:unit
 */
const { createSuite, assert } = require('./harness');

const {
  parseResumeProfile,
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
  splitIntoSections,
  parseDateRange,
  computeExperienceYears,
  normalizeUrl,
  canonicalDegree,
  interpretExperienceHeader
} = require('../services/resumeProfileParser');

const { extractCandidateProfile } = require('../services/candidateExtractor');
const { extractJDRequirements, extractMinimumExperience } = require('../services/jdRequirementExtractor');
const { buildCandidateWhere, parsePagination, parseSort, buildPaginationMeta } = require('../utils/candidateQuery');
const { formatCandidateForApi, formatCandidateDetail, computeCompatibilityFlags } = require('../utils/candidateSerializer');

const suite = createSuite('Unit tests — parsing, querying & serialisation');
const { test } = suite;

/* ------------------------------------------------------------ fixtures ---- */

const EXPERIENCED_RESUME = `Rahul Sharma
Senior React Developer

Email: rahul.sharma@example.com | Phone: +91 9876543210
Location: Gurgaon, India
LinkedIn: linkedin.com/in/rahulsharma | GitHub: github.com/rahulsharma
Portfolio: https://rahulsharma.dev

PROFESSIONAL SUMMARY
Experienced React developer with 4.2 years of experience building scalable single page
applications and design systems.

TECHNICAL SKILLS
Frontend: React, TypeScript, JavaScript, Redux, Tailwind CSS
Backend: Node.js, Express.js, REST API
Databases: PostgreSQL, MongoDB

WORK EXPERIENCE

Senior React Developer
ABC Technologies, Gurgaon, India
Jan 2024 - Present
- Built scalable React dashboards used by 40k monthly active users.
- Improved frontend performance, reducing bundle size by 38%.

React Developer
XYZ Technologies, Noida, India
Jul 2022 - Dec 2023
- Developed reusable component library adopted by four product teams.

EDUCATION
B.Tech in Information Technology
XYZ University, Jaipur
2018 - 2022
CGPA: 8.4/10

PROJECTS
Analytics Dashboard - React, TypeScript, Recharts. Real time reporting workspace.

CERTIFICATIONS
AWS Certified Developer Associate - Amazon Web Services - Mar 2024 - Credential ID ABC-1234

LANGUAGES
English - Professional
Hindi - Native

ACHIEVEMENTS
Winner, ABC Technologies internal hackathon 2024.`;

const FRESHER_RESUME = `Priya Jain

priya.jain.tech@example.com
Mobile: 9812345678
Bengaluru, Karnataka, India
linkedin.com/in/priyajain

CAREER OBJECTIVE
Recent computer applications graduate seeking a frontend engineering role.

SKILLS
React, JavaScript, HTML, CSS, Git

EDUCATION
MCA, Master of Computer Applications
Bengaluru Institute of Technology
2022 - 2024
Percentage: 78%`;

const MULTI_CONTACT_RESUME = `CURRICULUM VITAE

Amit Kumar
Full Stack Engineer

Primary Email: amit.kumar.dev@example.com
Secondary Email: amit.k.work@example.com
Phone: +91 9988776655
Alternate Phone: 9123456780
Current Location: Pune, Maharashtra

Total Experience: 7 years
Current CTC: 18 LPA
Expected CTC: 26 LPA

SUMMARY
Full stack engineer with 7 years of experience across Java, Spring Boot and React.

SKILLS
Java, Spring Boot, React, Kafka, PostgreSQL, Docker, Kubernetes

EXPERIENCE

Lead Software Engineer
Global Systems Ltd, Pune
Mar 2021 - Present
- Owned migration of a monolith to 14 microservices on Kubernetes.

Software Engineer
Initech Solutions, Hyderabad
Aug 2018 - Feb 2021
- Built payment reconciliation services in Java.

EDUCATION
B.E. Computer Science
Pune University
2014 - 2018`;

const UNSTRUCTURED_RESUME = `Sneha Patel
Software developer with strong interest in distributed systems and platform engineering.
Worked with React and Node.js on internal tooling projects for three separate teams.`;

/* ------------------------------------------------- section detection ------ */

suite.group('Section heading detection');

test('recognises common headings regardless of decoration and case', () => {
  assert.strictEqual(matchHeading('WORK EXPERIENCE'), 'experience');
  assert.strictEqual(matchHeading('Professional Summary'), 'summary');
  assert.strictEqual(matchHeading('--- Skills ---'), 'skills');
  assert.strictEqual(matchHeading('EDUCATION:'), 'education');
  assert.strictEqual(matchHeading('Certifications & Courses'), 'certifications');
  assert.strictEqual(matchHeading('Languages Known'), 'languages');
  assert.strictEqual(matchHeading('Awards and Achievements'), 'achievements');
});

test('does not treat content lines as headings', () => {
  assert.strictEqual(matchHeading('Jan 2024 - Present'), null);
  assert.strictEqual(matchHeading('Built scalable React dashboards for 40k users'), null);
  assert.strictEqual(matchHeading('rahul.sharma@example.com'), null);
});

test('splits a resume into its sections plus a header block', () => {
  const sections = splitIntoSections(EXPERIENCED_RESUME);
  assert.ok(sections._header.length > 0, 'header block captured');
  assert.ok(sections.experience, 'experience section captured');
  assert.ok(sections.education, 'education section captured');
  assert.ok(sections.certifications, 'certifications section captured');
});

/* --------------------------------------------------------- contact -------- */

suite.group('Contact extraction');

test('extracts all distinct emails in document order', () => {
  const emails = extractEmails(MULTI_CONTACT_RESUME);
  assert.strictEqual(emails[0], 'amit.kumar.dev@example.com');
  assert.strictEqual(emails[1], 'amit.k.work@example.com');
});

test('extracts multiple phone numbers without duplicates', () => {
  const phones = extractPhones(MULTI_CONTACT_RESUME);
  assert.ok(phones.length >= 2, `expected at least 2 phones, got ${phones.length}`);
  assert.ok(phones[0].includes('9988776655'));
});

test('returns empty collections when a resume has no contact details', () => {
  assert.deepStrictEqual(extractEmails(UNSTRUCTURED_RESUME), []);
  assert.deepStrictEqual(extractPhones(UNSTRUCTURED_RESUME), []);
});

test('extracts LinkedIn, GitHub and portfolio links', () => {
  const links = extractLinks(EXPERIENCED_RESUME);
  assert.strictEqual(links.linkedinUrl, 'https://linkedin.com/in/rahulsharma');
  assert.strictEqual(links.githubUrl, 'https://github.com/rahulsharma');
  assert.strictEqual(links.portfolioUrl, 'https://rahulsharma.dev');
});

test('does not mistake an email domain fragment for a portfolio site', () => {
  // "amit.kumar.dev@example.com" contains "kumar.dev", which is not a website.
  const links = extractLinks(MULTI_CONTACT_RESUME);
  assert.strictEqual(links.portfolioUrl, null, `unexpected portfolio: ${links.portfolioUrl}`);
});

test('rejects non-http URL schemes', () => {
  assert.strictEqual(normalizeUrl('javascript:alert(1)'), null);
  assert.strictEqual(normalizeUrl('data:text/html;base64,AAAA'), null);
  assert.strictEqual(normalizeUrl('example.com/profile'), 'https://example.com/profile');
});

/* --------------------------------------------------------- summary ------- */

suite.group('Professional summary');

test('returns the summary verbatim when present', () => {
  const summary = extractSummary(splitIntoSections(EXPERIENCED_RESUME));
  assert.ok(summary.startsWith('Experienced React developer'), summary);
});

test('reads a career objective as the summary', () => {
  const summary = extractSummary(splitIntoSections(FRESHER_RESUME));
  assert.ok(/Recent computer applications graduate/.test(summary), summary);
});

test('returns null rather than inventing a summary', () => {
  assert.strictEqual(extractSummary(splitIntoSections(UNSTRUCTURED_RESUME)), null);
});

/* ------------------------------------------------------ date ranges ------ */

suite.group('Date range parsing');

test('parses month-year ranges ending in Present', () => {
  const range = parseDateRange('Jan 2024 - Present');
  assert.strictEqual(range.start.year, 2024);
  assert.strictEqual(range.start.month, 1);
  assert.strictEqual(range.end.present, true);
});

test('parses closed month-year ranges', () => {
  const range = parseDateRange('Jul 2022 - Dec 2023');
  assert.strictEqual(range.start.year, 2022);
  assert.strictEqual(range.end.year, 2023);
  assert.strictEqual(range.end.month, 12);
});

test('parses year-only and numeric ranges', () => {
  assert.strictEqual(parseDateRange('2018 - 2022').start.year, 2018);
  assert.strictEqual(parseDateRange('03/2019 - 07/2021').end.year, 2021);
});

test('returns null when there is no range', () => {
  assert.strictEqual(parseDateRange('Senior React Developer'), null);
});

test('counts elapsed months rather than inclusive endpoints', () => {
  // Jan 2024 to Aug 2026 is 31 elapsed months, not 32.
  const years = computeExperienceYears(
    [{ period: 'Jan 2024 - Aug 2026' }],
    new Date('2026-08-13T00:00:00Z')
  );
  assert.strictEqual(years, 2.6, `got ${years}`);
});

test('merges overlapping employment so concurrent roles are not double counted', () => {
  const years = computeExperienceYears(
    [{ period: 'Jan 2020 - Jan 2024' }, { period: 'Jan 2022 - Jan 2024' }],
    new Date('2026-01-01T00:00:00Z')
  );
  assert.strictEqual(years, 4, `got ${years}`);
});

test('returns null when no entry carries a usable date', () => {
  assert.strictEqual(computeExperienceYears([{ period: null }]), null);
});

/* ------------------------------------------------------- experience ------ */

suite.group('Work experience');

test('separates each role with its own title, employer and dates', () => {
  const entries = extractExperience(splitIntoSections(EXPERIENCED_RESUME));
  assert.strictEqual(entries.length, 2, `expected 2 roles, got ${entries.length}`);

  assert.strictEqual(entries[0].title, 'Senior React Developer');
  assert.strictEqual(entries[0].company, 'ABC Technologies');
  assert.strictEqual(entries[0].isCurrent, true);
  assert.strictEqual(entries[0].highlights.length, 2);

  assert.strictEqual(entries[1].title, 'React Developer');
  assert.strictEqual(entries[1].company, 'XYZ Technologies');
  assert.strictEqual(entries[1].isCurrent, false);
});

test('a blank line between roles does not merge them', () => {
  const entries = extractExperience(splitIntoSections(EXPERIENCED_RESUME));
  assert.notStrictEqual(entries[1].title, null, 'second role kept its title');
  assert.notStrictEqual(entries[1].company, null, 'second role kept its employer');
});

test('attributes each role to its own location', () => {
  const entries = extractExperience(splitIntoSections(EXPERIENCED_RESUME));
  assert.strictEqual(entries[0].location, 'Gurugram');
  assert.strictEqual(entries[1].location, 'Noida');
});

test('reads a title containing a company-ish word as the title', () => {
  // "Lead Software Engineer" contains "software"; it is still the job title.
  const parsed = interpretExperienceHeader(['Lead Software Engineer', 'Global Systems Ltd, Pune']);
  assert.strictEqual(parsed.title, 'Lead Software Engineer');
  assert.strictEqual(parsed.company, 'Global Systems Ltd');
  assert.strictEqual(parsed.location, 'Pune');
});

test('returns no entries when the resume has no experience section', () => {
  assert.deepStrictEqual(extractExperience(splitIntoSections(FRESHER_RESUME)), []);
});

/* -------------------------------------------------------- education ------ */

suite.group('Education');

test('extracts degree, specialisation, institution, years and grade', () => {
  const [entry] = extractEducation(splitIntoSections(EXPERIENCED_RESUME));
  assert.strictEqual(entry.degree, 'B.Tech');
  assert.strictEqual(entry.specialisation, 'Information Technology');
  assert.ok(/XYZ University/.test(entry.institution), entry.institution);
  assert.strictEqual(entry.startYear, 2018);
  assert.strictEqual(entry.endYear, 2022);
  assert.strictEqual(entry.grade, 'CGPA 8.4/10');
});

test('reads a percentage grade', () => {
  const [entry] = extractEducation(splitIntoSections(FRESHER_RESUME));
  assert.strictEqual(entry.degree, 'MCA');
  assert.strictEqual(entry.grade, '78%');
});

test('normalises abbreviated degree punctuation', () => {
  assert.strictEqual(canonicalDegree('B.E'), 'B.E.');
  assert.strictEqual(canonicalDegree('BTech'), 'B.Tech');
  assert.strictEqual(canonicalDegree('b tech'), 'B.Tech');
});

/* ------------------------------- projects, certs, languages, awards ------ */

suite.group('Projects, certifications, languages and achievements');

test('extracts a project with its technologies and description', () => {
  const [project] = extractProjects(splitIntoSections(EXPERIENCED_RESUME));
  assert.strictEqual(project.name, 'Analytics Dashboard');
  assert.ok(project.technologies.includes('React'), JSON.stringify(project.technologies));
  assert.ok(/reporting workspace/i.test(project.description), project.description);
});

test('does not capture a following section heading as a project', () => {
  const projects = extractProjects(splitIntoSections(EXPERIENCED_RESUME));
  assert.ok(
    !projects.some((p) => /^CERTIFICATIONS$/i.test(p.name || '')),
    'section heading leaked into projects'
  );
});

test('extracts certification name, issuer, date and credential ID', () => {
  const [cert] = extractCertifications(splitIntoSections(EXPERIENCED_RESUME));
  assert.strictEqual(cert.name, 'AWS Certified Developer Associate');
  assert.ok(/Amazon Web Services/.test(cert.issuer), cert.issuer);
  assert.strictEqual(cert.issueDate, 'Mar 2024');
  assert.strictEqual(cert.credentialId, 'ABC-1234');
});

test('extracts languages with proficiency when stated', () => {
  const languages = extractLanguages(splitIntoSections(EXPERIENCED_RESUME));
  assert.deepStrictEqual(
    languages.map((l) => l.name),
    ['English', 'Hindi']
  );
  assert.strictEqual(languages[0].proficiency, 'Professional');
  assert.strictEqual(languages[1].proficiency, 'Native');
});

test('extracts achievements as discrete items', () => {
  const achievements = extractAchievements(splitIntoSections(EXPERIENCED_RESUME));
  assert.strictEqual(achievements.length, 1);
  assert.ok(/hackathon/i.test(achievements[0]));
});

/* --------------------------------------------------- full profile -------- */

suite.group('Full profile assembly');

test('assembles a complete profile for an experienced candidate', () => {
  const profile = parseResumeProfile(EXPERIENCED_RESUME);
  assert.strictEqual(profile.headline, 'Senior React Developer');
  assert.strictEqual(profile.currentLocation, 'Gurugram');
  assert.strictEqual(profile.experience.length, 2);
  assert.strictEqual(profile.education.length, 1);
  assert.strictEqual(profile.certifications.length, 1);
  assert.strictEqual(profile.languages.length, 2);
  assert.strictEqual(profile.parserVersion, 2);
});

test('prefers an explicitly labelled current location over any city in the text', () => {
  // The resume mentions Hyderabad under a previous employer but states Pune.
  const profile = parseResumeProfile(MULTI_CONTACT_RESUME);
  assert.strictEqual(profile.currentLocation, 'Pune');
});

test('leaves every field empty for an unstructured resume rather than guessing', () => {
  const profile = parseResumeProfile(UNSTRUCTURED_RESUME);
  assert.strictEqual(profile.summary, null);
  assert.strictEqual(profile.headline, null);
  assert.deepStrictEqual(profile.experience, []);
  assert.deepStrictEqual(profile.education, []);
  assert.deepStrictEqual(profile.certifications, []);
  assert.strictEqual(profile.computedExperienceYears, null);
});

test('candidate extractor prefers a stated total experience over the computed figure', () => {
  const profile = extractCandidateProfile(MULTI_CONTACT_RESUME, { fileName: 'amit.txt' });
  assert.strictEqual(profile.totalExperience, 7, 'stated "Total Experience: 7 years" wins');
  assert.ok(profile.parsedProfile.computedExperienceYears > 7, 'computed figure still available');
});

test('candidate extractor surfaces alternate contact details and links', () => {
  const profile = extractCandidateProfile(MULTI_CONTACT_RESUME, { fileName: 'amit.txt' });
  assert.strictEqual(profile.email, 'amit.kumar.dev@example.com');
  assert.strictEqual(profile.alternateEmail, 'amit.k.work@example.com');
  assert.ok(profile.alternatePhone, 'alternate phone captured');
  assert.strictEqual(profile.currentSalary, 1800000);
  assert.strictEqual(profile.expectedSalary, 2600000);
});

test('candidate extractor records warnings and PARTIAL status for sparse resumes', () => {
  const profile = extractCandidateProfile(UNSTRUCTURED_RESUME, { fileName: 'sneha.txt' });
  assert.strictEqual(profile.extractionStatus, 'PARTIAL');
  assert.ok(profile.extractionWarnings.length >= 2, JSON.stringify(profile.extractionWarnings));
  assert.strictEqual(profile.email, null);
});

/* ------------------------------------------- job description parsing ----- */

suite.group('Job description requirement extraction');

test('reads the minimum experience from common phrasings', () => {
  assert.strictEqual(extractMinimumExperience('Minimum 5 years of experience required'), 5);
  assert.strictEqual(extractMinimumExperience('3+ years experience with React'), 3);
  assert.strictEqual(extractMinimumExperience('We need 4.5 yrs of hands-on professional experience'), 4.5);
  assert.strictEqual(extractMinimumExperience('2 years exp'), 2);
});

test('returns 0 when no duration is stated', () => {
  assert.strictEqual(extractMinimumExperience('No duration mentioned at all'), 0);
  assert.strictEqual(extractMinimumExperience(''), 0);
  assert.strictEqual(extractMinimumExperience(null), 0);
});

test('ignores implausible durations', () => {
  assert.strictEqual(extractMinimumExperience('500 years of experience'), 0);
});

test('completes in linear time on text that never reaches the word "experience"', () => {
  // Regression: the original single-regex implementation contained a quantifier
  // nested over a possibly-empty group. This exact shape of input took over two
  // minutes on 92 characters and pinned the process at 100% CPU, so uploading an
  // ordinary job description could hang the whole API.
  const pathological = `We require 5 years ${'strong hands-on delivery capability '.repeat(400)}.`;
  const startedAt = Date.now();
  const result = extractMinimumExperience(pathological);
  const elapsed = Date.now() - startedAt;

  assert.strictEqual(result, 5, 'still extracts the duration');
  assert.ok(elapsed < 250, `took ${elapsed}ms — expected well under 250ms`);
});

test('full requirement extraction stays fast on a long job description', () => {
  const jd = `Senior React Developer

    We are looking for an engineer with 4 years ${'of proven delivery across complex product surfaces '.repeat(200)}.

    REQUIRED SKILLS
    React, TypeScript, Node.js, PostgreSQL

    PREFERRED
    Docker, AWS, Kubernetes

    QUALIFICATIONS
    B.Tech in Computer Science`;

  const startedAt = Date.now();
  const requirements = extractJDRequirements(jd, 'Senior React Developer');
  const elapsed = Date.now() - startedAt;

  assert.ok(elapsed < 1000, `took ${elapsed}ms — expected under 1000ms`);
  assert.strictEqual(requirements.minimumExperience, 4);
  assert.ok(requirements.requiredSkills.includes('React'), JSON.stringify(requirements.requiredSkills));
  assert.ok(requirements.roleKeywords.includes('Senior React Developer'));
});

test('requirement extraction tolerates empty and non-string input', () => {
  const empty = extractJDRequirements('');
  assert.deepStrictEqual(empty.requiredSkills, []);
  assert.strictEqual(empty.minimumExperience, 0);
  assert.deepStrictEqual(extractJDRequirements(null).roleKeywords, []);
});

/* ----------------------------------------------------- query building ---- */

suite.group('Candidate query building');

test('a search term and a location filter both survive as separate AND clauses', () => {
  const where = buildCandidateWhere({ search: 'rahul', location: 'Bengaluru' });
  assert.strictEqual(where.AND.length, 2, 'both conditions retained');
  const groups = where.AND.filter((clause) => Array.isArray(clause.OR));
  assert.strictEqual(groups.length, 2, 'each filter keeps its own OR group');
});

test('search covers name, email, phone, role, location and skills', () => {
  const [group] = buildCandidateWhere({ search: 'react' }).AND;
  const fields = group.OR.map((condition) => Object.keys(condition)[0]);
  ['name', 'email', 'phone', 'currentRole', 'currentLocation', 'skills'].forEach((field) => {
    assert.ok(fields.includes(field), `search should cover ${field}`);
  });
});

test('skill matching is case-insensitive via value variants', () => {
  const [clause] = buildCandidateWhere({ skill: 'react' }).AND;
  assert.ok(clause.skills.hasSome.includes('React'), JSON.stringify(clause.skills.hasSome));
  assert.ok(clause.skills.hasSome.includes('react'));
});

test('repeated skill parameters produce an AND of skills', () => {
  const where = buildCandidateWhere({ skill: ['React', 'Kubernetes'] });
  const skillClauses = where.AND.filter((clause) => clause.skills);
  assert.strictEqual(skillClauses.length, 2, 'each skill is required');
});

test('multiple statuses become an IN filter', () => {
  const [clause] = buildCandidateWhere({ hrStatus: 'REVIEW,NEEDS_REVIEW' }).AND;
  assert.deepStrictEqual(clause.hrStatus.in, ['REVIEW', 'NEEDS_REVIEW']);
});

test('an unknown status value is ignored rather than returning nothing', () => {
  const where = buildCandidateWhere({ hrStatus: 'NOT_A_STATUS' });
  assert.ok(!where.AND || where.AND.length === 0, JSON.stringify(where));
});

test('experience ranges map to numeric bounds, including unknown', () => {
  assert.deepStrictEqual(buildCandidateWhere({ experienceRange: '2-4' }).AND[0].totalExperience, { gte: 2, lte: 4 });
  assert.deepStrictEqual(buildCandidateWhere({ experienceRange: '10+' }).AND[0].totalExperience, { gte: 10 });
  assert.strictEqual(buildCandidateWhere({ experienceRange: 'unknown' }).AND[0].totalExperience, null);
});

test('requirement-relative experience ranges use the job bounds', () => {
  const job = { minimumExperience: 3, maximumExperience: 6 };
  assert.deepStrictEqual(buildCandidateWhere({ experienceRange: 'meets_req' }, job).AND[0].totalExperience, { gte: 3, lte: 6 });
  assert.deepStrictEqual(buildCandidateWhere({ experienceRange: 'below_req' }, job).AND[0].totalExperience, { lt: 3 });
});

test('an empty query produces no filtering', () => {
  assert.deepStrictEqual(buildCandidateWhere({}), {});
});

test('pagination is clamped to sane bounds', () => {
  assert.deepStrictEqual(parsePagination({}), { page: 1, limit: 20, skip: 0 });
  assert.deepStrictEqual(parsePagination({ page: '3', limit: '10' }), { page: 3, limit: 10, skip: 20 });
  assert.strictEqual(parsePagination({ limit: '5000' }).limit, 100, 'limit capped');
  assert.strictEqual(parsePagination({ page: '-4' }).page, 1, 'page floored');
  assert.strictEqual(parsePagination({ limit: 'abc' }).limit, 20, 'non-numeric falls back');
});

test('an unknown sort key falls back to the default ordering', () => {
  assert.deepStrictEqual(parseSort('nonsense'), parseSort('score_desc'));
  assert.deepStrictEqual(parseSort('name_asc'), [{ name: 'asc' }]);
});

test('pagination metadata reports navigation state correctly', () => {
  assert.deepStrictEqual(buildPaginationMeta({ page: 2, limit: 20, total: 45 }), {
    page: 2,
    limit: 20,
    total: 45,
    totalPages: 3,
    hasNextPage: true,
    hasPreviousPage: true
  });
  const empty = buildPaginationMeta({ page: 1, limit: 20, total: 0 });
  assert.strictEqual(empty.totalPages, 1, 'never reports zero pages');
  assert.strictEqual(empty.hasNextPage, false);
});

/* ------------------------------------------------------ serialisation ---- */

suite.group('API serialisation');

const CANDIDATE_ROW = {
  id: 'cand-1',
  jobId: 'job-1',
  name: 'Rahul Sharma',
  email: 'rahul@example.com',
  phone: '+919876543210',
  currentRole: 'Senior React Developer',
  headline: 'Senior React Developer',
  totalExperience: 4.2,
  currentLocation: 'Gurugram',
  qualification: 'B.Tech',
  skills: ['React', 'Node.js'],
  education: ['B.Tech'],
  projects: [],
  hrStatus: 'REVIEW',
  source: 'MANUAL_SINGLE',
  overallScore: 96,
  alignmentLabel: 'Excellent Alignment',
  matchedSkills: ['React'],
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-02T00:00:00Z')
};

const JOB = {
  minimumExperience: 2,
  maximumExperience: 6,
  preferredLocations: ['Gurugram'],
  qualifications: ['B.Tech'],
  salaryMin: 800000,
  salaryMax: 1600000
};

test('list serialisation keeps the legacy _id alias alongside id', () => {
  const dto = formatCandidateForApi(CANDIDATE_ROW, JOB);
  assert.strictEqual(dto._id, 'cand-1');
  assert.strictEqual(dto.id, 'cand-1');
});

test('compatibility flags are computed when the job supplies criteria', () => {
  const { compatibilityFlags: flags } = formatCandidateForApi(CANDIDATE_ROW, JOB);
  assert.strictEqual(flags.experienceMatch, true);
  assert.strictEqual(flags.locationMatch, true);
  assert.strictEqual(flags.qualificationMatch, true);
});

test('a comparison that cannot be made is null, not false', () => {
  const flags = computeCompatibilityFlags({ totalExperience: null, currentLocation: null }, JOB);
  assert.strictEqual(flags.experienceMatch, null, 'unknown experience is not a failure');
  assert.strictEqual(flags.locationMatch, null, 'unknown location is not a failure');
  assert.strictEqual(flags.salaryMatch, null, 'unknown salary is not a failure');
});

test('location matching normalises Gurgaon and Bangalore spellings', () => {
  assert.strictEqual(computeCompatibilityFlags({ currentLocation: 'Gurgaon' }, { preferredLocations: ['Gurugram'] }).locationMatch, true);
  assert.strictEqual(computeCompatibilityFlags({ currentLocation: 'Bengaluru' }, { preferredLocations: ['Bangalore'] }).locationMatch, true);
});

test('experience outside the job band is reported as a mismatch', () => {
  assert.strictEqual(computeCompatibilityFlags({ totalExperience: 9 }, JOB).experienceMatch, false);
});

test('matchAnalysis is null until the candidate has been scored', () => {
  const dto = formatCandidateForApi({ ...CANDIDATE_ROW, overallScore: null }, JOB);
  assert.strictEqual(dto.matchAnalysis, null);
});

test('detail serialisation groups personal, professional, application and resume data', () => {
  const detail = formatCandidateDetail(
    {
      ...CANDIDATE_ROW,
      linkedinUrl: 'https://linkedin.com/in/rahulsharma',
      summary: 'Experienced React developer.',
      resumeData: Buffer.from('pdf-bytes'),
      resumeSize: 9,
      resumeFileName: 'rahul.pdf',
      resumeText: 'full text',
      job: { id: 'job-1', title: 'React Developer' },
      parsedProfile: {
        links: { linkedinUrl: 'https://linkedin.com/in/rahulsharma', otherLinks: [] },
        experience: [{ title: 'Senior React Developer', company: 'ABC Technologies', isCurrent: true }],
        education: [{ degree: 'B.Tech' }],
        certifications: [{ name: 'AWS' }],
        languages: [{ name: 'English' }],
        achievements: ['Hackathon winner'],
        projects: [{ name: 'Dashboard' }],
        computedExperienceYears: 4.1,
        detectedSections: ['summary', 'experience'],
        parserVersion: 2
      },
      noteEntries: [{ id: 'n1', body: 'Strong screen', authorName: 'Recruiter', createdAt: new Date() }],
      activities: [{ id: 'a1', type: 'IMPORTED', description: 'Imported', actorName: 'System', createdAt: new Date() }]
    },
    JOB,
    { includeResumeText: true }
  );

  assert.strictEqual(detail.personal.linkedin, 'https://linkedin.com/in/rahulsharma');
  assert.strictEqual(detail.professional.currentCompany, 'ABC Technologies');
  assert.strictEqual(detail.professional.statedExperienceYears, 4.2);
  assert.strictEqual(detail.professional.computedExperienceYears, 4.1);
  assert.strictEqual(detail.application.jobTitle, 'React Developer');
  assert.strictEqual(detail.resume.available, true);
  assert.strictEqual(detail.resume.storage, 'DATABASE');
  assert.strictEqual(detail.resume.text, 'full text');
  assert.strictEqual(detail.certifications.length, 1);
  assert.strictEqual(detail.noteEntries.length, 1);
  assert.strictEqual(detail.activities.length, 1);
});

test('resume availability reflects how the document is stored', () => {
  const outlook = formatCandidateDetail({ ...CANDIDATE_ROW, source: 'OUTLOOK', resumeData: null }, JOB);
  assert.strictEqual(outlook.resume.available, true, 'Outlook resumes are re-fetchable');
  assert.strictEqual(outlook.resume.storage, 'OUTLOOK');

  const missing = formatCandidateDetail({ ...CANDIDATE_ROW, source: 'MANUAL_SINGLE', resumeData: null }, JOB);
  assert.strictEqual(missing.resume.available, false, 'no bytes means not available');
  assert.strictEqual(missing.resume.storage, 'NONE');
});

test('detail serialisation omits resume text unless explicitly requested', () => {
  const detail = formatCandidateDetail({ ...CANDIDATE_ROW, resumeText: 'secret text' }, JOB);
  assert.strictEqual(detail.resume.text, undefined);
});

test('serialisers tolerate null and missing input', () => {
  assert.strictEqual(formatCandidateForApi(null), null);
  assert.strictEqual(formatCandidateDetail(null), null);
  const bare = formatCandidateForApi({ id: 'x', name: 'Nobody' });
  assert.deepStrictEqual(bare.skills, []);
  assert.deepStrictEqual(bare.compatibilityFlags, {
    experienceMatch: null,
    locationMatch: null,
    qualificationMatch: null,
    salaryMatch: null
  });
});

suite.group('Error handler — Prisma text is never forwarded to the client');

const { errorHandler } = require('../middleware/errorHandler');

/** Runs the middleware against a fake res and returns the JSON payload + status. */
const runErrorHandler = (err) => {
  let status = 200;
  let payload = null;
  const res = {
    statusCode: 200,
    status(code) {
      status = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    }
  };
  errorHandler(err, { method: 'GET', originalUrl: '/api/candidates/x' }, res, () => {});
  return { status, payload };
};

/**
 * Regression: an identifier containing a NUL byte makes the driver reject the
 * query, and Prisma raises PrismaClientUnknownRequestError. That class was named
 * by none of the mapping branches, so its message — which embeds the generated
 * query and the absolute path of the calling file — was returned to the browser
 * verbatim outside production.
 */
const unknownRequestError = () => {
  const error = new Error(
    '\nInvalid `prisma.candidate.findUnique()` invocation in\n' +
      'C:\\Users\\someone\\project\\backend\\services\\candidateService.js:120:45\n\n' +
      'Error occurred during query execution'
  );
  error.name = 'PrismaClientUnknownRequestError';
  error.clientVersion = '5.22.0';
  return error;
};

test('PrismaClientUnknownRequestError message is replaced with a safe one', () => {
  const { payload } = runErrorHandler(unknownRequestError());
  assert.ok(!/Invalid `prisma/.test(payload.message), 'raw Prisma text reached the client');
  assert.ok(!/[A-Za-z]:\\Users\\/.test(payload.message), 'an absolute server path reached the client');
  assert.strictEqual(payload.code, 'DATABASE_ERROR');
});

test('an unnamed Prisma fault is not silently reclassified as a client error', () => {
  const { status } = runErrorHandler(unknownRequestError());
  assert.strictEqual(status, 500);
});

test('mapped Prisma codes keep their own message and status', () => {
  const duplicate = new Error('Unique constraint failed on the fields: (`resumeHash`)');
  duplicate.code = 'P2002';
  const { status, payload } = runErrorHandler(duplicate);
  assert.strictEqual(status, 409);
  assert.strictEqual(payload.code, 'DUPLICATE_RECORD');
  assert.ok(!/Unique constraint failed/.test(payload.message));
});

test('PrismaClientValidationError keeps its 400 mapping', () => {
  const validation = new Error('Argument where is missing. Generated query: SELECT ...');
  validation.name = 'PrismaClientValidationError';
  const { status, payload } = runErrorHandler(validation);
  assert.strictEqual(status, 400);
  assert.strictEqual(payload.code, 'INVALID_QUERY');
  assert.ok(!/Generated query/.test(payload.message));
});

test('a non-Prisma application error keeps its own message', () => {
  const appError = new Error('This candidate profile could not be found.');
  appError.statusCode = 404;
  appError.code = 'CANDIDATE_NOT_FOUND';
  const { status, payload } = runErrorHandler(appError);
  assert.strictEqual(status, 404);
  assert.strictEqual(payload.message, 'This candidate profile could not be found.');
  assert.strictEqual(payload.code, 'CANDIDATE_NOT_FOUND');
});

const { failed } = suite.summary();
process.exit(failed > 0 ? 1 : 0);
