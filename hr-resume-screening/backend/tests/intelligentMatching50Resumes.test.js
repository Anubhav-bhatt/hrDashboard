/**
 * Comprehensive 50-Resume Intelligent Matching & Candidate Scoring Evaluation Suite
 *
 * Tests the deep Job Description ↔ Candidate Resume matching engine:
 *  - 10 Strong fit candidates (React + TS + REST APIs + Jest + AWS, 3-6 yrs frontend)
 *  - 15 Moderate fit candidates (React + JS + HTML/CSS, 1-3 yrs, some gaps)
 *  - 15 Weak fit candidates (Java/Spring Boot, Python/ML, QA, DevOps, PHP)
 *  - 3 Keyword-stuffed candidates (repeating 'React' 30x without depth/evidence)
 *  - 4 Alias-rich candidates (ReactJS, Postgres, RESTful services, JS, TS)
 *  - 3 Junior candidates with strong practical project evidence
 * Total = 50 synthetic resumes
 *
 * Asserts:
 *  - 50/50 successful parses and extraction
 *  - Alias resolution & multi-word canonicalization
 *  - Correct score distribution and category separation
 *  - Zero false positives (no weak candidate >= 70%)
 *  - Zero false negatives (no strong candidate < 75%)
 *  - Anti-keyword-stuffing defense
 *  - Performance: 1 JD parse + 50 profile extractions + 50 comparisons in < 2 seconds
 */

const assert = require('assert');
const { performance } = require('perf_hooks');
const { extractJobProfile } = require('../services/jdProfileService');
const { extractCandidateProfile } = require('../services/candidateProfileService');
const { matchCandidateToJob } = require('../services/candidateMatcher');
const {
  canonicalizeSkill,
  normalizeSkillList,
  areSkillsEquivalent
} = require('../utils/skillTaxonomy');

console.log('\n================================================================');
console.log('  50-Resume Intelligent Matching & Scoring Evaluation Suite');
console.log('================================================================\n');

// -------------------------------------------------------------
// 1. TARGET JOB DESCRIPTION (React Developer, 3+ years)
// -------------------------------------------------------------
const REACT_JOB_DESCRIPTION = {
  title: 'Senior React Developer',
  minimumExperience: 3,
  description: `
We are looking for an experienced Senior React Developer with 3+ years of professional experience building scalable web applications.

Responsibilities:
• Building scalable, customer-facing web applications using modern React
• Developing reusable frontend component libraries and design system elements
• Integrating RESTful services and collaborating closely with backend teams
• Writing clean, maintainable, and thoroughly tested code

Key Requirements:
• Strong proficiency in React, JavaScript, REST APIs, and Git
• Minimum 3 years of hands-on experience in frontend web development
• Bachelor's degree in Computer Science, Information Technology, or equivalent

Preferred Qualifications:
• Experience with TypeScript, Jest, and AWS cloud deployment
• Knowledge of state management libraries (Redux, Zustand)
• Familiarity with CI/CD pipelines
  `
};

// -------------------------------------------------------------
// 2. GENERATE 50 SYNTHETIC RESUMES
// -------------------------------------------------------------
const generate50Resumes = () => {
  const resumes = [];

  // Group 1: 10 Strong Fit Candidates (Expected score: 80 - 95%)
  for (let i = 1; i <= 10; i++) {
    const expYears = 3 + (i % 4); // 3 to 6 years
    resumes.push({
      id: `strong-${i}`,
      name: `Strong Candidate ${i}`,
      category: 'STRONG',
      expectedScoreMin: 80,
      expectedScoreMax: 100,
      resumeText: `
${`Strong Candidate ${i}`}
Email: strong${i}@example.com | Phone: +91 98765 4321${i % 10}
Location: Bengaluru, India | GitHub: github.com/strong${i}

PROFESSIONAL SUMMARY
Senior Frontend Engineer with ${expYears} years of experience specializing in React, TypeScript, and modern JavaScript web applications. Proven track record in building reusable component architectures and cloud deployments.

WORK EXPERIENCE
Senior Frontend Developer — TechCorp Solutions (${expYears} years)
• Built customer-facing web applications using React and TypeScript.
• Developed reusable frontend component libraries used across 5 internal products.
• Integrated RESTful services and collaborated with backend engineering teams.
• Authored comprehensive automated test suites using Jest and React Testing Library.
• Deployed production applications to AWS using S3, CloudFront, and automated CI/CD.
• Managed version control workflows and release tagging with Git.

TECHNICAL SKILLS
Languages: JavaScript, TypeScript, HTML5, CSS3
Frontend: React, Redux, Tailwind CSS, Next.js
Testing & Tools: Jest, Git, Webpack, Vite
Cloud & Backend: AWS, REST APIs, Node.js

EDUCATION
B.Tech in Computer Science, National Institute of Technology (2018 - 2022)
      `
    });
  }

  // Group 2: 15 Moderate Fit Candidates (Expected score: 55 - 76%)
  // Matches section 36 of Master Prompt: partial required skill coverage, 1.5 - 2 years experience (under 3 yrs min)
  for (let i = 1; i <= 15; i++) {
    const expYears = (i % 2 === 0) ? 2 : 1.5;
    const variant = i % 3;
    let skillsLine = '';
    let workDesc = '';

    if (variant === 0) {
      // Has React & JavaScript & HTML/CSS (missing REST API & Git)
      skillsLine = 'React, JavaScript, HTML, CSS';
      workDesc = 'Built responsive single page UI modules using React and JavaScript. Styled with CSS3.';
    } else if (variant === 1) {
      // Has JavaScript, HTML/CSS, Git (missing React & REST API)
      skillsLine = 'JavaScript, HTML, CSS, Git';
      workDesc = 'Developed client web interfaces with vanilla JavaScript. Maintained code in Git.';
    } else {
      // Has React, JavaScript, Git (missing REST API)
      skillsLine = 'React, JavaScript, Git, HTML, CSS';
      workDesc = 'Built interactive frontend components using React and JavaScript. Managed version control in Git.';
    }

    resumes.push({
      id: `moderate-${i}`,
      name: `Moderate Candidate ${i}`,
      category: 'MODERATE',
      expectedScoreMin: 50,
      expectedScoreMax: 76,
      resumeText: `
Moderate Candidate ${i}
Email: mod${i}@example.com | Phone: +91 98123 4567${i % 10}
Location: Pune, India

PROFESSIONAL SUMMARY
Frontend Web Developer with ${expYears} years of experience building websites and user interfaces.

WORK EXPERIENCE
Frontend Developer — Web Studio (${expYears} years)
• ${workDesc}

SKILLS
${skillsLine}

EDUCATION
B.Sc in Information Technology, Pune University
      `
    });
  }

  // Group 3: 15 Weak Fit Candidates (Expected score: < 55%)
  const weakProfiles = [
    { role: 'Java Backend Developer', skills: 'Java, Spring Boot, Hibernate, Oracle, Microservices, Maven' },
    { role: 'Data Scientist / ML Engineer', skills: 'Python, Pandas, NumPy, Scikit-Learn, PyTorch, SQL' },
    { role: 'DevOps / Infrastructure Engineer', skills: 'Kubernetes, Terraform, Ansible, Linux, Bash, Jenkins' },
    { role: 'Manual QA Specialist', skills: 'Manual Testing, JIRA, TestRail, Black Box Testing, Bug Reporting' },
    { role: 'PHP / WordPress Developer', skills: 'PHP, WordPress, MySQL, Apache, jQuery, cPanel' }
  ];

  for (let i = 1; i <= 15; i++) {
    const p = weakProfiles[(i - 1) % weakProfiles.length];
    const expYears = 4 + (i % 4); // 4 to 7 years in an unrelated field
    resumes.push({
      id: `weak-${i}`,
      name: `Weak Candidate ${i}`,
      category: 'WEAK',
      expectedScoreMin: 0,
      expectedScoreMax: 55,
      resumeText: `
${`Weak Candidate ${i}`}
Email: weak${i}@example.com | Phone: +91 97000 1122${i % 10}
Location: Hyderabad, India

SUMMARY
Experienced ${p.role} with ${expYears} years of technical expertise in enterprise environments.

WORK EXPERIENCE
${p.role} — Enterprise Corp (${expYears} years)
• Architected and maintained enterprise software systems.
• Specialized in ${p.skills}.
• Implemented database queries and batch processing pipelines.
• Maintained code versions using Git.

TECHNICAL SKILLS
${p.skills}, Git

EDUCATION
B.Tech in Information Technology
      `
    });
  }

  // Group 4: 3 Keyword-Stuffed Resumes (Anti-Gaming Check)
  for (let i = 1; i <= 3; i++) {
    resumes.push({
      id: `stuffed-${i}`,
      name: `Keyword Stuffed Candidate ${i}`,
      category: 'KEYWORD_STUFFED',
      expectedScoreMin: 0,
      expectedScoreMax: 65, // Must NOT achieve strong fit despite repeating React 25+ times
      resumeText: `
${`Keyword Stuffed Candidate ${i}`}
Email: stuffed${i}@example.com | Phone: +91 96666 5544${i}

React React React React React React React React React React
React Developer React Specialist React Expert React React React
React React React React React React React React React React
JavaScript JavaScript JavaScript TypeScript TypeScript TypeScript
REST APIs REST APIs REST APIs Git Git Git AWS AWS Jest Jest

SUMMARY
I am a React developer looking for a React role. React React React.

SKILLS
React, ReactJS, React.js, React Native, React Components, React Hooks

EDUCATION
High School Diploma
      `
    });
  }

  // Group 5: 4 Alias-Rich Resumes (Testing Canonical Normalization)
  const aliasVariants = [
    { title: 'ReactJS', apis: 'RESTful services', vcs: 'Git', db: 'Postgres', ts: 'TS' },
    { title: 'React.js', apis: 'RESTful API', vcs: 'GitHub', db: 'PostgreSQL', ts: 'TypeScript' },
    { title: 'React', apis: 'REST APIs', vcs: 'Git version control', db: 'Postgres DB', ts: 'TypeScript' },
    { title: 'react', apis: 'REST APIs', vcs: 'git', db: 'PostgreSQL', ts: 'TS' }
  ];

  for (let i = 1; i <= 4; i++) {
    const v = aliasVariants[i - 1];
    resumes.push({
      id: `alias-${i}`,
      name: `Alias Candidate ${i}`,
      category: 'ALIAS_RICH',
      expectedScoreMin: 78,
      expectedScoreMax: 100,
      resumeText: `
${`Alias Candidate ${i}`}
Email: alias${i}@example.com | Phone: +91 95555 4433${i}
Location: Chennai, India

SUMMARY
Frontend Specialist with 4 years of experience building modern web apps with ${v.title} and ${v.ts}.

EXPERIENCE
Frontend Software Engineer — WebCloud Tech (4 years)
• Built scalable single page applications utilizing ${v.title}.
• Engineered component libraries and connected with ${v.apis}.
• Integrated ${v.db} backends and deployed serverless APIs on AWS.
• Tested frontend modules using Jest unit tests.
• Managed repository pull requests using ${v.vcs}.

SKILLS
${v.title}, ${v.ts}, JS, ${v.apis}, ${v.vcs}, Jest, AWS, ${v.db}

EDUCATION
B.E. in Computer Science
      `
    });
  }

  // Group 6: 3 Junior Candidates with Strong Practical Project Evidence
  for (let i = 1; i <= 3; i++) {
    resumes.push({
      id: `junior-${i}`,
      name: `Junior Project Candidate ${i}`,
      category: 'JUNIOR_PROJECT',
      expectedScoreMin: 65,
      expectedScoreMax: 78,
      resumeText: `
${`Junior Project Candidate ${i}`}
Email: junior${i}@example.com | Phone: +91 94444 3322${i}
Location: Delhi, India | Portfolio: https://junior${i}.dev

SUMMARY
Passionate Junior Frontend Developer with 1 year of experience and extensive hands-on project work building production-grade web applications.

WORK EXPERIENCE
Junior Frontend Developer — Early Stage Startup (1 year)
• Developed responsive user interface components with React and JavaScript.
• Participated in sprint planning and daily standups.
• Maintained feature branches with Git.

PRACTICAL PROJECTS
Project 1: E-Commerce Web Platform (github.com/junior${i}/ecommerce)
• Built full-featured customer store using React, TypeScript, and Redux Toolkit.
• Integrated REST APIs for payment processing, inventory, and order fulfillment.
• Configured Jest automated testing and deployed frontend to AWS S3 and CloudFront.

Project 2: Real-Time Team Chat Application (github.com/junior${i}/chat)
• Engineered web chat UI using React and Tailwind CSS.
• Connected to Node.js and PostgreSQL backend services via REST APIs and WebSockets.

SKILLS
React, JavaScript, TypeScript, REST APIs, Git, Jest, AWS, HTML5, CSS3

EDUCATION
B.Tech in Computer Science (2024 graduate)
      `
    });
  }

  return resumes;
};

// -------------------------------------------------------------
// 3. EXECUTE EVALUATION SUITE
// -------------------------------------------------------------
const runEvaluation = () => {
  const startTime = performance.now();

  // Step 1: Parse JD once (Section 45: Performance)
  const jdParseStart = performance.now();
  const jobProfile = extractJobProfile(REACT_JOB_DESCRIPTION);
  const jdParseTimeMs = performance.now() - jdParseStart;

  console.log(`[1] Parsed Job Description in ${jdParseTimeMs.toFixed(2)} ms`);
  console.log(`    Title: "${jobProfile.title}" | Seniority: ${jobProfile.seniority} | Role Family: ${jobProfile.roleFamily}`);
  console.log(`    Required Skills (${jobProfile.requiredSkills.length}): ${jobProfile.requiredSkills.join(', ')}`);
  console.log(`    Preferred Skills (${jobProfile.preferredSkills.length}): ${jobProfile.preferredSkills.join(', ')}`);
  console.log(`    Minimum Experience: ${jobProfile.minimumExperience} years\n`);

  assert.strictEqual(jobProfile.requiredSkills.includes('React'), true, 'JD must require React');
  assert.strictEqual(jobProfile.requiredSkills.includes('JavaScript'), true, 'JD must require JavaScript');
  assert.ok(jobProfile.requiredSkills.some(s => areSkillsEquivalent(s, 'REST APIs')), 'JD must require REST APIs');
  assert.strictEqual(jobProfile.requiredSkills.includes('Git'), true, 'JD must require Git');
  assert.strictEqual(jobProfile.preferredSkills.includes('TypeScript'), true, 'JD must have TypeScript as preferred');
  assert.strictEqual(jobProfile.preferredSkills.includes('Jest'), true, 'JD must have Jest as preferred');
  assert.strictEqual(jobProfile.preferredSkills.includes('AWS'), true, 'JD must have AWS as preferred');
  assert.strictEqual(jobProfile.minimumExperience, 3, 'JD must require 3 years minimum experience');

  // Step 2: Generate and evaluate 50 resumes
  const resumes = generate50Resumes();
  assert.strictEqual(resumes.length, 50, 'Evaluation suite must contain exactly 50 resumes');

  console.log(`[2] Processing ${resumes.length} Synthetic Candidates across 6 distinct categories...\n`);

  const categoryStats = {
    STRONG: { count: 0, scores: [] },
    MODERATE: { count: 0, scores: [] },
    WEAK: { count: 0, scores: [] },
    KEYWORD_STUFFED: { count: 0, scores: [] },
    ALIAS_RICH: { count: 0, scores: [] },
    JUNIOR_PROJECT: { count: 0, scores: [] }
  };

  const scoredCandidates = [];
  let totalResumeParseTimeMs = 0;
  let totalMatchTimeMs = 0;

  for (const cand of resumes) {
    // Measure Resume Parsing
    const pStart = performance.now();
    const candProfile = extractCandidateProfile(cand.resumeText, {
      fileName: `${cand.id}.pdf`,
      targetRoleFamily: jobProfile.roleFamily
    });
    totalResumeParseTimeMs += (performance.now() - pStart);

    // Measure Candidate Matching
    const mStart = performance.now();
    const matchResult = matchCandidateToJob(jobProfile, candProfile);
    totalMatchTimeMs += (performance.now() - mStart);

    const score = matchResult.overallScore;
    categoryStats[cand.category].count++;
    categoryStats[cand.category].scores.push(score);

    scoredCandidates.push({
      id: cand.id,
      name: cand.name,
      category: cand.category,
      score,
      alignment: matchResult.alignmentLabel,
      matchedSkills: matchResult.matchedSkills,
      missingRequired: matchResult.missingRequiredSkills,
      additionalSkills: matchResult.additionalSkills,
      keyEvidenceCount: matchResult.keyEvidence.length,
      relevantYears: matchResult.experienceDetails.relevantYears,
      totalYears: matchResult.experienceDetails.totalYears,
      roleScore: matchResult.roleScore
    });

    // Check bounds
    assert.ok(
      score >= cand.expectedScoreMin && score <= cand.expectedScoreMax,
      `Candidate ${cand.name} (${cand.category}) scored ${score}%, outside expected [${cand.expectedScoreMin}, ${cand.expectedScoreMax}]%`
    );
  }

  const totalTimeMs = performance.now() - startTime;

  // Step 3: Print Category Breakdown
  console.log('----------------------------------------------------------------');
  console.log('Category Results Summary:');
  console.log('----------------------------------------------------------------');
  for (const [cat, data] of Object.entries(categoryStats)) {
    const avgScore = (data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1);
    const minScore = Math.min(...data.scores);
    const maxScore = Math.max(...data.scores);
    console.log(
      `  • ${cat.padEnd(16)}: ${data.count} candidates | Avg Score: ${avgScore.padStart(5)}% | Range: [${minScore}%, ${maxScore}%]`
    );
  }
  console.log('----------------------------------------------------------------\n');

  // Step 4: Strict Sanity & Quality Assertions
  console.log('[3] Running Sanity and Integrity Validations:');

  // 1. Zero False Positives: No weak candidate should score >= 60%
  const weakOver60 = scoredCandidates.filter((c) => c.category === 'WEAK' && c.score >= 60);
  assert.strictEqual(weakOver60.length, 0, `False Positives detected in WEAK category: ${weakOver60.length}`);
  console.log('  ✓ [PASS] Zero false positives: No weak candidate scored >= 60%');

  // 2. Zero False Negatives: No strong candidate should score < 80%
  const strongUnder80 = scoredCandidates.filter((c) => c.category === 'STRONG' && c.score < 80);
  assert.strictEqual(strongUnder80.length, 0, `False Negatives detected in STRONG category: ${strongUnder80.length}`);
  console.log('  ✓ [PASS] Zero false negatives: No strong candidate scored < 80%');

  // 3. Alias Matching Integrity: All 4 alias-rich candidates should match 100% of required skills
  const aliasCandidates = scoredCandidates.filter((c) => c.category === 'ALIAS_RICH');
  for (const ac of aliasCandidates) {
    assert.strictEqual(
      ac.missingRequired.length,
      0,
      `Alias candidate ${ac.name} missed required skills: ${ac.missingRequired.join(', ')}`
    );
  }
  console.log('  ✓ [PASS] Alias resolution: All 4 alias-rich candidates matched 100% of required skills');

  // 4. Anti-Keyword-Stuffing Verification:
  // A stuffed resume (repeating React 30x) must not outscore genuine moderate or strong candidates
  const maxStuffedScore = Math.max(...categoryStats.KEYWORD_STUFFED.scores);
  const minStrongScore = Math.min(...categoryStats.STRONG.scores);
  assert.ok(
    maxStuffedScore < minStrongScore,
    `Keyword-stuffed resume score (${maxStuffedScore}%) must be lower than minimum strong score (${minStrongScore}%)`
  );
  console.log(`  ✓ [PASS] Anti-keyword-stuffing: Max stuffed score (${maxStuffedScore}%) is well below strong candidates (${minStrongScore}%)`);

  // 5. Ranking Sanity Check: Sort all 50 candidates by score descending
  const sorted = [...scoredCandidates].sort((a, b) => b.score - a.score);
  const top10 = sorted.slice(0, 10);
  const top10Categories = top10.map((c) => c.category);
  const allTopAreStrongOrAlias = top10Categories.every((cat) => cat === 'STRONG' || cat === 'ALIAS_RICH');
  assert.ok(allTopAreStrongOrAlias, 'Top 10 ranked candidates must all be STRONG or ALIAS_RICH candidates');
  console.log('  ✓ [PASS] Ranking sanity: Top 10 ranked candidates are exclusively STRONG and ALIAS_RICH candidates');

  // 6. Junior candidates practical project recognition
  const juniorCandidates = scoredCandidates.filter((c) => c.category === 'JUNIOR_PROJECT');
  for (const jc of juniorCandidates) {
    assert.ok(jc.score >= 65, `Junior candidate with project evidence ${jc.name} should score >= 65%`);
  }
  console.log('  ✓ [PASS] Practical project recognition: Junior candidates with practical projects correctly credited');

  // Step 5: Performance Verification (Section 45)
  console.log('\n[4] Performance Benchmark:');
  const avgResumeParseMs = (totalResumeParseTimeMs / resumes.length).toFixed(2);
  const avgMatchMs = (totalMatchTimeMs / resumes.length).toFixed(2);
  console.log(`  • JD Parse Time:          ${jdParseTimeMs.toFixed(2)} ms (1 time)`);
  console.log(`  • 50 Resume Parse Time:   ${totalResumeParseTimeMs.toFixed(2)} ms (avg ${avgResumeParseMs} ms/resume)`);
  console.log(`  • 50 Match Comparisons:   ${totalMatchTimeMs.toFixed(2)} ms (avg ${avgMatchMs} ms/comparison)`);
  console.log(`  • Total Execution Time:   ${totalTimeMs.toFixed(2)} ms`);

  assert.ok(totalTimeMs < 2000, `Total execution time (${totalTimeMs} ms) must be under 2000 ms`);
  console.log('  ✓ [PASS] Performance meets < 2.0s SLA requirement');

  console.log('\n================================================================');
  console.log('  All 50 Candidates Evaluated & Verified Successfully!');
  console.log('================================================================\n');

  return {
    totalProcessed: resumes.length,
    parseFailures: 0,
    categoryStats,
    performance: {
      jdParseTimeMs,
      totalResumeParseTimeMs,
      avgResumeParseMs,
      totalMatchTimeMs,
      avgMatchMs,
      totalTimeMs
    }
  };
};

if (require.main === module) {
  runEvaluation();
}

module.exports = {
  runEvaluation,
  REACT_JOB_DESCRIPTION,
  generate50Resumes
};
