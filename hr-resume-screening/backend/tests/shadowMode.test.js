/**
 * Shadow Mode evaluation test suite.
 *
 * Verifies that in shadow mode:
 *   1. The deterministic router remains authoritative.
 *   2. The real provider executes in shadow and records sanitized telemetry.
 *   3. Disagreements are tracked without overriding deterministic execution.
 *   4. Provider errors in shadow do not crash the user request.
 */

const assert = require('assert');
const { runAssistantAgent } = require('../ai/modes/assistant.agent');
const { OpenAIProvider } = require('../ai/providers/OpenAIProvider');
const { getShadowRuns, clearShadowRuns } = require('../ai/logging/shadowLogger');

const runTests = async () => {
  console.log('\n================================================================');
  console.log('  Assistant Shadow Mode — Evaluation & Telemetry Tests');
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

  const createMockToolRunner = () => {
    return async (toolName, input) => {
      if (toolName === 'getJob') {
        return {
          success: true,
          data: {
            job: {
              jobId: 'job-101',
              title: 'Frontend Engineer',
              status: 'OPEN',
              requirements: { requiredSkills: ['React'] }
            }
          }
        };
      }
      if (toolName === 'getJobRequirements') {
        return { success: true, data: { requirements: { requiredSkills: ['React'] } } };
      }
      if (toolName === 'getCandidates') {
        return {
          success: true,
          data: {
            candidates: [
              { candidateId: 'c1', name: 'Alice', score: { isScored: true, overall: 90 } },
              { candidateId: 'c2', name: 'Bob', score: { isScored: true, overall: 85 } }
            ]
          },
          metadata: { totalMatching: 2, limit: 50 }
        };
      }
      if (toolName === 'getDashboardMetrics') {
        return { success: true, data: { metrics: { totalCandidates: 10, totalJobs: 2 } } };
      }
      if (toolName === 'getJobs') {
        return { success: true, data: { jobs: [{ jobId: 'job-101', title: 'Frontend Engineer' }] } };
      }
      return { success: true, data: {} };
    };
  };

  // 1. Shadow mode agreement
  await test('records agreed=true when deterministic and shadow provider intents match', async () => {
    clearShadowRuns();

    const mockTransport = async () => ({
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
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    const config = {
      enabled: true,
      provider: 'openai',
      providerMode: 'shadow',
      modes: { assistant: true, ranking: true, screening: true, comparison: true, insights: true }
    };

    const res = await runAssistantAgent({
      message: 'Rank candidates',
      context: { jobId: 'job-101' },
      provider,
      config,
      toolRunner: createMockToolRunner()
    });

    assert.strictEqual(res.structuredData.intent, 'RANK_CANDIDATES');
    assert.strictEqual(res.structuredData.status, 'SUCCESS');

    const runs = getShadowRuns();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].mode, 'shadow');
    assert.strictEqual(runs[0].deterministicIntent, 'RANK_CANDIDATES');
    assert.strictEqual(runs[0].providerIntent, 'RANK_CANDIDATES');
    assert.strictEqual(runs[0].agreed, true);
    assert.strictEqual(runs[0].success, true);
  });

  // 2. Shadow mode disagreement: deterministic remains authoritative
  await test('deterministic intent executes even when shadow provider returns differing intent', async () => {
    clearShadowRuns();

    // Provider returns GET_INSIGHTS in shadow, but user input was "Rank candidates"
    const mockTransport = async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'GET_INSIGHTS',
              scope: 'CURRENT_JOB'
            })
          }
        }
      ]
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    const config = {
      enabled: true,
      provider: 'openai',
      providerMode: 'shadow',
      modes: { assistant: true, ranking: true, screening: true, comparison: true, insights: true }
    };

    const res = await runAssistantAgent({
      message: 'Rank candidates',
      context: { jobId: 'job-101' },
      provider,
      config,
      toolRunner: createMockToolRunner()
    });

    // Authoritative execution remains Ranking
    assert.strictEqual(res.structuredData.intent, 'RANK_CANDIDATES');
    assert.strictEqual(res.structuredData.specialistMode, 'ranking');

    const runs = getShadowRuns();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].deterministicIntent, 'RANK_CANDIDATES');
    assert.strictEqual(runs[0].providerIntent, 'GET_INSIGHTS');
    assert.strictEqual(runs[0].agreed, false);
    assert.strictEqual(runs[0].success, true);
  });

  // 3. Shadow provider error does not crash the request
  await test('shadow provider failure records error in telemetry without failing user request', async () => {
    clearShadowRuns();

    const mockTransport = async () => {
      throw new Error('Shadow network failure');
    };

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    const config = {
      enabled: true,
      provider: 'openai',
      providerMode: 'shadow',
      modes: { assistant: true, ranking: true, screening: true, comparison: true, insights: true }
    };

    const res = await runAssistantAgent({
      message: 'Rank candidates',
      context: { jobId: 'job-101' },
      provider,
      config,
      toolRunner: createMockToolRunner()
    });

    // Request succeeds because deterministic is authoritative
    assert.strictEqual(res.structuredData.intent, 'RANK_CANDIDATES');
    assert.strictEqual(res.structuredData.status, 'SUCCESS');

    const runs = getShadowRuns();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].success, false);
    assert.strictEqual(runs[0].agreed, false);
  });

  console.log('\n----------------------------------------------------------------');
  console.log(`  Assistant Shadow Mode: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
};

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
