/**
 * Evaluation Runner for AI Assistant & Specialist Orchestrator.
 *
 * Runs structured evaluation cases across:
 *   - Intent Accuracy
 *   - Context Resolution & Fallback Priority
 *   - Clarification Correctness
 *   - Safety Refusals (Write protection & Protected trait safety)
 *   - Feature-Flag Compliance
 *   - Closed Job Protection
 */

const { EVALUATION_CASES } = require('./fixtures/assistantEvaluations');
const { runAssistantAgent } = require('../ai/modes/assistant.agent');
const { MockAIProvider } = require('../ai/providers/MockAIProvider');

const provider = new MockAIProvider();

const defaultConfig = {
  enabled: true,
  provider: 'mock',
  modes: {
    assistant: true,
    screening: true,
    ranking: true,
    comparison: true,
    insights: true
  }
};

const fixtureJobOpen = {
  jobId: 'job-101',
  title: 'Senior React Developer',
  status: 'OPEN',
  requirements: {
    requiredSkills: ['React', 'TypeScript', 'Redux'],
    preferredSkills: ['Next.js', 'Tailwind CSS', 'AWS'],
    minimumExperience: 4,
    preferredLocations: ['Bengaluru']
  }
};

const fixtureJobClosed = {
  jobId: 'job-102',
  title: 'Backend Lead (Closed)',
  status: 'CLOSED',
  isClosed: true,
  requirements: {
    requiredSkills: ['Node.js', 'PostgreSQL'],
    preferredSkills: ['Redis', 'Docker'],
    minimumExperience: 5
  }
};

const fixtureCandidates = [
  {
    candidateId: 'cand-1',
    name: 'Rahul Sharma',
    score: { isScored: true, overall: 92, overallScore: 92, fitLevel: 'STRONG_MATCH' }
  },
  {
    candidateId: 'cand-2',
    name: 'Rahul Verma',
    score: { isScored: true, overall: 84, overallScore: 84, fitLevel: 'GOOD_MATCH' }
  },
  {
    candidateId: 'cand-3',
    name: 'Priya Patel',
    score: { isScored: true, overall: 88, overallScore: 88, fitLevel: 'STRONG_MATCH' }
  }
];

const createMockToolRunner = () => {
  return async (toolName, input) => {
    if (toolName === 'getJob') {
      if (input.jobId === 'job-101') return { success: true, data: { job: fixtureJobOpen } };
      if (input.jobId === 'job-102') return { success: true, data: { job: fixtureJobClosed } };
      return { success: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } };
    }
    if (toolName === 'getJobRequirements') {
      const j = input.jobId === 'job-102' ? fixtureJobClosed : fixtureJobOpen;
      return { success: true, data: { requirements: j.requirements } };
    }
    if (toolName === 'getCandidate') {
      const found = fixtureCandidates.find((c) => c.candidateId === input.candidateId);
      if (found) return { success: true, data: { candidate: { ...found, jobId: 'job-101' } } };
      return { success: false, error: { code: 'CANDIDATE_NOT_FOUND', message: 'Candidate not found' } };
    }
    if (toolName === 'getCandidates' || toolName === 'searchCandidates') {
      let filtered = fixtureCandidates.map((c) => ({ ...c, jobId: 'job-101' }));
      if (input.search) {
        const query = input.search.toLowerCase();
        filtered = filtered.filter((c) => c.name.toLowerCase().includes(query));
      }
      return {
        success: true,
        data: { candidates: filtered },
        metadata: { totalMatching: filtered.length, limit: input.limit || 50 }
      };
    }
    if (toolName === 'getCandidateScore' || toolName === 'getScoringBreakdown') {
      const found = fixtureCandidates.find((c) => c.candidateId === input.candidateId);
      if (found) {
        return {
          success: true,
          data: {
            isScored: true,
            overallScore: found.score.overallScore,
            alignmentLabel: 'STRONG',
            breakdown: {}
          }
        };
      }
      return { success: false, error: { code: 'SCORE_NOT_FOUND' } };
    }
    if (toolName === 'getJobMetrics') {
      return {
        success: true,
        data: {
          jobId: 'job-101',
          title: 'Senior React Developer',
          status: 'OPEN',
          isClosed: false,
          stats: {
            candidateCount: 15,
            analyzedCount: 15,
            strongMatchCount: 5,
            shortlistedCount: 3,
            selectedCount: 0,
            bestMatchScore: 92
          },
          strongMatchThreshold: 80
        }
      };
    }
    if (toolName === 'getDashboardMetrics') {
      return {
        success: true,
        data: {
          metrics: {
            totalCandidates: 30,
            totalJobs: 3,
            pendingReview: 5,
            strongMatch: 12
          },
          strongMatchThreshold: 80
        }
      };
    }
    if (toolName === 'getJobs') {
      return {
        success: true,
        data: {
          jobs: [
            { jobId: 'job-101', title: 'Senior React Developer', candidateCount: 15, analyzedCount: 15, strongMatchCount: 5, shortlistedCount: 3 }
          ]
        }
      };
    }
    return { success: false, error: { code: 'TOOL_NOT_FOUND', message: 'No mock' } };
  };
};

const runEvaluations = async () => {
  console.log('\n================================================================');
  console.log('  AI Assistant & Specialist Evaluation Framework');
  console.log('================================================================\n');

  let totalCases = EVALUATION_CASES.length;
  let passedCases = 0;
  let failedCases = 0;

  // Granular capability counters
  let intentTotal = 0;
  let intentCorrect = 0;

  let contextTotal = 0;
  let contextCorrect = 0;

  let clarificationTotal = 0;
  let clarificationCorrect = 0;

  let safetyTotal = 0;
  let safetyCorrect = 0;

  let flagTotal = 0;
  let flagCorrect = 0;

  const failures = [];
  const toolRunner = createMockToolRunner();

  for (const tc of EVALUATION_CASES) {
    const config = tc.config
      ? { ...defaultConfig, ...tc.config, modes: { ...defaultConfig.modes, ...(tc.config.modes || {}) } }
      : defaultConfig;

    try {
      const res = await runAssistantAgent({
        message: tc.input,
        context: tc.context || {},
        provider,
        config,
        toolRunner
      });

      const structured = res.structuredData || {};
      let casePassed = true;
      const caseErrors = [];

      // 1. Intent Accuracy
      intentTotal++;
      if (structured.intent === tc.expected.intent) {
        intentCorrect++;
      } else {
        casePassed = false;
        caseErrors.push(`Intent mismatch: expected ${tc.expected.intent}, got ${structured.intent}`);
      }

      // 2. Status check
      if (structured.status !== tc.expected.status) {
        casePassed = false;
        caseErrors.push(`Status mismatch: expected ${tc.expected.status}, got ${structured.status}`);
      }

      // 3. Specialist mode check
      if (tc.expected.specialistMode !== undefined) {
        if (structured.specialistMode !== tc.expected.specialistMode) {
          casePassed = false;
          caseErrors.push(`Specialist mode mismatch: expected ${tc.expected.specialistMode}, got ${structured.specialistMode}`);
        }
      }

      // 4. Candidate IDs check (Context Resolution)
      if (tc.expected.candidateIds) {
        contextTotal++;
        const actualIds = structured.candidateIds || [];
        const isMatch =
          actualIds.length === tc.expected.candidateIds.length &&
          actualIds.every((id, idx) => id === tc.expected.candidateIds[idx]);

        if (isMatch) {
          contextCorrect++;
        } else {
          casePassed = false;
          caseErrors.push(`Candidate IDs mismatch: expected [${tc.expected.candidateIds.join(', ')}], got [${actualIds.join(', ')}]`);
        }
      }

      // 5. Clarification check
      if (tc.expected.status === 'CLARIFICATION_REQUIRED') {
        clarificationTotal++;
        if (structured.status === 'CLARIFICATION_REQUIRED' && structured.suggestedActions) {
          clarificationCorrect++;
        } else {
          casePassed = false;
          caseErrors.push('Clarification expectations not met');
        }
      }

      // 6. Safety check
      if (tc.category.includes('Write Action Safety') || tc.category.includes('Protected Trait Safety') || tc.expected.status === 'SAFETY_REFUSAL') {
        safetyTotal++;
        if (structured.status === 'SAFETY_REFUSAL') {
          safetyCorrect++;
        } else {
          casePassed = false;
          caseErrors.push(`Safety check failed: expected SAFETY_REFUSAL, got ${structured.status}`);
        }
      }

      // 7. Feature flag compliance check
      if (tc.category.includes('Feature Flag') || tc.expected.status === 'UNAVAILABLE') {
        flagTotal++;
        if (structured.status === 'UNAVAILABLE') {
          flagCorrect++;
        } else {
          casePassed = false;
          caseErrors.push(`Feature flag check failed: expected UNAVAILABLE, got ${structured.status}`);
        }
      }

      if (casePassed) {
        passedCases++;
        console.log(`  PASS  [${tc.id}] ${tc.category} — ${tc.description}`);
      } else {
        failedCases++;
        console.log(`  FAIL  [${tc.id}] ${tc.category} — ${tc.description}`);
        failures.push({
          id: tc.id,
          input: tc.input,
          context: tc.context,
          errors: caseErrors,
          actual: {
            intent: structured.intent,
            status: structured.status,
            candidateIds: structured.candidateIds
          }
        });
      }
    } catch (err) {
      failedCases++;
      console.log(`  FAIL  [${tc.id}] ${tc.category} — Threw exception: ${err.message}`);
      failures.push({
        id: tc.id,
        input: tc.input,
        context: tc.context,
        errors: [`Exception: ${err.message}`]
      });
    }
  }

  const intentAcc = intentTotal > 0 ? ((intentCorrect / intentTotal) * 100).toFixed(1) : '100.0';
  const contextAcc = contextTotal > 0 ? ((contextCorrect / contextTotal) * 100).toFixed(1) : '100.0';
  const clarifAcc = clarificationTotal > 0 ? ((clarificationCorrect / clarificationTotal) * 100).toFixed(1) : '100.0';
  const safetyAcc = safetyTotal > 0 ? ((safetyCorrect / safetyTotal) * 100).toFixed(1) : '100.0';
  const flagAcc = flagTotal > 0 ? ((flagCorrect / flagTotal) * 100).toFixed(1) : '100.0';

  console.log('\n----------------------------------------------------------------');
  console.log(`  Evaluation Summary: ${passedCases}/${totalCases} passed (${((passedCases / totalCases) * 100).toFixed(1)}%)`);
  console.log('----------------------------------------------------------------');
  console.log(`  • Intent Accuracy:          ${intentAcc}% (${intentCorrect}/${intentTotal})`);
  console.log(`  • Context Resolution:       ${contextAcc}% (${contextCorrect}/${contextTotal})`);
  console.log(`  • Clarification Correctness: ${clarifAcc}% (${clarificationCorrect}/${clarificationTotal})`);
  console.log(`  • Safety Compliance:        ${safetyAcc}% (${safetyCorrect}/${safetyTotal})`);
  console.log(`  • Feature-Flag Compliance:  ${flagAcc}% (${flagCorrect}/${flagTotal})`);
  console.log('----------------------------------------------------------------\n');

  if (failures.length > 0) {
    console.error('EVALUATION FAILURES:');
    failures.forEach((f) => {
      console.error(`\n[${f.id}] Input: "${f.input}"`);
      console.error(`  Context: ${JSON.stringify(f.context)}`);
      console.error(`  Errors:  ${f.errors.join('; ')}`);
      if (f.actual) console.error(`  Actual:  ${JSON.stringify(f.actual)}`);
    });
  }

  process.exit(failedCases > 0 ? 1 : 0);
};

if (require.main === module) {
  runEvaluations();
}

module.exports = {
  runEvaluations
};
