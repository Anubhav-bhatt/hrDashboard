/**
 * AI foundation unit tests.
 *
 *   npm run test:ai
 *
 * Covers configuration and flags, mode definitions, provider resolution, the mock
 * provider, context validation and the orchestrator. No database and no network:
 * one of the tests below actively proves the second half of that claim by
 * intercepting every outbound path Node offers and asserting nothing was used.
 */
const { createSuite, assert } = require('./harness');

const {
  resolveAiConfig,
  isModeEnabled,
  describeAiConfig,
  SUPPORTED_PROVIDERS,
  DEFAULT_PROVIDER
} = require('../ai/config/aiConfig');
const { AGENT_MODES, AGENT_MODE_IDS, isAgentMode, getAgentMode, describeModes } = require('../ai/modes/agentModes');
const { getAIProvider, resetProviderCache } = require('../ai/providers');
const { AIProvider } = require('../ai/providers/AIProvider');
const { MockAIProvider, MODE_CONTENT } = require('../ai/providers/MockAIProvider');
const { normalizeAgentContext, LIMITS } = require('../ai/context/AgentContext');
const orchestrator = require('../ai/orchestrator/AgentOrchestrator');
const { AiError, AI_ERROR_CODES } = require('../ai/errors/ai.errors');
const { FORBIDDEN_KEYS } = require('../ai/logging/aiLogger');

const suite = createSuite('AI foundation — flags, provider, orchestrator');
const { test, testAsync } = suite;

/* ------------------------------------------------------------- helpers ---- */

/** Environment bag with everything on, as a base for targeted overrides. */
const allOn = (overrides = {}) => ({
  AI_ENABLED: 'true',
  AI_ASSISTANT_ENABLED: 'true',
  AI_SCREENING_ENABLED: 'true',
  AI_RANKING_ENABLED: 'true',
  AI_COMPARISON_ENABLED: 'true',
  AI_INSIGHTS_ENABLED: 'true',
  AI_PROVIDER: 'mock',
  ...overrides
});

const USER = { id: 'user-1', role: 'RECRUITER', name: 'Test Recruiter' };

/** Captures the AiError thrown by an async call. */
const captureError = async (fn) => {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return null;
};

const run = async () => {
  /* ------------------------------------------------- configuration ------- */

  suite.group('Configuration defaults');

  test('an empty environment leaves AI off and every mode off', () => {
    const config = resolveAiConfig({});
    assert.strictEqual(config.enabled, false, 'AI must default off');
    assert.strictEqual(config.writeActionsEnabled, false, 'write actions must default off');
    for (const id of AGENT_MODE_IDS) {
      assert.strictEqual(config.modes[id], false, `${id} must default off`);
    }
  });

  test('the provider defaults to mock, so no API key is ever required', () => {
    assert.strictEqual(resolveAiConfig({}).provider, DEFAULT_PROVIDER);
    assert.strictEqual(DEFAULT_PROVIDER, 'mock');
    assert.deepStrictEqual(SUPPORTED_PROVIDERS, ['mock', 'openai', 'openrouter']);
  });

  test('an empty or whitespace provider falls back to mock rather than failing', () => {
    assert.strictEqual(resolveAiConfig({ AI_PROVIDER: '' }).provider, 'mock');
    assert.strictEqual(resolveAiConfig({ AI_PROVIDER: '   ' }).provider, 'mock');
  });

  test('boolean flags accept the usual spellings, case-insensitively', () => {
    for (const value of ['true', 'TRUE', '1', 'yes', 'on', ' True ']) {
      assert.strictEqual(resolveAiConfig({ AI_ENABLED: value }).enabled, true, `"${value}" should be true`);
    }
    for (const value of ['false', 'FALSE', '0', 'no', 'off', '']) {
      assert.strictEqual(resolveAiConfig({ AI_ENABLED: value }).enabled, false, `"${value}" should be false`);
    }
  });

  test('an unparseable flag resolves to false and is reported, not guessed at', () => {
    const config = resolveAiConfig({ AI_ENABLED: 'ture' });
    assert.strictEqual(config.enabled, false, 'a typo must not switch AI on');
    assert.strictEqual(config.warnings.length, 1);
    assert.ok(/AI_ENABLED/.test(config.warnings[0]), config.warnings[0]);
  });

  test('the resolved config is frozen so nothing can flip a flag at runtime', () => {
    const config = resolveAiConfig(allOn());
    assert.throws(() => {
      'use strict';
      config.enabled = false;
    }, TypeError);
    assert.throws(() => {
      'use strict';
      config.modes.screening = false;
    }, TypeError);
  });

  test('config is read fresh each call, so a flag change needs no restart', () => {
    assert.strictEqual(resolveAiConfig({ AI_ENABLED: 'false' }).enabled, false);
    assert.strictEqual(resolveAiConfig({ AI_ENABLED: 'true' }).enabled, true);
  });

  test('describeAiConfig exposes flags, provider and limits only — never a secret', () => {
    const described = describeAiConfig(resolveAiConfig(allOn({ GEMINI_API_KEY: 'should-not-appear' })));
    const serialized = JSON.stringify(described);
    assert.ok(!/should-not-appear/.test(serialized), serialized);
    // `limits` was added with the Phase 2 tool layer. The list is pinned so a
    // future field cannot join this summary without the addition being noticed —
    // this object is the one that would be safe to show a client.
    assert.deepStrictEqual(Object.keys(described).sort(), [
      'enabled',
      'limits',
      'modes',
      'provider',
      'providerMode',
      'providerSupported',
      'realProviderEnabled',
      'writeActionsEnabled'
    ]);
  });

  test('retrieval limits default safely and reject nonsense', () => {
    const defaults = resolveAiConfig({}).limits;
    assert.strictEqual(defaults.defaultCandidateLimit, 50);
    assert.strictEqual(defaults.maxCandidateLimit, 200);
    assert.strictEqual(defaults.defaultJobLimit, 25);
    assert.strictEqual(defaults.maxJobLimit, 100);

    // An unparseable ceiling must not become "no ceiling".
    const bad = resolveAiConfig({ AI_TOOL_MAX_CANDIDATE_LIMIT: '2OO' });
    assert.strictEqual(bad.limits.maxCandidateLimit, 200, 'falls back to the documented default');
    assert.ok(bad.warnings.some((w) => /AI_TOOL_MAX_CANDIDATE_LIMIT/.test(w)), JSON.stringify(bad.warnings));

    for (const value of ['0', '-5', '12.5', 'unlimited']) {
      assert.strictEqual(
        resolveAiConfig({ AI_TOOL_MAX_CANDIDATE_LIMIT: value }).limits.maxCandidateLimit,
        200,
        `"${value}" must not be honoured`
      );
    }

    // A default above its own maximum is contradictory; the maximum wins.
    const contradictory = resolveAiConfig({
      AI_TOOL_DEFAULT_CANDIDATE_LIMIT: '500',
      AI_TOOL_MAX_CANDIDATE_LIMIT: '100'
    });
    assert.strictEqual(contradictory.limits.defaultCandidateLimit, 100);
    assert.ok(contradictory.warnings.some((w) => /exceeds/.test(w)), JSON.stringify(contradictory.warnings));
  });

  /* ------------------------------------------------ master switch -------- */

  suite.group('Master switch and per-mode flags');

  test('AI_ENABLED=false overrides every mode flag that is on', () => {
    const config = resolveAiConfig(allOn({ AI_ENABLED: 'false' }));
    for (const id of AGENT_MODE_IDS) {
      assert.strictEqual(config.modes[id], true, `${id} flag is set`);
      assert.strictEqual(isModeEnabled(config, id), false, `${id} must still be off`);
    }
  });

  test('each mode can be disabled individually without affecting the others', () => {
    for (const target of AGENT_MODE_IDS) {
      const config = resolveAiConfig(allOn({ [AGENT_MODES[target].flagKey]: 'false' }));
      assert.strictEqual(isModeEnabled(config, target), false, `${target} should be off`);
      for (const other of AGENT_MODE_IDS.filter((id) => id !== target)) {
        assert.strictEqual(isModeEnabled(config, other), true, `${other} should stay on`);
      }
    }
  });

  test('isModeEnabled cannot be satisfied by an inherited property name', () => {
    const config = resolveAiConfig(allOn());
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.strictEqual(isModeEnabled(config, name), false, `${name} must not resolve as a mode`);
    }
  });

  /* -------------------------------------------------------- modes -------- */

  suite.group('Agent modes');

  test('exactly the five documented modes exist', () => {
    assert.deepStrictEqual([...AGENT_MODE_IDS].sort(), [
      'assistant',
      'comparison',
      'insights',
      'ranking',
      'screening'
    ]);
  });

  test('every mode is read-only in this phase', () => {
    for (const id of AGENT_MODE_IDS) {
      assert.strictEqual(AGENT_MODES[id].readOnly, true, `${id} must be read-only`);
    }
  });

  test('every mode carries an id, display name, description and flag key', () => {
    for (const id of AGENT_MODE_IDS) {
      const mode = AGENT_MODES[id];
      assert.strictEqual(mode.id, id);
      assert.ok(mode.displayName && typeof mode.displayName === 'string', `${id} displayName`);
      assert.ok(mode.description && typeof mode.description === 'string', `${id} description`);
      assert.ok(/^AI_[A-Z]+_ENABLED$/.test(mode.flagKey), `${id} flagKey: ${mode.flagKey}`);
    }
  });

  test('mode membership rejects inherited names and non-strings', () => {
    for (const value of ['constructor', '__proto__', 'toString', 'valueOf', 'screening ', 'SCREENING', '']) {
      assert.strictEqual(isAgentMode(value), false, `${JSON.stringify(value)} must not be a mode`);
      assert.strictEqual(getAgentMode(value), null);
    }
    for (const value of [null, undefined, 0, 1, {}, [], true]) {
      assert.strictEqual(isAgentMode(value), false, `${JSON.stringify(value)} must not be a mode`);
    }
    assert.strictEqual(isAgentMode('screening'), true);
  });

  test('describeModes reports live enabled state including the five fields', () => {
    const described = describeModes(resolveAiConfig(allOn({ AI_RANKING_ENABLED: 'false' })));
    assert.strictEqual(described.length, 5);
    for (const entry of described) {
      assert.deepStrictEqual(Object.keys(entry).sort(), [
        'description',
        'displayName',
        'enabled',
        'id',
        'readOnly'
      ]);
    }
    assert.strictEqual(described.find((m) => m.id === 'ranking').enabled, false);
    assert.strictEqual(described.find((m) => m.id === 'screening').enabled, true);
  });

  /* ---------------------------------------------- provider resolution --- */

  suite.group('Provider resolution');

  test('AI_PROVIDER=mock resolves to MockAIProvider', () => {
    resetProviderCache();
    const provider = getAIProvider(resolveAiConfig(allOn()));
    assert.ok(provider instanceof MockAIProvider, 'expected a MockAIProvider');
    assert.ok(provider instanceof AIProvider, 'must satisfy the provider contract');
    assert.strictEqual(provider.name, 'mock');
    assert.strictEqual(provider.model, 'mock-v1');
  });

  test('an unset provider still resolves to the mock provider', () => {
    resetProviderCache();
    assert.ok(getAIProvider(resolveAiConfig({ AI_ENABLED: 'true' })) instanceof MockAIProvider);
  });

  test('an unknown provider fails with AI_PROVIDER_INVALID and no fallback', () => {
    resetProviderCache();
    let thrown = null;
    try {
      getAIProvider(resolveAiConfig(allOn({ AI_PROVIDER: 'definitely-not-a-provider' })));
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof AiError, 'expected an AiError');
    assert.strictEqual(thrown.code, 'AI_PROVIDER_INVALID');
    assert.ok(/mock/.test(thrown.message), 'message should name the supported providers');
  });

  test('AI_PROVIDER=openai resolves to OpenAIProvider', () => {
    resetProviderCache();
    const { OpenAIProvider } = require('../ai/providers/OpenAIProvider');
    const provider = getAIProvider(resolveAiConfig(allOn({ AI_PROVIDER: 'openai' })));
    assert.ok(provider instanceof OpenAIProvider, 'expected an OpenAIProvider');
    assert.ok(provider instanceof AIProvider, 'must satisfy the provider contract');
    assert.strictEqual(provider.name, 'openai');
  });

  test('an unimplemented provider is refused rather than silently used', () => {
    for (const name of ['anthropic', 'claude', 'gemini', 'google']) {
      resetProviderCache();
      let thrown = null;
      try {
        getAIProvider(resolveAiConfig(allOn({ AI_PROVIDER: name })));
      } catch (error) {
        thrown = error;
      }
      assert.ok(thrown instanceof AiError, `${name} should throw`);
      assert.strictEqual(thrown.code, 'AI_PROVIDER_INVALID', `${name} code`);
      assert.ok(/not implemented/i.test(thrown.message), `${name}: ${thrown.message}`);
    }
  });

  test('the provider instance is reused rather than rebuilt per call', () => {
    resetProviderCache();
    const config = resolveAiConfig(allOn());
    assert.strictEqual(getAIProvider(config), getAIProvider(config));
  });

  test('the abstract base cannot be constructed or used directly', () => {
    assert.throws(() => new AIProvider({ name: 'x', model: 'y' }), /abstract/i);

    class Incomplete extends AIProvider {
      constructor() {
        super({ name: 'incomplete', model: 'v0' });
      }
    }
    assert.rejects(() => new Incomplete().run({}), /must implement run/);
  });

  /* --------------------------------------------------- mock provider ---- */

  suite.group('Mock provider');

  await testAsync('returns the documented line for every mode', async () => {
    const provider = new MockAIProvider();
    for (const id of AGENT_MODE_IDS) {
      const result = await provider.run({
        mode: id,
        message: 'test',
        context: normalizeAgentContext({}, { user: USER, requestId: 'req-1' }),
        metadata: {}
      });
      assert.strictEqual(result.mode, id);
      assert.strictEqual(result.content, MODE_CONTENT[id]);
      assert.ok(result.content.length > 0);
    }
  });

  await testAsync('identifies itself as mock/mock-v1 with zero usage and zero cost', async () => {
    const result = await new MockAIProvider().run({
      mode: 'screening',
      message: 'test',
      context: normalizeAgentContext({}, { user: USER, requestId: 'req-1' }),
      metadata: {}
    });
    assert.strictEqual(result.provider, 'mock');
    assert.strictEqual(result.model, 'mock-v1');
    assert.deepStrictEqual(result.usage, {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0
    });
  });

  await testAsync('is deterministic — identical requests produce identical objects', async () => {
    const provider = new MockAIProvider();
    const request = () => ({
      mode: 'ranking',
      message: 'Rank these candidates',
      context: normalizeAgentContext(
        { jobId: 'job-abc', candidateIds: ['c1', 'c2'], filters: { minScore: 80 } },
        { user: USER, requestId: 'fixed-request-id' }
      ),
      metadata: {}
    });

    const first = await provider.run(request());
    const second = await provider.run(request());
    const third = await provider.run(request());

    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(second, third);
    // No field may carry a clock reading or a counter.
    assert.ok(!('duration' in first) && !('durationMs' in first), 'provider must not time itself');
  });

  await testAsync('never echoes the prompt text back in its response', async () => {
    const secret = 'CONFIDENTIAL-CANDIDATE-DETAIL-9f3a';
    const result = await new MockAIProvider().run({
      mode: 'assistant',
      message: `Tell me about ${secret}`,
      context: normalizeAgentContext({}, { user: USER, requestId: 'req-1' }),
      metadata: {}
    });
    assert.ok(!JSON.stringify(result).includes(secret), 'prompt text leaked into the response');
    assert.strictEqual(result.structuredData.receivedMessageLength, `Tell me about ${secret}`.length);
  });

  await testAsync('makes no network call of any kind', async () => {
    const http = require('http');
    const https = require('https');
    const dns = require('dns');
    const net = require('net');
    const tls = require('tls');

    const calls = [];
    const originals = {
      fetch: global.fetch,
      httpRequest: http.request,
      httpGet: http.get,
      httpsRequest: https.request,
      httpsGet: https.get,
      dnsLookup: dns.lookup,
      netConnect: net.Socket.prototype.connect,
      tlsConnect: tls.connect
    };

    const trap = (label) => (...args) => {
      calls.push(label);
      throw new Error(`MockAIProvider attempted ${label}`);
    };

    global.fetch = trap('fetch');
    http.request = trap('http.request');
    http.get = trap('http.get');
    https.request = trap('https.request');
    https.get = trap('https.get');
    dns.lookup = trap('dns.lookup');
    net.Socket.prototype.connect = trap('socket.connect');
    tls.connect = trap('tls.connect');

    try {
      for (const id of AGENT_MODE_IDS) {
        await new MockAIProvider().run({
          mode: id,
          message: 'network probe',
          context: normalizeAgentContext({}, { user: USER, requestId: 'req-1' }),
          metadata: {}
        });
      }
    } finally {
      global.fetch = originals.fetch;
      http.request = originals.httpRequest;
      http.get = originals.httpGet;
      https.request = originals.httpsRequest;
      https.get = originals.httpsGet;
      dns.lookup = originals.dnsLookup;
      net.Socket.prototype.connect = originals.netConnect;
      tls.connect = originals.tlsConnect;
    }

    assert.deepStrictEqual(calls, [], `outbound calls attempted: ${calls.join(', ')}`);
  });

  await testAsync('the mock provider imports no vendor SDK', async () => {
    // A vendor package would have to be loaded to be used; none is present in
    // the module registry after exercising the whole provider path.
    const loaded = Object.keys(require.cache).join('|').toLowerCase();
    for (const vendor of ['node_modules/openai', 'node_modules/@anthropic', 'generative-ai', 'langchain']) {
      assert.ok(!loaded.includes(vendor), `${vendor} was loaded`);
    }
  });

  /* ------------------------------------------------ context validation -- */

  suite.group('Agent context validation');

  test('an absent context produces a valid, empty context', () => {
    const context = normalizeAgentContext(undefined, { user: USER, requestId: 'req-1' });
    assert.strictEqual(context.requestId, 'req-1');
    assert.strictEqual(context.jobId, null);
    assert.strictEqual(context.sessionId, null);
    assert.deepStrictEqual(context.candidateIds, []);
    assert.deepStrictEqual({ ...context.filters }, {});
  });

  test('identity is taken from the session, never from the request', () => {
    const context = normalizeAgentContext({}, { user: USER, requestId: 'req-1' });
    assert.strictEqual(context.userId, 'user-1');
    assert.strictEqual(context.userRole, 'RECRUITER');
  });

  test('a client attempting to supply identity is refused, not silently corrected', () => {
    for (const key of ['userId', 'userRole', 'requestId']) {
      assert.throws(
        () => normalizeAgentContext({ [key]: 'ADMIN' }, { user: USER, requestId: 'req-1' }),
        (error) => error instanceof AiError && error.code === 'AI_REQUEST_INVALID',
        `${key} must be rejected`
      );
    }
  });

  test('an unknown context field is rejected', () => {
    assert.throws(
      () => normalizeAgentContext({ resumeText: 'a whole resume' }, { user: USER }),
      (error) => error instanceof AiError && error.code === 'AI_REQUEST_INVALID'
    );
  });

  test('identifiers must look like identifiers', () => {
    const ok = normalizeAgentContext(
      { jobId: '2f8a1c4e-0b7d-4c3a-9f21-8ab5d6e7f012' },
      { user: USER, requestId: 'r' }
    );
    assert.strictEqual(ok.jobId, '2f8a1c4e-0b7d-4c3a-9f21-8ab5d6e7f012');

    for (const bad of ['../../etc/passwd', 'job; DROP TABLE "Job"', 'a'.repeat(65), 'has space', 'a\nb', 42, {}]) {
      assert.throws(
        () => normalizeAgentContext({ jobId: bad }, { user: USER }),
        (error) => error instanceof AiError && error.code === 'AI_REQUEST_INVALID',
        `jobId ${JSON.stringify(bad)} must be rejected`
      );
    }
  });

  test('candidateIds are validated, de-duplicated and bounded', () => {
    const context = normalizeAgentContext({ candidateIds: ['c1', 'c2', 'c1'] }, { user: USER, requestId: 'r' });
    assert.deepStrictEqual(context.candidateIds, ['c1', 'c2']);

    assert.throws(
      () => normalizeAgentContext({ candidateIds: 'c1' }, { user: USER }),
      (error) => error.code === 'AI_REQUEST_INVALID'
    );
    assert.throws(
      () =>
        normalizeAgentContext(
          { candidateIds: Array.from({ length: LIMITS.candidateIds + 1 }, (_, i) => `c${i}`) },
          { user: USER }
        ),
      (error) => error.code === 'AI_REQUEST_INVALID'
    );
  });

  test('filters accept primitives and flat arrays only', () => {
    const context = normalizeAgentContext(
      { filters: { minScore: 80, hrStatus: 'SHORTLISTED', includeUnscored: false, skills: ['React', 'Node'] } },
      { user: USER, requestId: 'r' }
    );
    assert.strictEqual(context.filters.minScore, 80);
    assert.strictEqual(context.filters.hrStatus, 'SHORTLISTED');
    assert.strictEqual(context.filters.includeUnscored, false);
    assert.deepStrictEqual(context.filters.skills, ['React', 'Node']);
  });

  test('a nested object in filters is refused, so records cannot ride along', () => {
    assert.throws(
      () => normalizeAgentContext({ filters: { candidate: { name: 'Rahul', resumeText: '...' } } }, { user: USER }),
      (error) => error instanceof AiError && error.code === 'AI_REQUEST_INVALID'
    );
    assert.throws(
      () => normalizeAgentContext({ filters: { nested: [{ deep: true }] } }, { user: USER }),
      (error) => error.code === 'AI_REQUEST_INVALID'
    );
  });

  test('prototype-polluting filter keys are refused', () => {
    for (const key of ['__proto__', 'constructor', 'prototype', '_private', '1abc']) {
      const filters = {};
      Object.defineProperty(filters, key, { value: 'x', enumerable: true, configurable: true });
      assert.throws(
        () => normalizeAgentContext({ filters }, { user: USER }),
        (error) => error instanceof AiError && error.code === 'AI_REQUEST_INVALID',
        `filter key ${key} must be rejected`
      );
    }
  });

  test('filters are bounded in count, string length and array size', () => {
    const many = {};
    for (let i = 0; i < LIMITS.filterKeys + 1; i++) many[`key${i}`] = i;
    assert.throws(() => normalizeAgentContext({ filters: many }, { user: USER }), (e) => e.code === 'AI_REQUEST_INVALID');

    assert.throws(
      () => normalizeAgentContext({ filters: { long: 'x'.repeat(LIMITS.filterStringLength + 1) } }, { user: USER }),
      (e) => e.code === 'AI_REQUEST_INVALID'
    );
    assert.throws(
      () =>
        normalizeAgentContext(
          { filters: { list: Array.from({ length: LIMITS.filterArrayItems + 1 }, (_, i) => i) } },
          { user: USER }
        ),
      (e) => e.code === 'AI_REQUEST_INVALID'
    );
    assert.throws(
      () => normalizeAgentContext({ filters: { score: Number.NaN } }, { user: USER }),
      (e) => e.code === 'AI_REQUEST_INVALID'
    );
  });

  test('a non-object context is refused', () => {
    for (const bad of ['string', 42, true, []]) {
      assert.throws(
        () => normalizeAgentContext(bad, { user: USER }),
        (error) => error instanceof AiError && error.code === 'AI_REQUEST_INVALID',
        `${JSON.stringify(bad)} must be rejected`
      );
    }
  });

  /* ------------------------------------------------------ orchestrator -- */

  suite.group('Orchestrator');

  const enabledConfig = () => resolveAiConfig(allOn());

  await testAsync('a valid request returns a normalized response', async () => {
    const result = await orchestrator.run(
      { mode: 'screening', message: 'Architecture test' },
      { user: USER, config: enabledConfig() }
    );

    assert.strictEqual(result.mode, 'screening');
    assert.strictEqual(result.content, MODE_CONTENT.screening);
    assert.strictEqual(result.provider, 'mock');
    assert.strictEqual(result.model, 'mock-v1');
    assert.strictEqual(result.usage.totalTokens, 0);
    assert.strictEqual(result.usage.costUsd, 0);
    assert.ok(typeof result.requestId === 'string' && result.requestId.length > 0);
    assert.ok(Number.isFinite(result.durationMs) && result.durationMs >= 0);
  });

  await testAsync('every enabled mode runs end to end', async () => {
    for (const id of AGENT_MODE_IDS) {
      const result = await orchestrator.run(
        { mode: id, message: 'test' },
        { user: USER, config: enabledConfig() }
      );
      assert.strictEqual(result.mode, id);
      assert.ok(typeof result.content === 'string' && result.content.length > 0);
    }
  });

  await testAsync('the response exposes only the documented fields', async () => {
    const result = await orchestrator.run(
      { mode: 'insights', message: 'test' },
      { user: USER, config: enabledConfig() }
    );
    assert.deepStrictEqual(Object.keys(result).sort(), [
      'content',
      'durationMs',
      'mode',
      'model',
      'provider',
      'requestId',
      'structuredData',
      'usage'
    ]);
  });

  await testAsync('AI disabled blocks every mode with AI_DISABLED', async () => {
    const config = resolveAiConfig(allOn({ AI_ENABLED: 'false' }));
    for (const id of AGENT_MODE_IDS) {
      const error = await captureError(() => orchestrator.run({ mode: id, message: 'test' }, { user: USER, config }));
      assert.ok(error instanceof AiError, `${id} should throw an AiError`);
      assert.strictEqual(error.code, 'AI_DISABLED', `${id} code`);
      assert.strictEqual(error.statusCode, AI_ERROR_CODES.AI_DISABLED);
    }
  });

  await testAsync('AI disabled is reported before the mode is even examined', async () => {
    const config = resolveAiConfig(allOn({ AI_ENABLED: 'false' }));
    const error = await captureError(() =>
      orchestrator.run({ mode: 'not-a-real-mode', message: 'test' }, { user: USER, config })
    );
    assert.strictEqual(error.code, 'AI_DISABLED', 'must not disclose the mode surface while off');
  });

  await testAsync('a disabled mode is refused with AI_MODE_DISABLED while others still run', async () => {
    for (const target of AGENT_MODE_IDS) {
      const config = resolveAiConfig(allOn({ [AGENT_MODES[target].flagKey]: 'false' }));

      const error = await captureError(() =>
        orchestrator.run({ mode: target, message: 'test' }, { user: USER, config })
      );
      assert.ok(error instanceof AiError, `${target} should throw`);
      assert.strictEqual(error.code, 'AI_MODE_DISABLED', `${target} code`);
      assert.ok(
        error.message.includes(AGENT_MODES[target].displayName),
        `message should name the mode: ${error.message}`
      );

      const other = AGENT_MODE_IDS.find((id) => id !== target);
      const ok = await orchestrator.run({ mode: other, message: 'test' }, { user: USER, config });
      assert.strictEqual(ok.mode, other, `${other} should still run`);
    }
  });

  await testAsync('an invalid mode is refused with AI_REQUEST_INVALID', async () => {
    for (const mode of ['nonsense', 'constructor', '__proto__', 'SCREENING', '', null, undefined, 42, {}]) {
      const error = await captureError(() =>
        orchestrator.run({ mode, message: 'test' }, { user: USER, config: enabledConfig() })
      );
      assert.ok(error instanceof AiError, `${JSON.stringify(mode)} should throw`);
      assert.strictEqual(error.code, 'AI_REQUEST_INVALID', `${JSON.stringify(mode)} code`);
    }
  });

  await testAsync('a missing, empty or oversized message is refused', async () => {
    for (const message of [undefined, null, '', '   ', 42, {}, 'x'.repeat(orchestrator.MAX_MESSAGE_LENGTH + 1)]) {
      const error = await captureError(() =>
        orchestrator.run({ mode: 'screening', message }, { user: USER, config: enabledConfig() })
      );
      assert.ok(error instanceof AiError, `${JSON.stringify(String(message).slice(0, 20))} should throw`);
      assert.strictEqual(error.code, 'AI_REQUEST_INVALID');
    }
  });

  await testAsync('an invalid context is refused before any provider runs', async () => {
    let providerCalled = false;
    const spy = new (class extends AIProvider {
      constructor() {
        super({ name: 'spy', model: 'spy-v1' });
      }
      async run() {
        providerCalled = true;
        return { mode: 'screening', content: 'x', provider: 'spy', model: 'spy-v1', usage: {} };
      }
    })();

    const error = await captureError(() =>
      orchestrator.run(
        { mode: 'screening', message: 'test', context: { jobId: 'not a valid id' } },
        { user: USER, config: enabledConfig(), provider: spy }
      )
    );
    assert.strictEqual(error.code, 'AI_REQUEST_INVALID');
    assert.strictEqual(providerCalled, false, 'provider must not be reached');
  });

  await testAsync('a misconfigured provider fails with AI_PROVIDER_INVALID', async () => {
    resetProviderCache();
    const error = await captureError(() =>
      orchestrator.run(
        { mode: 'screening', message: 'test' },
        { user: USER, config: resolveAiConfig(allOn({ AI_PROVIDER: 'anthropic' })) }
      )
    );
    assert.ok(error instanceof AiError);
    assert.strictEqual(error.code, 'AI_PROVIDER_INVALID');
  });

  await testAsync('a provider that throws surfaces as AI_PROVIDER_ERROR without leaking detail', async () => {
    const exploding = new (class extends AIProvider {
      constructor() {
        super({ name: 'exploding', model: 'boom-v1' });
      }
      async run() {
        throw new Error('vendor said: invalid api key sk-secret-123');
      }
    })();

    const error = await captureError(() =>
      orchestrator.run(
        { mode: 'screening', message: 'test' },
        { user: USER, config: enabledConfig(), provider: exploding }
      )
    );

    assert.ok(error instanceof AiError);
    assert.strictEqual(error.code, 'AI_PROVIDER_ERROR');
    assert.strictEqual(error.statusCode, AI_ERROR_CODES.AI_PROVIDER_ERROR);
    assert.ok(!/sk-secret-123/.test(error.message), `vendor detail leaked: ${error.message}`);
    assert.ok(!/invalid api key/i.test(error.message), error.message);
  });

  await testAsync('a malformed provider result is treated as a provider failure', async () => {
    const malformed = new (class extends AIProvider {
      constructor() {
        super({ name: 'malformed', model: 'v0' });
      }
      async run() {
        return { nonsense: true };
      }
    })();

    const error = await captureError(() =>
      orchestrator.run(
        { mode: 'screening', message: 'test' },
        { user: USER, config: enabledConfig(), provider: malformed }
      )
    );
    assert.strictEqual(error.code, 'AI_PROVIDER_ERROR');
  });

  await testAsync('a provider cannot widen the response or answer as another mode', async () => {
    const sneaky = new (class extends AIProvider {
      constructor() {
        super({ name: 'sneaky', model: 'v1' });
      }
      async run() {
        return {
          mode: 'assistant', // asked for screening
          content: 'ok',
          provider: 'sneaky',
          model: 'v1',
          usage: { promptTokens: -5, totalTokens: 'lots', costUsd: 12.5 },
          apiKey: 'sk-leaked',
          rawHttpResponse: { headers: { authorization: 'Bearer secret' } }
        };
      }
    })();

    const result = await orchestrator.run(
      { mode: 'screening', message: 'test' },
      { user: USER, config: enabledConfig(), provider: sneaky }
    );

    assert.strictEqual(result.mode, 'screening', 'orchestrator mode must win');
    assert.strictEqual(result.apiKey, undefined, 'extra provider fields must be dropped');
    assert.strictEqual(result.rawHttpResponse, undefined);
    assert.strictEqual(result.usage.promptTokens, 0, 'negative usage clamped');
    assert.strictEqual(result.usage.totalTokens, 0, 'non-numeric usage clamped');
    assert.strictEqual(result.usage.costUsd, 12.5, 'a real cost is reported honestly');
  });

  await testAsync('the orchestrator reaches no database and no HTTP client', async () => {
    // Structural check: nothing in the AI layer's own module graph pulls in Prisma
    // or the app's database config. Later phases add data access through tools,
    // and this test is what will notice if it lands in the orchestrator instead.
    const path = require('path');
    const aiDir = `${path.sep}ai${path.sep}`;
    const offenders = Object.keys(require.cache)
      .filter((file) => file.includes(aiDir))
      .flatMap((file) => {
        const mod = require.cache[file];
        return (mod.children || []).map((child) => ({ file, child: child.id }));
      })
      .filter(({ child }) => /prisma|config[\\/]prisma|axios|node-fetch|isomorphic-fetch/i.test(child));

    assert.deepStrictEqual(
      offenders.map((o) => `${path.basename(o.file)} -> ${o.child}`),
      [],
      'the AI layer must not depend on the database or an HTTP client in this phase'
    );
  });

  /* ------------------------------------------------------------ logging - */

  suite.group('Logging redaction');

  test('the logger refuses to emit prompts, resumes or credentials', () => {
    const captured = [];
    const originalLog = console.log;
    console.log = (line) => captured.push(line);
    try {
      require('../ai/logging/aiLogger').logAiRun({
        requestId: 'req-1',
        mode: 'screening',
        provider: 'mock',
        status: 'SUCCESS',
        durationMs: 3,
        userId: 'user-1',
        messageLength: 42,
        // None of these should ever appear; passed deliberately.
        message: 'SENSITIVE-PROMPT-TEXT',
        resumeText: 'SENSITIVE-RESUME',
        apiKey: 'sk-secret'
      });
    } finally {
      console.log = originalLog;
    }

    assert.strictEqual(captured.length, 1);
    const line = captured[0];
    assert.ok(/requestId=req-1/.test(line), line);
    assert.ok(/mode=screening/.test(line), line);
    assert.ok(/provider=mock/.test(line), line);
    assert.ok(/status=SUCCESS/.test(line), line);
    assert.ok(/messageLength=42/.test(line), line);
    assert.ok(!/SENSITIVE-PROMPT-TEXT/.test(line), 'prompt leaked');
    assert.ok(!/SENSITIVE-RESUME/.test(line), 'resume leaked');
    assert.ok(!/sk-secret/.test(line), 'credential leaked');
  });

  test('the forbidden-key list covers prompts, resumes and credentials', () => {
    for (const key of ['message', 'resumetext', 'apikey', 'token', 'password', 'cookie']) {
      assert.ok(FORBIDDEN_KEYS.includes(key), `${key} should be redacted`);
    }
  });

  test('a newline in a logged value cannot forge a second log line', () => {
    const captured = [];
    const originalLog = console.log;
    console.log = (line) => captured.push(line);
    try {
      require('../ai/logging/aiLogger').logAiRun({
        requestId: 'req-1\n[AI] status=SUCCESS forged=yes',
        mode: 'screening',
        provider: 'mock',
        status: 'SUCCESS',
        durationMs: 1
      });
    } finally {
      console.log = originalLog;
    }
    assert.strictEqual(captured.length, 1);
    assert.ok(!captured[0].includes('\n'), 'newline survived into the log line');
  });

  const { failed } = suite.summary();
  process.exit(failed > 0 ? 1 : 0);
};

run();
