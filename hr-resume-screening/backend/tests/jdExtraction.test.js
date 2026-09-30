const assert = require('assert');
const { extractJDRequirements, extractMinimumExperience } = require('../services/jdRequirementExtractor');
const { extractJobProfile, extractJobTitle, evaluateExtractionStatus } = require('../services/jdProfileService');
const { extractJDText } = require('../services/jdParser');
const { areSkillsEquivalent } = require('../utils/skillTaxonomy');

async function runJdExtractionTests() {
  console.log('====================================================');
  console.log('      JD Extraction & Parsing Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  PASS  ${name}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL  ${name}`);
      console.error(`        ${err.message}`);
      failed++;
    }
  }

  /* =========================================================================
   * 1. ACCEPTANCE EXAMPLE
   * ========================================================================= */
  console.log('Acceptance Example');

  await test('exact acceptance example extracts title, 3+ yrs, must-have, nice-to-have, and responsibilities without failure', async () => {
    const jdText = `React Developer

We are looking for a React Developer with 3+ years of experience.

The candidate should have strong knowledge of ReactJS,
JavaScript, REST APIs and Git.

Experience with TypeScript, Jest and AWS is preferred.

The developer will build reusable frontend components,
integrate backend APIs and optimize web application performance.`;

    const title = extractJobTitle(jdText, 'pasted-job-description.txt');
    assert.strictEqual(title, 'React Developer', `Expected 'React Developer', got '${title}'`);

    const profile = extractJobProfile({
      title,
      description: jdText,
      fileName: 'pasted-job-description.txt'
    });

    // Title
    assert.strictEqual(profile.title, 'React Developer');

    // Experience
    assert.strictEqual(profile.minimumExperience, 3, `Expected 3 years, got ${profile.minimumExperience}`);

    // Must-have skills: React, JavaScript, REST API/REST APIs, Git
    assert.ok(profile.requiredSkills.some(s => areSkillsEquivalent(s, 'React')), 'Missing React in requiredSkills');
    assert.ok(profile.requiredSkills.some(s => areSkillsEquivalent(s, 'JavaScript')), 'Missing JavaScript in requiredSkills');
    assert.ok(profile.requiredSkills.some(s => areSkillsEquivalent(s, 'REST API')), 'Missing REST API in requiredSkills');
    assert.ok(profile.requiredSkills.some(s => areSkillsEquivalent(s, 'Git')), 'Missing Git in requiredSkills');

    // Nice-to-have skills: TypeScript, Jest, AWS
    assert.ok(profile.preferredSkills.some(s => areSkillsEquivalent(s, 'TypeScript')), 'Missing TypeScript in preferredSkills');
    assert.ok(profile.preferredSkills.some(s => areSkillsEquivalent(s, 'Jest')), 'Missing Jest in preferredSkills');
    assert.ok(profile.preferredSkills.some(s => areSkillsEquivalent(s, 'AWS')), 'Missing AWS in preferredSkills');

    // Responsibilities
    assert.ok(profile.responsibilities.length >= 2, `Expected >= 2 responsibilities, got ${profile.responsibilities.length}`);
    const joinedResp = profile.responsibilities.join(' ').toLowerCase();
    assert.ok(joinedResp.includes('reusable frontend components') || joinedResp.includes('components'), 'Missing components responsibility');
    assert.ok(joinedResp.includes('backend apis') || joinedResp.includes('api'), 'Missing api responsibility');

    // Education is optional/empty
    assert.strictEqual(profile.preferredEducation.length, 0);

    // Extraction status must be complete
    assert.strictEqual(profile.status, 'complete', `Expected 'complete', got '${profile.status}'`);
  });

  /* =========================================================================
   * 2. MULTI-ROLE TEST FIXTURES
   * ========================================================================= */
  console.log('\nMulti-Role Extraction');

  await test('Node.js Developer JD extracts backend skills, ranges, and complete status', () => {
    const jdText = `Job Title: Node.js Developer
About Us: Leading fintech organization.
Responsibilities:
- Build resilient microservices and RESTful APIs
- Maintain database schemas and query performance
Requirements:
- 4-6 years of experience in backend development
- Strong proficiency in Node.js, Express, and PostgreSQL
- Experience with Redis and Docker
Preferred Qualifications:
- Familiarity with Kubernetes and AWS
- Bachelor's degree in Computer Science`;

    const title = extractJobTitle(jdText);
    assert.strictEqual(title, 'Node.js Developer');

    const profile = extractJobProfile({ title, description: jdText });
    assert.strictEqual(profile.minimumExperience, 4, `Expected lower bound 4, got ${profile.minimumExperience}`);
    assert.ok(profile.requiredSkills.includes('Node.js'));
    assert.ok(profile.requiredSkills.includes('PostgreSQL'));
    assert.ok(profile.preferredSkills.includes('Kubernetes') || profile.preferredSkills.includes('AWS'));
    assert.strictEqual(profile.status, 'complete');
  });

  await test('Java Developer JD extracts Spring Boot, Kafka, and degrees', () => {
    const jdText = `Position: Senior Java Developer
Key Requirements:
- Minimum 5 years of hands-on software development experience
- Core Java, Spring Boot, Microservices, and Hibernate
- MySQL or PostgreSQL database design
Good to Have:
- Apache Kafka and Docker
Education:
- B.Tech or MCA degree in Computer Science or equivalent`;

    const title = extractJobTitle(jdText);
    assert.strictEqual(title, 'Senior Java Developer');

    const profile = extractJobProfile({ title, description: jdText });
    assert.strictEqual(profile.minimumExperience, 5);
    assert.ok(profile.requiredSkills.includes('Java'));
    assert.ok(profile.requiredSkills.includes('Spring Boot'));
    assert.ok(profile.preferredSkills.includes('Kafka'));
    assert.ok(profile.preferredEducation.length > 0);
    assert.strictEqual(profile.status, 'complete');
  });

  await test('Data Analyst JD extracts SQL, Python, Tableau, and lower range bound', () => {
    const jdText = `# Data Analyst
We are looking for a Data Analyst to join our analytics team.
Qualifications & Skills:
- 2 to 4 years of experience analyzing business data
- Advanced SQL and Python programming
- Experience with Tableau or Power BI
Preferred:
- Knowledge of Machine Learning fundamentals`;

    const title = extractJobTitle(jdText);
    assert.strictEqual(title, 'Data Analyst');

    const profile = extractJobProfile({ title, description: jdText });
    assert.strictEqual(profile.minimumExperience, 2, `Expected lower bound 2, got ${profile.minimumExperience}`);
    assert.ok(profile.requiredSkills.includes('SQL'));
    assert.ok(profile.requiredSkills.includes('Python'));
    assert.strictEqual(profile.status, 'complete');
  });

  await test('DevOps Engineer JD extracts infrastructure skills and tools', () => {
    const jdText = `Role: DevOps Engineer
What You Will Do:
- Design and automate cloud infrastructure using Terraform
- Manage Kubernetes clusters and CI/CD pipelines
Technical Requirements:
- At least 3 years experience in DevOps or SRE roles
- Deep understanding of AWS, Docker, Kubernetes, Linux, and Git
Plus:
- Python scripting knowledge`;

    const title = extractJobTitle(jdText);
    assert.strictEqual(title, 'DevOps Engineer');

    const profile = extractJobProfile({ title, description: jdText });
    assert.strictEqual(profile.minimumExperience, 3);
    assert.ok(profile.requiredSkills.includes('Kubernetes'));
    assert.ok(profile.requiredSkills.includes('Docker'));
    assert.ok(profile.requiredSkills.includes('AWS'));
    assert.ok(profile.preferredSkills.includes('Python'));
    assert.strictEqual(profile.status, 'complete');
  });

  await test('QA Engineer JD extracts automation testing tools', () => {
    const jdText = `Hiring for QA Automation Engineer
Requirements:
- 3+ years experience in automated software testing
- Strong proficiency in JavaScript, Jest, Cypress, and Selenium
- Experience with REST API testing and Git
Nice to have:
- CI/CD pipeline integration experience`;

    const title = extractJobTitle(jdText);
    assert.ok(title.includes('QA') || title.includes('Engineer'), `Got title: ${title}`);

    const profile = extractJobProfile({ title, description: jdText });
    assert.strictEqual(profile.minimumExperience, 3);
    assert.ok(profile.requiredSkills.includes('Jest'));
    assert.ok(profile.requiredSkills.includes('Cypress'));
    assert.strictEqual(profile.status, 'complete');
  });

  /* =========================================================================
   * 3. SPECIAL TEST CASES (1 to 6)
   * ========================================================================= */
  console.log('\nEdge Cases & Test Cases 1-6');

  // Test Case 1: Well structured JD
  await test('Test Case 1: Well structured JD results in complete status', () => {
    const jdText = `Job Title: Senior Frontend Engineer
Overview: Build amazing experiences.
Responsibilities:
- Build reusable UI components with React
Requirements:
- 5+ years frontend experience
- React, TypeScript, HTML, CSS, Redux
Nice to have:
- Next.js, GraphQL
Education:
- Bachelor's degree in Computer Science`;

    const title = extractJobTitle(jdText);
    const profile = extractJobProfile({ title, description: jdText });
    assert.strictEqual(profile.status, 'complete');
    assert.strictEqual(profile.minimumExperience, 5);
  });

  // Test Case 2: No education
  await test('Test Case 2: JD with NO education requirement is NOT marked failed', () => {
    const jdText = `Role: React Developer
Requirements:
- 3+ years experience
- React, JavaScript, Git
Preferred:
- AWS`;

    const profile = extractJobProfile({ title: 'React Developer', description: jdText });
    assert.notStrictEqual(profile.status, 'failed');
    assert.strictEqual(profile.status, 'complete');
    assert.strictEqual(profile.preferredEducation.length, 0);
  });

  // Test Case 3: No preferred skills
  await test('Test Case 3: JD with NO preferred skills section is NOT marked failed', () => {
    const jdText = `Job Title: Python Developer
Responsibilities:
- Build backend APIs
Requirements:
- 2+ years experience with Python, Django, PostgreSQL`;

    const profile = extractJobProfile({ title: 'Python Developer', description: jdText });
    assert.notStrictEqual(profile.status, 'failed');
    assert.strictEqual(profile.status, 'complete');
    assert.ok(profile.requiredSkills.includes('Python'));
  });

  // Test Case 4: Plain paragraph JD (no headings)
  await test('Test Case 4: Plain paragraph JD without headings extracts useful information', () => {
    const jdText = `Frontend Developer
We are looking for a Frontend Developer with at least 3 years of web development experience.
The candidate must be proficient in React, JavaScript and CSS.
Experience with Next.js is a plus.`;

    const title = extractJobTitle(jdText);
    assert.strictEqual(title, 'Frontend Developer');
    const profile = extractJobProfile({ title, description: jdText });
    assert.strictEqual(profile.minimumExperience, 3);
    assert.ok(profile.requiredSkills.includes('React'));
    assert.ok(profile.preferredSkills.includes('Next.js'));
    assert.notStrictEqual(profile.status, 'failed');
  });

  // Test Case 5 & 6: Empty & Corrupt Input
  await test('Test Case 5: Corrupt / virtually empty text returns failed status', () => {
    const status = evaluateExtractionStatus({
      text: 'hello',
      title: '',
      requiredSkills: [],
      preferredSkills: [],
      minimumExperience: 0,
      preferredEducation: [],
      responsibilities: []
    });
    assert.strictEqual(status.status, 'failed');
  });

  await test('Test Case 6: Empty text extraction throws or returns failed', async () => {
    let threw = false;
    try {
      await extractJDText({ buffer: Buffer.from(''), originalname: 'empty.txt', mimetype: 'text/plain' });
    } catch {
      threw = true;
    }
    assert.ok(threw, 'Should throw for empty text');
  });

  /* =========================================================================
   * 4. EXPERIENCE EXTRACTION VARIANTS
   * ========================================================================= */
  console.log('\nExperience Extraction Variants');

  await test('Range extraction handles "3-5 years" -> 3', () => {
    assert.strictEqual(extractMinimumExperience('Candidate must have 3-5 years of experience in React.'), 3);
  });

  await test('Range extraction handles "2 to 4 years" -> 2', () => {
    assert.strictEqual(extractMinimumExperience('Looking for 2 to 4 years experience with Node.js.'), 2);
  });

  await test('Prefix extraction handles "minimum 3 years" -> 3', () => {
    assert.strictEqual(extractMinimumExperience('Minimum 3 years of hands-on software development.'), 3);
  });

  await test('Prefix extraction handles "at least 3 years" -> 3', () => {
    assert.strictEqual(extractMinimumExperience('At least 3 years experience with cloud engineering.'), 3);
  });

  await test('Single duration handles "3+ years" -> 3', () => {
    assert.strictEqual(extractMinimumExperience('3+ years of experience with PostgreSQL.'), 3);
  });

  await test('No experience mentioned returns 0 without inventing experience', () => {
    assert.strictEqual(extractMinimumExperience('Looking for a talented React Developer to join our team.'), 0);
  });

  /* =========================================================================
   * 5. FILE TYPE & LEGACY WORD HANDLING
   * ========================================================================= */
  console.log('\nFile Type & Format Handling');

  await test('Plain text file buffer is extracted cleanly', async () => {
    const buffer = Buffer.from('React Developer\n3+ years experience with React and TypeScript.');
    const text = await extractJDText({ buffer, originalname: 'jd.txt', mimetype: 'text/plain' });
    assert.ok(text.includes('React Developer'));
  });

  await test('Legacy .doc file is cleanly refused with helpful error message', async () => {
    const buffer = Buffer.from('fake doc content');
    let errorMsg = '';
    try {
      await extractJDText({ buffer, originalname: 'spec.doc', mimetype: 'application/msword' });
    } catch (err) {
      errorMsg = err.message;
    }
    assert.ok(errorMsg.includes('Unsupported legacy Word format (.doc)'), `Expected legacy message, got: ${errorMsg}`);
  });

  console.log('\n----------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runJdExtractionTests();
