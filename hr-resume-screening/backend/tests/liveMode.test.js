/**
 * Live Provider Mode integration test suite.
 *
 * Verifies that in Live Mode:
 *   1. Real provider interpretation drives intent for diverse phrasing.
 *   2. Deterministic context resolution and specialist execution follow.
 *   3. Safety pre-checks refuse write attempts and protected traits with ZERO provider transport calls.
 *   4. Closed job safeguards refuse ranking on closed roles even if provider returned RANK_CANDIDATES.
 *   5. Provider failures gracefully fall back to deterministic router.
 */

const assert = require('assert');
const { runAssistantAgent } = require('../ai/modes/assistant.agent');
const { OpenAIProvider } = require('../ai/providers/OpenAIProvider');

const runTests = async () => {
  console.log('\n================================================================');
  console.log('  Assistant Live Mode — Language Understanding & Fallback Tests');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`  PASS  ${name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL  ${name}`);
      console.error(`        ${err.message}`);
      failed++;
    }
  };

  const fixtureJobOpen = {
    jobId: 'job-101',
    title: 'Senior React Engineer',
    status: 'OPEN',
    requirements: { requiredSkills: ['React', 'TypeScript'] }
  };

  const fixtureJobClosed = {
    jobId: 'job-102',
    title: 'Closed Architect',
    status: 'CLOSED',
    isClosed: true,
    requirements: { requiredSkills: ['System Design'] }
  };

  const fixtureCandidates = [
    { candidateId: 'c1', name: 'Rahul Sharma', score: { isScored: true, overall: 92 } },
    { candidateId: 'c2', name: 'Priya Patel', score: { isScored: true, overall: 88 } },
    { candidateId: 'c3', name: 'Amit Kumar', score: { isScored: true, overall: 80 } }
  ];

  const createMockToolRunner = () => {
    return async (toolName, input) => {
      if (toolName === 'getJob') {
        if (input.jobId === 'job-101') return { success: true, data: { job: fixtureJobOpen } };
        if (input.jobId === 'job-102') return { success: true, data: { job: fixtureJobClosed } };
        return { success: false, error: { code: 'JOB_NOT_FOUND' } };
      }
      if (toolName === 'getJobRequirements') {
        const j = input.jobId === 'job-102' ? fixtureJobClosed : fixtureJobOpen;
        return { success: true, data: { requirements: j.requirements } };
      }
      if (toolName === 'getCandidates' || toolName === 'searchCandidates') {
        let list = fixtureCandidates.map((c) => ({ ...c, jobId: 'job-101' }));
        if (input.search) {
          list = list.filter((c) => c.name.toLowerCase().includes(input.search.toLowerCase()));
        }
        return { success: true, data: { candidates: list }, metadata: { totalMatching: list.length, limit: 50 } };
      }
      if (toolName === 'getCandidate') {
        const found = fixtureCandidates.find((c) => c.candidateId === input.candidateId);
        if (found) return { success: true, data: { candidate: { ...found, jobId: 'job-101' } } };
        return { success: false, error: { code: 'CANDIDATE_NOT_FOUND' } };
      }
      if (toolName === 'getCandidateScore') {
        const found = fixtureCandidates.find((c) => c.candidateId === input.candidateId);
        if (found) return { success: true, data: { isScored: true, overallScore: found.score.overall } };
        return { success: false, error: { code: 'SCORE_NOT_FOUND' } };
      }
      return { success: true, data: {} };
    };
  };

  const liveConfig = {
    enabled: true,
    provider: 'openai',
    providerMode: 'live',
    realProviderEnabled: true,
    modes: { assistant: true, ranking: true, screening: true, comparison: true, insights: true }
  };

  // 1. Natural phrasing interpreted by provider -> Ranking execution
  await test('natural language request ("Who are the strongest people for this role?") executes Ranking', async () => {
    let transportCalled = 0;
    const mockTransport = async (payload) => {
      transportCalled++;
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'RANK_CANDIDATES',
                scope: 'CURRENT_JOB'
              })
            }
          }
        ]
      };
    };

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    const res = await runAssistantAgent({
      message: 'Who are the strongest people for this role?',
      context: { jobId: 'job-101' },
      provider,
      config: liveConfig,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(transportCalled, 1);
    assert.strictEqual(res.structuredData.intent, 'RANK_CANDIDATES');
    assert.strictEqual(res.structuredData.specialistMode, 'ranking');
    assert.strictEqual(res.structuredData.status, 'SUCCESS');
  });

  // 2. Follow-up "Compare the best three" with extracted candidateCount: 3
  await test('follow-up request ("Compare the best three") uses lastRankingCandidateIds with count=3', async () => {
    let transportCalled = 0;
    const mockTransport = async () => {
      transportCalled++;
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'COMPARE_CANDIDATES',
                candidateCount: 3
              })
            }
          }
        ]
      };
    };

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    const res = await runAssistantAgent({
      message: 'Compare the best three',
      context: { jobId: 'job-101', lastRankingCandidateIds: ['c1', 'c2', 'c3'] },
      provider,
      config: liveConfig,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(transportCalled, 1);
    assert.strictEqual(res.structuredData.intent, 'COMPARE_CANDIDATES');
    assert.strictEqual(res.structuredData.specialistMode, 'comparison');
    assert.deepStrictEqual(res.structuredData.candidateIds, ['c1', 'c2', 'c3']);
  });

  // 3. Safety Pre-Check: Write attempt refused with 0 provider calls
  await test('write attempt ("Shortlist Rahul") is refused with 0 provider transport calls', async () => {
    let transportCalled = 0;
    const mockTransport = async () => {
      transportCalled++;
      return { choices: [{ message: { content: '{}' } }] };
    };

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    const res = await runAssistantAgent({
      message: 'Shortlist Rahul',
      context: { jobId: 'job-101' },
      provider,
      config: liveConfig,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(transportCalled, 0, 'Transport should NOT be called for write attempts');
    assert.strictEqual(res.structuredData.status, 'SAFETY_REFUSAL');
  });

  // 4. Safety Pre-Check: Protected trait ranking refused with 0 provider calls
  await test('protected trait request ("Rank by age") is refused with 0 provider transport calls', async () => {
    let transportCalled = 0;
    const mockTransport = async () => {
      transportCalled++;
      return { choices: [{ message: { content: '{}' } }] };
    };

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    const res = await runAssistantAgent({
      message: 'Rank candidates by age',
      context: { jobId: 'job-101' },
      provider,
      config: liveConfig,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(transportCalled, 0, 'Transport should NOT be called for protected traits');
    assert.strictEqual(res.structuredData.status, 'SAFETY_REFUSAL');
  });

  // 5. Closed Job Safeguard: Provider returns RANK_CANDIDATES, but role is closed
  await test('closed job safeguard returns RESTRICTED even if provider interpreted RANK_CANDIDATES', async () => {
    const mockTransport = async () => ({
      choices: [{ message: { content: JSON.stringify({ intent: 'RANK_CANDIDATES' }) } }]
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    const res = await runAssistantAgent({
      message: 'Rank candidates',
      context: { jobId: 'job-102' }, // closed job
      provider,
      config: liveConfig,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.status, 'RESTRICTED');
  });

  // 6. Provider failure fallback: transport throws, deterministic router handles "Rank candidates"
  await test('provider timeout or failure gracefully falls back to deterministic router', async () => {
    const mockTransport = async () => {
      const err = new Error('Gateway Timeout');
      err.name = 'AbortError';
      throw err;
    };

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    const res = await runAssistantAgent({
      message: 'Rank candidates',
      context: { jobId: 'job-101' },
      provider,
      config: liveConfig,
      toolRunner: createMockToolRunner()
    });

    // Fallback succeeds for known deterministic phrases
    assert.strictEqual(res.structuredData.intent, 'RANK_CANDIDATES');
    assert.strictEqual(res.structuredData.status, 'SUCCESS');
  });

  console.log('\n----------------------------------------------------------------');
  console.log(`  Assistant Live Mode: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
};

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
