/**
 * Comparison Agent unit and evidence validation tests.
 *
 * Tests:
 *   - Context & candidate bounds validation (2-5 unique candidates, jobId required)
 *   - Candidate/job association validation
 *   - Stored match score integrity (authoritative scores never modified)
 *   - Candidate selection ordering preservation
 *   - Criteria matrix generation (required/preferred skills, experience, scores)
 *   - Evidence-based trade-offs and best-by-dimension observations
 *   - Optional comparison focus parsing and fallback
 *   - Unscored candidate handling and data warnings
 *   - 100% deterministic repeatable evaluation
 */
const { runComparisonAgent } = require('../ai/modes/comparison.agent');
const { MockAIProvider } = require('../ai/providers/MockAIProvider');
const { resolveAiConfig } = require('../ai/config/aiConfig');

let passed = 0;
let failed = 0;

const assert = (condition, message) => {
  if (condition) {
    passed++;
    console.log(`  PASS  ${message}`);
  } else {
    failed++;
    console.error(`  FAIL  ${message}`);
  }
};

const runComparisonAgentTests = async () => {
  console.log('\n================================================================');
  console.log('  Comparison Agent — validation, score integrity, and trade-offs');
  console.log('================================================================\n');

  const provider = new MockAIProvider();
  const config = resolveAiConfig({
    AI_ENABLED: 'true',
    AI_PROVIDER: 'mock',
    AI_COMPARISON_ENABLED: 'true'
  });

  const mockJob = {
    jobId: 'job-101',
    title: 'Senior Fullstack Engineer',
    status: 'OPEN'
  };

  const mockRequirements = {
    requiredSkills: ['React', 'Node.js', 'PostgreSQL'],
    preferredSkills: ['AWS', 'TypeScript'],
    minimumExperience: 4,
    qualification: "Bachelor's Degree",
    location: 'Gurgaon, India'
  };

  const mockCandidates = {
    'cand-1': {
      candidateId: 'cand-1',
      jobId: 'job-101',
      name: 'Rahul Sharma',
      skills: ['React', 'Node.js', 'PostgreSQL', 'JavaScript'],
      experience: { statedYears: 5, computedYears: 5 },
      education: [{ degree: 'B.Tech' }],
      status: { hrStatus: 'SHORTLISTED', isShortlisted: true },
      score: { overallScore: 92, isScored: true, alignmentLabel: 'Very Strong' }
    },
    'cand-2': {
      candidateId: 'cand-2',
      jobId: 'job-101',
      name: 'Priya Patel',
      skills: ['React', 'Node.js', 'AWS', 'TypeScript'],
      experience: { statedYears: 4, computedYears: 4 },
      education: [{ degree: 'B.E.' }],
      status: { hrStatus: 'APPLIED', isShortlisted: false },
      score: { overallScore: 88, isScored: true, alignmentLabel: 'Strong' }
    },
    'cand-3': {
      candidateId: 'cand-3',
      jobId: 'job-101',
      name: 'Amit Kumar',
      skills: ['React', 'Vue.js', 'PostgreSQL'],
      experience: { statedYears: 3, computedYears: 3 },
      education: [{ degree: 'B.Sc' }],
      status: { hrStatus: 'APPLIED', isShortlisted: false },
      score: { overallScore: 74, isScored: true, alignmentLabel: 'Moderate' }
    },
    'cand-4': {
      candidateId: 'cand-4',
      jobId: 'job-101',
      name: 'Sneha Rao',
      skills: ['React', 'Node.js', 'PostgreSQL', 'AWS'],
      experience: { statedYears: 6, computedYears: 6 },
      education: [{ degree: 'M.Tech' }],
      status: { hrStatus: 'SHORTLISTED', isShortlisted: true },
      score: { overallScore: 95, isScored: true, alignmentLabel: 'Very Strong' }
    },
    'cand-5': {
      candidateId: 'cand-5',
      jobId: 'job-101',
      name: 'Vikram Singh',
      skills: ['Node.js', 'PostgreSQL'],
      experience: { statedYears: 2, computedYears: 2 },
      education: [],
      status: { hrStatus: 'APPLIED', isShortlisted: false },
      score: { overallScore: null, isScored: false, alignmentLabel: null }
    },
    'cand-6': {
      candidateId: 'cand-6',
      jobId: 'job-101',
      name: 'Ananya Roy',
      skills: ['React', 'TypeScript'],
      experience: { statedYears: 3, computedYears: 3 },
      education: [],
      status: { hrStatus: 'APPLIED', isShortlisted: false },
      score: { overallScore: 68, isScored: true }
    },
    'cand-mismatch': {
      candidateId: 'cand-mismatch',
      jobId: 'job-999',
      name: 'Mismatch User',
      skills: ['Java'],
      experience: { statedYears: 1 },
      score: { overallScore: 50, isScored: true }
    }
  };

  const createMockToolRunner = (overrides = {}) => {
    return async (toolName, input) => {
      if (overrides[toolName]) return overrides[toolName](input);

      if (toolName === 'getJob') {
        if (input.jobId === 'job-101') {
          return { success: true, data: { job: mockJob } };
        }
        return { success: false, error: { message: 'Job not found' } };
      }

      if (toolName === 'getJobRequirements') {
        return { success: true, data: { requirements: mockRequirements } };
      }

      if (toolName === 'getCandidate') {
        const c = mockCandidates[input.candidateId];
        if (c) return { success: true, data: { candidate: c } };
        return { success: false, error: { message: 'Candidate not found' } };
      }

      if (toolName === 'getCandidateScore') {
        const c = mockCandidates[input.candidateId];
        if (c) {
          return {
            success: true,
            data: {
              overallScore: c.score.overallScore,
              isScored: c.score.isScored,
              alignmentLabel: c.score.alignmentLabel
            }
          };
        }
        return { success: false, error: { message: 'Score not found' } };
      }

      if (toolName === 'getScoringBreakdown') {
        const c = mockCandidates[input.candidateId];
        return {
          success: true,
          data: {
            breakdown: {},
            skills: { matchedSkills: c?.skills || [] },
            strengths: [],
            gaps: []
          }
        };
      }

      return { success: false, error: { message: `Unknown tool ${toolName}` } };
    };
  };

  // Section 1: Context & Bounds Validation
  console.log('Context & Bounds Validation');
  try {
    await runComparisonAgent({
      message: 'Compare',
      context: { candidateIds: ['cand-1', 'cand-2'] },
      provider,
      config,
      toolRunner: createMockToolRunner()
    });
    assert(false, 'Should refuse execution without jobId');
  } catch (err) {
    assert(err.code === 'COMPARISON_JOB_REQUIRED', 'Refuses execution when jobId is missing');
  }

  try {
    await runComparisonAgent({
      message: 'Compare',
      context: { jobId: 'job-101', candidateIds: [] },
      provider,
      config,
      toolRunner: createMockToolRunner()
    });
    assert(false, 'Should refuse execution without candidates');
  } catch (err) {
    assert(err.code === 'COMPARISON_CANDIDATES_REQUIRED', 'Refuses execution when candidateIds is empty');
  }

  try {
    await runComparisonAgent({
      message: 'Compare',
      context: { jobId: 'job-101', candidateIds: ['cand-1'] },
      provider,
      config,
      toolRunner: createMockToolRunner()
    });
    assert(false, 'Should refuse execution with < 2 candidates');
  } catch (err) {
    assert(err.code === 'COMPARISON_TOO_FEW_CANDIDATES', 'Refuses execution when candidateIds < 2');
  }

  try {
    await runComparisonAgent({
      message: 'Compare',
      context: {
        jobId: 'job-101',
        candidateIds: ['cand-1', 'cand-2', 'cand-3', 'cand-4', 'cand-5', 'cand-6']
      },
      provider,
      config,
      toolRunner: createMockToolRunner()
    });
    assert(false, 'Should refuse execution with > 5 candidates');
  } catch (err) {
    assert(err.code === 'COMPARISON_TOO_MANY_CANDIDATES', 'Refuses execution when candidateIds > 5');
  }

  try {
    await runComparisonAgent({
      message: 'Compare',
      context: { jobId: 'job-101', candidateIds: ['cand-1', 'cand-1'] },
      provider,
      config,
      toolRunner: createMockToolRunner()
    });
    assert(false, 'Should refuse duplicate candidate IDs');
  } catch (err) {
    assert(err.code === 'COMPARISON_DUPLICATE_CANDIDATE', 'Refuses duplicate candidate IDs');
  }

  try {
    await runComparisonAgent({
      message: 'Compare',
      context: { jobId: 'job-101', candidateIds: ['cand-1', 'cand-mismatch'] },
      provider,
      config,
      toolRunner: createMockToolRunner()
    });
    assert(false, 'Should refuse candidate from different job');
  } catch (err) {
    assert(err.code === 'COMPARISON_CANDIDATE_MISMATCH', 'Refuses candidate from mismatched job');
  }

  // Section 2: Score Integrity & Ordering
  console.log('\nScore Integrity & Ordering');
  const compareRes = await runComparisonAgent({
    message: 'Compare top candidates',
    context: { jobId: 'job-101', candidateIds: ['cand-1', 'cand-2', 'cand-3'] },
    provider,
    config,
    toolRunner: createMockToolRunner()
  });

  const structured = compareRes.structuredData;
  assert(structured.candidateCount === 3, 'Evaluates exact number of requested candidates (3)');
  assert(structured.candidates[0].candidateId === 'cand-1', 'Preserves candidate selection order (#1 cand-1)');
  assert(structured.candidates[1].candidateId === 'cand-2', 'Preserves candidate selection order (#2 cand-2)');
  assert(structured.candidates[2].candidateId === 'cand-3', 'Preserves candidate selection order (#3 cand-3)');
  assert(structured.candidates[0].matchScore === 92, 'Preserves exact stored match score for candidate 1 (92%)');
  assert(structured.candidates[1].matchScore === 88, 'Preserves exact stored match score for candidate 2 (88%)');
  assert(structured.candidates[2].matchScore === 74, 'Preserves exact stored match score for candidate 3 (74%)');

  // Section 3: Criteria Matrix & Trade-offs
  console.log('\nCriteria Matrix, Trade-offs & Best by Dimension');
  assert(Array.isArray(structured.criteria) && structured.criteria.length >= 4, 'Constructs structured criteria matrix');

  const reactCrit = structured.criteria.find((c) => c.criterion === 'React');
  assert(reactCrit && reactCrit.values[0].status === 'MATCH', 'Correctly matches required React skill for candidate 1');

  const pgCrit = structured.criteria.find((c) => c.criterion === 'PostgreSQL');
  assert(pgCrit && pgCrit.values[1].status === 'GAP', 'Identifies missing mandatory PostgreSQL for Priya (cand-2)');
  assert(structured.candidates[1].mandatoryGaps.includes('PostgreSQL'), 'Populates mandatoryGaps array for Priya');

  assert(Array.isArray(structured.tradeoffs) && structured.tradeoffs.length > 0, 'Generates factual trade-off statements');
  assert(Array.isArray(structured.bestByDimension) && structured.bestByDimension.length > 0, 'Produces best-by-dimension observations');

  const highestScoreObs = structured.bestByDimension.find((b) => b.dimension === 'Highest Match Score');
  assert(highestScoreObs && highestScoreObs.candidateId === 'cand-1', 'Identifies Rahul Sharma for Highest Match Score (92%)');

  // Section 4: Focus & Data Warnings
  console.log('\nFocus & Data Warnings');
  const focusRes = await runComparisonAgent({
    message: 'Focus on AWS and TypeScript',
    context: { jobId: 'job-101', candidateIds: ['cand-1', 'cand-2'] },
    provider,
    config,
    toolRunner: createMockToolRunner()
  });
  assert(focusRes.structuredData.comparisonFocusApplied === true, 'Successfully applies supported focus instruction');
  assert(focusRes.structuredData.candidates[1].priorityMatch === true, 'Matches Priya for AWS and TypeScript focus');

  const unscoredRes = await runComparisonAgent({
    message: 'Compare',
    context: { jobId: 'job-101', candidateIds: ['cand-1', 'cand-5'] },
    provider,
    config,
    toolRunner: createMockToolRunner()
  });
  assert(unscoredRes.structuredData.candidates[1].isScored === false, 'Handles unscored candidate (cand-5)');
  assert(unscoredRes.structuredData.candidates[1].fitLevel === 'INSUFFICIENT_DATA', 'Assigns INSUFFICIENT_DATA fit level to unscored candidate');
  assert(unscoredRes.structuredData.candidates[1].dataWarnings.length > 0, 'Attaches data warnings for unscored candidate');

  // Section 5: Determinism
  console.log('\nDeterministic Repeatability');
  const run1 = await runComparisonAgent({
    message: 'Focus on PostgreSQL',
    context: { jobId: 'job-101', candidateIds: ['cand-1', 'cand-2', 'cand-3'] },
    provider,
    config,
    toolRunner: createMockToolRunner()
  });
  const run2 = await runComparisonAgent({
    message: 'Focus on PostgreSQL',
    context: { jobId: 'job-101', candidateIds: ['cand-1', 'cand-2', 'cand-3'] },
    provider,
    config,
    toolRunner: createMockToolRunner()
  });
  assert(JSON.stringify(run1.structuredData) === JSON.stringify(run2.structuredData), 'Same input produces 100% identical comparison results across repeated runs');

  console.log(`\n----------------------------------------------------------------`);
  console.log(`  Comparison Agent: ${passed} passed, ${failed} failed`);
  console.log(`----------------------------------------------------------------\n`);

  if (failed > 0) process.exit(1);
};

if (require.main === module) {
  runComparisonAgentTests().catch((err) => {
    console.error('Unhandled test error:', err);
    process.exit(1);
  });
}

module.exports = { runComparisonAgentTests };
