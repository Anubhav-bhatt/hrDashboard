/**
 * Unit & Contract tests for OpenAIProvider.
 *
 * All tests use an injected mock transport — ZERO network calls, ZERO external cost (₹0).
 */

const assert = require('assert');
const { OpenAIProvider } = require('../ai/providers/OpenAIProvider');
const { AiError } = require('../ai/errors/ai.errors');

const runTests = async () => {
  console.log('\n================================================================');
  console.log('  OpenAI Provider — Contract & Error Normalization Tests');
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

  // 1. Constructor and capabilities
  await test('declares name, model, and standard capabilities', () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-4o-mini' });
    assert.strictEqual(provider.name, 'openai');
    assert.strictEqual(provider.model, 'gpt-4o-mini');
    assert.strictEqual(provider.capabilities.structuredOutput, true);
    assert.strictEqual(provider.capabilities.toolCalling, true);
  });

  // 2. Missing API key throws AI_PROVIDER_NOT_CONFIGURED
  await test('throws AI_PROVIDER_NOT_CONFIGURED when API key and transport are absent', async () => {
    const provider = new OpenAIProvider({ apiKey: null, transport: null });
    await assert.rejects(
      async () => {
        await provider.generate({ messages: [{ role: 'user', content: 'test' }] });
      },
      (err) => {
        assert(err instanceof AiError);
        assert.strictEqual(err.code, 'AI_PROVIDER_NOT_CONFIGURED');
        return true;
      }
    );
  });

  // 3. Successful structured response with mock transport
  await test('parses valid structured response and returns usage', async () => {
    const mockTransport = async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'RANK_CANDIDATES',
              candidateName: null,
              candidateReference: null,
              candidateCount: null,
              scope: 'CURRENT_JOB',
              requiresJobContext: false
            })
          }
        }
      ],
      usage: { prompt_tokens: 45, completion_tokens: 18, total_tokens: 63 }
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    const res = await provider.run({ mode: 'assistant', message: 'Show me top candidates' });

    assert.strictEqual(res.provider, 'openai');
    assert.strictEqual(res.structuredData.intent, 'RANK_CANDIDATES');
    assert.strictEqual(res.structuredData.scope, 'CURRENT_JOB');
    assert.strictEqual(res.usage.totalTokens, 63);
  });

  // 4. Invalid JSON content from provider
  await test('throws AI_PROVIDER_INVALID_RESPONSE when content is not JSON', async () => {
    const mockTransport = async () => ({
      choices: [{ message: { content: 'Not valid JSON' } }]
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    await assert.rejects(
      async () => {
        await provider.run({ mode: 'assistant', message: 'Hello' });
      },
      (err) => {
        assert(err instanceof AiError);
        assert.strictEqual(err.code, 'AI_PROVIDER_INVALID_RESPONSE');
        return true;
      }
    );
  });

  // 5. Schema validation failure
  await test('throws AI_PROVIDER_INVALID_RESPONSE when intent is not in allowed enum', async () => {
    const mockTransport = async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'INVALID_UNKNOWN_INTENT_XYZ'
            })
          }
        }
      ]
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    await assert.rejects(
      async () => {
        await provider.run({ mode: 'assistant', message: 'Hello' });
      },
      (err) => {
        assert(err instanceof AiError);
        assert.strictEqual(err.code, 'AI_PROVIDER_INVALID_RESPONSE');
        return true;
      }
    );
  });

  // 6. Timeout error mapping
  await test('normalizes abort / timeout to AI_PROVIDER_TIMEOUT', async () => {
    const mockTransport = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };

    const provider = new OpenAIProvider({ apiKey: 'test-key', transport: mockTransport });
    await assert.rejects(
      async () => {
        await provider.generate({ messages: [{ role: 'user', content: 'test' }] });
      },
      (err) => {
        assert(err instanceof AiError);
        assert.strictEqual(err.code, 'AI_PROVIDER_TIMEOUT');
        return true;
      }
    );
  });

  console.log('\n----------------------------------------------------------------');
  console.log(`  OpenAI Provider: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
};

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
