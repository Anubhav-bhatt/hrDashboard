const assert = require('assert');
const { extractJDRequirements } = require('../services/jdRequirementExtractor');
const { matchCandidateToJob } = require('../services/candidateMatcher');
const { generateCandidateInsights } = require('../services/candidateInsightService');
const { normalizeSkillName } = require('../utils/skillNormalization');
const { extractResumeText } = require('../services/resumeParser');

async function runPhase4Tests() {
  console.log('====================================================');
  console.log('   HR Resume Screening Dashboard - Phase 4 Test Suite');
  console.log('                 (PostgreSQL & Prisma)');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(description, fn) {
    try {
      fn();
      console.log(`✓ [PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`✕ [FAIL] ${description}`);
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  async function testAsync(description, fn) {
    try {
      await fn();
      console.log(`✓ [PASS] ${description}`);
      passed++;
    } catch (err) {
      console.error(`✕ [FAIL] ${description}`);
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Skill Alias Normalization
  test('Skill Normalization maps aliases correctly (ReactJS -> React, NodeJS -> Node.js)', () => {
    assert.strictEqual(normalizeSkillName('ReactJS'), 'React');
    assert.strictEqual(normalizeSkillName('React.js'), 'React');
    assert.strictEqual(normalizeSkillName('NodeJS'), 'Node.js');
    assert.strictEqual(normalizeSkillName('RESTful API'), 'REST API');
    assert.strictEqual(normalizeSkillName('Postgres'), 'PostgreSQL');
  });

  // 2. JD Requirement Extractor
  test('JD Requirement Extractor identifies required skills, preferred skills, and minimum experience', () => {
    const jdText = `
      Job Title: Senior React Developer
      We are looking for a Senior Frontend Engineer with at least 4 years of hands-on experience.
      
      Required Skills:
      - React, TypeScript, JavaScript, Redux, REST API
      
      Preferred Skills:
      - Next.js, Tailwind CSS, GraphQL
      
      Education:
      - Bachelor's degree in Computer Science or equivalent
    `;

    const requirements = extractJDRequirements(jdText, 'Senior React Developer');

    assert.ok(requirements.requiredSkills.includes('React'));
    assert.ok(requirements.requiredSkills.includes('TypeScript'));
    assert.ok(requirements.preferredSkills.includes('Next.js'));
    assert.strictEqual(requirements.minimumExperience, 4);
  });

  // 3. Deterministic Matcher Calculation
  test('Deterministic Matcher returns high score for candidate meeting all required skills & experience', () => {
    const job = {
      title: 'Senior React Developer',
      requirements: {
        requiredSkills: ['React', 'TypeScript', 'JavaScript', 'Redux', 'REST API'],
        preferredSkills: ['Next.js', 'Tailwind CSS'],
        minimumExperience: 4,
        preferredEducation: ['Bachelor'],
        roleKeywords: ['Frontend', 'Developer']
      }
    };

    const candidate = {
      name: 'Rahul Sharma',
      email: 'rahul@example.com',
      totalExperience: 5,
      skills: ['React', 'TypeScript', 'JavaScript', 'Redux', 'REST API', 'Next.js'],
      currentRole: 'Senior Frontend Developer',
      education: ["Bachelor's in Computer Science"],
      projects: ['Enterprise Dashboard']
    };

    const match = matchCandidateToJob(job, candidate);

    assert.ok(match.overallScore >= 85, 'Overall score should be >= 85%');
    assert.strictEqual(match.alignmentLabel, 'Excellent Alignment');
    assert.strictEqual(match.requiredSkillScore, 40, 'Required skill score should be 40/40');
    assert.strictEqual(match.experienceScore, 25, 'Experience score should be 25/25');
  });

  // 4. Partial Matcher Calculation
  test('Deterministic Matcher calculates proportional score for partial matches and clamps between 0 and 100', () => {
    const job = {
      title: 'Senior Backend Engineer',
      requirements: {
        requiredSkills: ['Node.js', 'PostgreSQL', 'Redis', 'Docker', 'AWS'],
        minimumExperience: 6
      }
    };

    const candidate = {
      name: 'Amit Kumar',
      totalExperience: 3,
      skills: ['Node.js', 'PostgreSQL'],
      currentRole: 'Backend Developer'
    };

    const match = matchCandidateToJob(job, candidate);

    assert.ok(match.overallScore < 70, 'Partial match score should be lower');
    assert.ok(match.overallScore >= 0 && match.overallScore <= 100, 'Score must clamp between 0 and 100');
    assert.strictEqual(match.missingRequiredSkills.length, 3, 'Should list 3 missing required skills');
  });

  // 5. Deterministic Repeatability
  test('Matcher score calculation is 100% deterministic across repeated calls', () => {
    const job = {
      title: 'Full Stack Engineer',
      requirements: {
        requiredSkills: ['React', 'Node.js', 'PostgreSQL'],
        minimumExperience: 3
      }
    };

    const candidate = {
      name: 'Priya Jain',
      totalExperience: 4,
      skills: ['React', 'Node.js', 'PostgreSQL', 'TypeScript']
    };

    const run1 = matchCandidateToJob(job, candidate);
    const run2 = matchCandidateToJob(job, candidate);
    const run3 = matchCandidateToJob(job, candidate);

    assert.strictEqual(run1.overallScore, run2.overallScore);
    assert.strictEqual(run2.overallScore, run3.overallScore);
    assert.strictEqual(run1.requiredSkillScore, run3.requiredSkillScore);
  });

  // 6. In-Memory Resume Text Extraction
  await testAsync('In-Memory Resume Parser parses TXT Buffer directly without writing files to disk', async () => {
    const sampleText = 'Priya Jain\nEmail: priya@test.com\nPhone: +919876543210\nSkills: React, Node.js, PostgreSQL\nExperience: 4 years of experience building modern web applications.';
    const buffer = Buffer.from(sampleText, 'utf-8');

    const result = await extractResumeText({
      buffer,
      mimeType: 'text/plain',
      fileName: 'resume.txt'
    });

    assert.ok(result.characterCount > 100);
    assert.strictEqual(result.fileType, 'txt');
  });

  console.log('\n====================================================');
  console.log(`   PHASE 4 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase4Tests();
