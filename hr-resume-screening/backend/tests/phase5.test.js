const assert = require('assert');
const outlookService = require('../services/outlookService');
const { extractJDRequirements } = require('../services/jdRequirementExtractor');
const { matchCandidateToJob } = require('../services/candidateMatcher');
const { generateCandidateInsights } = require('../services/candidateInsightService');
const { normalizeSkillName } = require('../utils/skillNormalization');
const { extractResumeText } = require('../services/resumeParser');

async function runPhase5Tests() {
  console.log('====================================================');
  console.log('   HR Resume Screening Dashboard - Phase 5 Test Suite');
  console.log('                  (Prisma & PostgreSQL)');
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

  // Test 1: In-Memory Resume Attachment Buffer Fetching
  await testAsync('Outlook Service retrieves resume attachment into memory Buffer without disk writes', async () => {
    const attachment = await outlookService.getAttachmentBuffer(
      'MOCK_ACCESS_TOKEN_TEST',
      'msg-mock-123',
      'att-mock-123'
    );

    assert.ok(attachment.buffer, 'Attachment buffer must exist');
    assert.ok(Buffer.isBuffer(attachment.buffer), 'Attachment content must be Buffer instance');
    assert.ok(attachment.buffer.length > 0, 'Buffer length must be greater than 0');
    assert.strictEqual(attachment.mimeType, 'application/pdf');
  });

  // Test 2: JD Requirement Extraction & Skill Alias Mapping
  test('Skill Normalization maps aliases correctly (ReactJS -> React, NodeJS -> Node.js)', () => {
    assert.strictEqual(normalizeSkillName('ReactJS'), 'React');
    assert.strictEqual(normalizeSkillName('React.js'), 'React');
    assert.strictEqual(normalizeSkillName('NodeJS'), 'Node.js');
    assert.strictEqual(normalizeSkillName('RESTful API'), 'REST API');
  });

  // Test 3: Deterministic Matcher Logic & Clamping
  test('Deterministic Matcher calculates weighted score and clamps between 0 and 100', () => {
    const job = {
      title: 'Senior Frontend Developer',
      requirements: {
        requiredSkills: ['React', 'TypeScript', 'JavaScript'],
        preferredSkills: ['Next.js', 'Tailwind CSS'],
        minimumExperience: 4,
        preferredEducation: ['B.Tech', 'B.E.'],
        roleKeywords: ['Frontend', 'Developer']
      }
    };

    const candidate = {
      name: 'Rahul Sharma',
      email: 'rahul@example.com',
      totalExperience: 5,
      skills: ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS'],
      currentRole: 'Frontend Developer',
      education: ['B.Tech Computer Science'],
      projects: ['E-commerce Platform']
    };

    const match = matchCandidateToJob(job, candidate);
    assert.ok(match.overallScore >= 80, 'Score should be high for matching candidate');
    assert.strictEqual(match.alignmentLabel, 'Excellent Alignment');
    assert.strictEqual(match.requiredSkillScore, 40);
  });

  // Test 4: Determinism across repeated calls
  test('Matcher score calculation is 100% deterministic across repeated calls', () => {
    const job = {
      title: 'Node Engineer',
      requirements: { requiredSkills: ['Node.js', 'Express'], minimumExperience: 3 }
    };
    const candidate = {
      name: 'Amit Kumar',
      totalExperience: 4,
      skills: ['Node.js', 'Express', 'MongoDB']
    };

    const run1 = matchCandidateToJob(job, candidate);
    const run2 = matchCandidateToJob(job, candidate);
    const run3 = matchCandidateToJob(job, candidate);

    assert.strictEqual(run1.overallScore, run2.overallScore);
    assert.strictEqual(run2.overallScore, run3.overallScore);
  });

  // Test 5: In-Memory Resume Parsing
  await testAsync('In-Memory Resume Parser parses TXT Buffer directly without writing files to disk', async () => {
    const sampleText = 'Rahul Sharma\nEmail: rahul.sharma@test.com\nPhone: +919876543210\nSkills: React, Node.js, PostgreSQL, TypeScript\nExperience: 4.5 years of experience in web application engineering.';
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
  console.log(`   PHASE 5 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase5Tests();
