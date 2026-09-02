/**
 * OpenRouter Provider Contract and Error Normalization Unit Tests.
 *
 * Runs offline with 0 external network calls and ₹0 test cost using mock transport injection.
 */

const { createSuite, assert } = require('./harness');
const { OpenRouterProvider } = require('../ai/providers/OpenRouterProvider');
const { OpenAIProvider } = require('../ai/providers/OpenAIProvider');
const { MockAIProvider } = require('../ai/providers/MockAIProvider');
const { getAIProvider, resetProviderCache } = require('../ai/providers');
const { resolveAiConfig } = require('../ai/config/aiConfig');
const { AiError } = require('../ai/errors/ai.errors');
const { ASSISTANT_INTENT_SCHEMA } = require('../ai/providers/schemas/assistantIntent.schema');

const suite = createSuite('OpenRouter Provider — Contract & Error Normalization Tests');
const { test, testAsync } = suite;

const run = async () => {
  suite.group('Contract & Capabilities');

  test('declares name, default model, and standard capabilities', () => {
    const provider = new OpenRouterProvider({ apiKey: 'sk-mock-key' });
    assert.strictEqual(provider.name, 'openrouter');
    assert.strictEqual(provider.model, 'openai/gpt-4o-mini');
    assert.strictEqual(provider.baseUrl, 'https://openrouter.ai/api/v1');
    assert.deepStrictEqual(provider.capabilities, {
      structuredOutput: true,
      streaming: false,
      toolCalling: true
    });
  });

  await testAsync('throws AI_PROVIDER_NOT_CONFIGURED when API key and transport are absent', async () => {
    const prevKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const provider = new OpenRouterProvider({ apiKey: null, transport: null });
      await assert.rejects(
        () => provider.generate({ messages: [{ role: 'user', content: 'test' }] }),
        (err) => err instanceof AiError && err.code === 'AI_PROVIDER_NOT_CONFIGURED'
      );
    } finally {
      if (prevKey) process.env.OPENROUTER_API_KEY = prevKey;
    }
  });

  suite.group('Structured Output & Header Verification');

  await testAsync('parses valid structured response and returns usage', async () => {
    let capturedPayload = null;
    const mockTransport = async (payload) => {
      capturedPayload = payload;
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'RANK_CANDIDATES',
                candidateCount: 5
              })
            }
          }
        ],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150
        }
      };
    };

    const provider = new OpenRouterProvider({
      apiKey: 'sk-or-fake-test-key',
      transport: mockTransport
    });

    const res = await provider.run({
      mode: 'assistant',
      message: 'Rank candidates for this role'
    });

    assert.strictEqual(res.mode, 'assistant');
    assert.strictEqual(res.provider, 'openrouter');
    assert.strictEqual(res.model, 'openai/gpt-4o-mini');
    assert.deepStrictEqual(res.structuredData, {
      intent: 'RANK_CANDIDATES',
      candidateName: null,
      candidateReference: null,
      candidateCount: 5,
      scope: null,
      requiresJobContext: false
    });
    assert.deepStrictEqual(res.usage, {
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
      costUsd: null
    });

    // Assert outbound payload format
    assert.strictEqual(capturedPayload.model, 'openai/gpt-4o-mini');
    assert.strictEqual(capturedPayload.response_format.type, 'json_schema');
    assert.strictEqual(capturedPayload.response_format.json_schema.name, 'assistant_intent');
    assert.strictEqual(capturedPayload.response_format.json_schema.strict, true);
    assert.deepStrictEqual(capturedPayload.response_format.json_schema.schema, ASSISTANT_INTENT_SCHEMA);
  });

  await testAsync('throws AI_PROVIDER_INVALID_RESPONSE when content is not JSON', async () => {
    const mockTransport = async () => ({
      choices: [{ message: { content: 'Plain text response from model' } }]
    });

    const provider = new OpenRouterProvider({
      apiKey: 'sk-mock-key',
      transport: mockTransport
    });

    await assert.rejects(
      () => provider.run({ mode: 'assistant', message: 'Rank candidates' }),
      (err) => err instanceof AiError && err.code === 'AI_PROVIDER_INVALID_RESPONSE'
    );
  });

  await testAsync('throws AI_PROVIDER_INVALID_RESPONSE when intent is not in allowed enum', async () => {
    const mockTransport = async () => ({
      choices: [{ message: { content: JSON.stringify({ intent: 'INVALID_HALLUCINATED_INTENT' }) } }]
    });

    const provider = new OpenRouterProvider({
      apiKey: 'sk-mock-key',
      transport: mockTransport
    });

    await assert.rejects(
      () => provider.run({ mode: 'assistant', message: 'Rank candidates' }),
      (err) => err instanceof AiError && err.code === 'AI_PROVIDER_INVALID_RESPONSE'
    );
  });

  await testAsync('normalizes abort / timeout to AI_PROVIDER_TIMEOUT', async () => {
    const mockTransport = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };

    const provider = new OpenRouterProvider({
      apiKey: 'sk-mock-key',
      transport: mockTransport
    });

    await assert.rejects(
      () => provider.generate({ messages: [{ role: 'user', content: 'test' }] }),
      (err) => err instanceof AiError && err.code === 'AI_PROVIDER_TIMEOUT' && err.statusCode === 504
    );
  });

  suite.group('Provider Registry Resolution');

  test('AI_PROVIDER=openrouter resolves to OpenRouterProvider', () => {
    resetProviderCache();
    const config = resolveAiConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'openrouter',
      OPENROUTER_API_KEY: 'sk-or-test-key'
    });
    const provider = getAIProvider(config);
    assert.ok(provider instanceof OpenRouterProvider);
    assert.strictEqual(provider.name, 'openrouter');
    assert.strictEqual(provider.model, 'openai/gpt-4o-mini');
  });

  test('AI_PROVIDER=openai still resolves to OpenAIProvider', () => {
    resetProviderCache();
    const config = resolveAiConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-test-key'
    });
    const provider = getAIProvider(config);
    assert.ok(provider instanceof OpenAIProvider);
    assert.strictEqual(provider.name, 'openai');
  });

  test('AI_PROVIDER=mock resolves to MockAIProvider', () => {
    resetProviderCache();
    const config = resolveAiConfig({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'mock'
    });
    const provider = getAIProvider(config);
    assert.ok(provider instanceof MockAIProvider);
    assert.strictEqual(provider.name, 'mock');
  });

  suite.summary();
};

if (require.main === module) {
  run();
}

module.exports = { run };
