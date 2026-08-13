/**
 * Resume parsing validation harness.
 *
 * Runs the real extraction pipeline over local resume files and reports which
 * fields were recovered from each. Values are masked so running this against
 * real candidate documents does not print personal data to a terminal or log.
 *
 *   node scratch/validateParsing.js "C:/path/to/resumes" [more paths...]
 *   node scratch/validateParsing.js "C:/path/to/one-resume.pdf"
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { extractResumeText } = require('../services/resumeParser');
const { extractCandidateProfile } = require('../services/candidateExtractor');

const SUPPORTED = ['.pdf', '.docx', '.txt'];

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain'
};

/** Masks a value so only its shape is reported. */
const mask = (value) => {
  if (value === null || value === undefined || value === '') return 'absent';
  const text = String(value);
  if (text.includes('@')) {
    const [local, domain] = text.split('@');
    return `present (${local[0]}***@${domain.split('.').pop()})`;
  }
  if (/^\+?\d[\d\s-]{6,}$/.test(text)) return `present (${text.length} chars, ends ${text.slice(-2)})`;
  return `present (${text.length} chars)`;
};

const collect = (target) => {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs
    .readdirSync(target)
    .map((name) => path.join(target, name))
    .filter((file) => {
      try {
        return fs.statSync(file).isFile() && SUPPORTED.includes(path.extname(file).toLowerCase());
      } catch {
        return false;
      }
    });
};

const run = async () => {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error('Provide at least one file or directory path.');
    process.exit(1);
  }

  const files = targets.flatMap(collect);
  if (!files.length) {
    console.error('No .pdf, .docx or .txt files found at the supplied paths.');
    process.exit(1);
  }

  console.log(`\nValidating ${files.length} document(s)\n${'='.repeat(78)}`);

  const totals = { parsed: 0, failed: 0 };
  const fieldHits = {};

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const name = path.basename(file);
    const buffer = fs.readFileSync(file);

    console.log(`\n${name}  (${ext}, ${(buffer.length / 1024).toFixed(0)} KB)`);

    let text;
    try {
      const parsed = await extractResumeText({ buffer, mimeType: MIME_BY_EXT[ext], fileName: name });
      text = parsed.text;
      const pageish = (text.match(/\f/g) || []).length + 1;
      console.log(`   text extracted : ${text.length} chars, ~${pageish} page break(s), type ${parsed.fileType}`);
      totals.parsed++;
    } catch (error) {
      console.log(`   EXTRACTION FAILED : ${error.message.split(':')[0]}`);
      totals.failed++;
      continue;
    }

    const profile = extractCandidateProfile(text, { fileName: name });
    const structured = profile.parsedProfile;

    const fields = {
      name: profile.name !== 'Unknown Candidate' ? profile.name : null,
      email: profile.email,
      phone: profile.phone,
      location: profile.currentLocation,
      summary: profile.summary,
      currentRole: profile.currentRole,
      linkedin: profile.linkedinUrl,
      github: profile.githubUrl,
      portfolio: profile.portfolioUrl,
      totalExperience: profile.totalExperience
    };

    for (const [key, value] of Object.entries(fields)) {
      console.log(`   ${key.padEnd(16)}: ${mask(value)}`);
      if (value !== null && value !== undefined && value !== '') fieldHits[key] = (fieldHits[key] || 0) + 1;
    }

    const counts = {
      skills: profile.skills.length,
      experienceEntries: structured.experience.length,
      educationEntries: structured.education.length,
      projects: structured.projects.length,
      certifications: structured.certifications.length,
      languages: structured.languages.length,
      achievements: structured.achievements.length
    };

    for (const [key, count] of Object.entries(counts)) {
      console.log(`   ${key.padEnd(16)}: ${count}`);
      if (count > 0) fieldHits[key] = (fieldHits[key] || 0) + 1;
    }

    console.log(`   sections found  : ${structured.detectedSections.join(', ') || 'none'}`);
    console.log(`   status          : ${profile.extractionStatus} (${profile.extractionWarnings.length} warning(s))`);
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`Documents parsed: ${totals.parsed} / ${files.length}   (failed: ${totals.failed})`);
  console.log('\nField recovery across the set:');
  for (const [field, hits] of Object.entries(fieldHits).sort((a, b) => b[1] - a[1])) {
    const pct = Math.round((hits / totals.parsed) * 100);
    console.log(`   ${field.padEnd(18)} ${String(hits).padStart(3)}/${totals.parsed}  ${pct}%`);
  }
  console.log('');
};

run().catch((error) => {
  console.error('validation failed:', error.message);
  process.exit(1);
});
