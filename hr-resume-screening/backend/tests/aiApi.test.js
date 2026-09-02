/**
 * POST /api/ai/run integration tests.
 *
 *   npm run test:ai:api
 *
 * Boots the real Express app in-process against the configured database, so the
 * route is exercised through the same authentication middleware, body parsing and
 * error handling as every other endpoint.
 *
 * AI flags are read fresh on each request by design, so these tests flip the real
 * environment variables between calls rather than mocking configuration — what is
 * verified here is the behaviour an operator would actually get from setting them.
 * The original environment is restored in teardown.
 */
require('dotenv').config();
const http = require('http');
const { createSuite, assert } = require('./harness');

const prisma = require('../config/prisma');
const app = require('../server');
const { hashPassword } = require('../services/authService');
const { MODE_CONTENT } = require('../ai/providers/MockAIProvider');
const { AGENT_MODES, AGENT_MODE_IDS } = require('../ai/modes/agentModes');

const suite = createSuite('AI API — POST /api/ai/run');
const { testAsync } = suite;

const TEST_PREFIX = 'aiapitest';
const TEST_EMAIL = `${TEST_PREFIX}.recruiter@example.invalid`;
const TEST_PASSWORD = 'AiIntegrationTest123!';

let server;
let baseUrl;
let sessionCookie = '';
const created = { userIds: [], jobIds: [] };

/** Every AI variable this suite manipulates, captured so it can be put back. */
const AI_ENV_KEYS = [
  'AI_ENABLED',
  'AI_PROVIDER',
  'AI_WRITE_ACTIONS_ENABLED',
  ...AGENT_MODE_IDS.map((id) => AGENT_MODES[id].flagKey)
];
const originalEnv = {};

/* ------------------------------------------------------------- helpers ---- */

const request = async (method, path, { body, cookie, headers = {} } = {}) => {
  const options = { method, headers: { ...headers } };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  if (cookie) options.headers.Cookie = cookie;

  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { parseError: true, text: text.slice(0, 200) };
  }
  return { status: response.status, body: json };
};

const authed = (method, path, options = {}) => request(method, path, { ...options, cookie: sessionCookie });

/** Applies AI environment state for the next request. */
const setAiEnv = (values) => {
  for (const key of AI_ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
};

/** AI on with every mode on. */
const allModesOn = (overrides = {}) => ({
  AI_ENABLED: 'true',
  AI_PROVIDER: 'mock',
  ...Object.fromEntries(AGENT_MODE_IDS.map((id) => [AGENT_MODES[id].flagKey, 'true'])),
  ...overrides
});

/* --------------------------------------------------------------- setup ---- */

const setup = async () => {
  for (const key of AI_ENV_KEYS) originalEnv[key] = process.env[key];

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { passwordHash: await hashPassword(TEST_PASSWORD), isActive: true },
    create: {
      email: TEST_EMAIL,
      passwordHash: await hashPassword(TEST_PASSWORD),
      name: 'AI Integration Recruiter',
      role: 'RECRUITER'
    }
  });
  created.userIds.push(user.id);

  const job = await prisma.job.create({
    data: {
      title: `${TEST_PREFIX} React Developer`,
      jdFileName: 'ai-jd.txt',
      jdMimeType: 'text/plain',
      jdText: 'A job used to verify the AI route does not disturb existing endpoints.',
      requiredSkills: ['React'],
      preferredSkills: [],
      roleKeywords: [],
      minimumExperience: 0,
      preferredEducation: []
    }
  });
  created.jobIds.push(job.id);

  // One sign-in; the cookie is read back the same way a browser would.
  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });
  if (login.status !== 200) throw new Error(`Test login failed with ${login.status}`);

  const setCookie = login.headers.get('set-cookie');
  if (!setCookie) throw new Error('Test login issued no session cookie');
  sessionCookie = setCookie.split(';')[0];

  return { job };
};

const teardown = async () => {
  for (const key of AI_ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  await prisma.job.deleteMany({ where: { id: { in: created.jobIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
};

/* ---------------------------------------------------------------- tests --- */

const run = async () => {
  const { job } = await setup();

  /* ------------------------------------------------------ authentication - */

  suite.group('Authentication');

  await testAsync('the AI route requires a session, exactly like every other data route', async () => {
    setAiEnv(allModesOn());
    const res = await request('POST', '/ai/run', { body: { mode: 'screening', message: 'test' } });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.code, 'AUTH_REQUIRED');
  });

  await testAsync('an unauthenticated AI request is refused even before flags are considered', async () => {
    setAiEnv({ AI_ENABLED: 'false' });
    const res = await request('POST', '/ai/run', { body: { mode: 'screening', message: 'test' } });
    assert.strictEqual(res.status, 401, 'authentication comes first');
  });

  await testAsync('a forged session cookie is refused', async () => {
    setAiEnv(allModesOn());
    const res = await request('POST', '/ai/run', {
      body: { mode: 'screening', message: 'test' },
      cookie: 'hr_session=not.a.real.token'
    });
    assert.strictEqual(res.status, 401);
  });

  /* --------------------------------------------------------- AI disabled - */

  suite.group('AI disabled');

  await testAsync('AI_ENABLED=false returns a controlled AI_DISABLED response', async () => {
    setAiEnv({ AI_ENABLED: 'false', AI_PROVIDER: 'mock' });
    const res = await authed('POST', '/ai/run', { body: { mode: 'screening', message: 'test' } });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.code, 'AI_DISABLED');
    assert.ok(typeof res.body.message === 'string' && res.body.message.length > 0);
    assert.strictEqual(res.body.stack, undefined, 'no stack trace may reach a client');
  });

  await testAsync('an absent AI configuration behaves as disabled', async () => {
    setAiEnv({});
    const res = await authed('POST', '/ai/run', { body: { mode: 'screening', message: 'test' } });
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.code, 'AI_DISABLED');
  });

  await testAsync('mode flags alone cannot enable AI without the master switch', async () => {
    setAiEnv(allModesOn({ AI_ENABLED: 'false' }));
    for (const id of AGENT_MODE_IDS) {
      const res = await authed('POST', '/ai/run', { body: { mode: id, message: 'test' } });
      assert.strictEqual(res.body.code, 'AI_DISABLED', `${id} must stay disabled`);
    }
  });

  /* --------------------------------------------------------- mode flags -- */

  suite.group('Per-mode feature flags');

  await testAsync('a mode whose flag is off returns AI_MODE_DISABLED', async () => {
    setAiEnv({ AI_ENABLED: 'true', AI_PROVIDER: 'mock', AI_SCREENING_ENABLED: 'true' });
    const res = await authed('POST', '/ai/run', { body: { mode: 'ranking', message: 'test' } });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.code, 'AI_MODE_DISABLED');
    assert.ok(/Ranking Agent/.test(res.body.message), res.body.message);
  });

  await testAsync('each mode is independently gated over HTTP', async () => {
    for (const target of AGENT_MODE_IDS) {
      setAiEnv({ AI_ENABLED: 'true', AI_PROVIDER: 'mock', [AGENT_MODES[target].flagKey]: 'true' });

      const enabled = await authed('POST', '/ai/run', { body: { mode: target, message: 'test' } });
      assert.strictEqual(enabled.status, 200, `${target} should be allowed`);
      assert.strictEqual(enabled.body.data.mode, target);

      for (const other of AGENT_MODE_IDS.filter((id) => id !== target)) {
        const blocked = await authed('POST', '/ai/run', { body: { mode: other, message: 'test' } });
        assert.strictEqual(blocked.body.code, 'AI_MODE_DISABLED', `${other} should be blocked`);
      }
    }
  });

  /* ------------------------------------------------------ valid requests - */

  suite.group('Valid mock request');

  await testAsync('the documented request returns the documented response', async () => {
    setAiEnv({ AI_ENABLED: 'true', AI_SCREENING_ENABLED: 'true', AI_PROVIDER: 'mock' });
    const res = await authed('POST', '/ai/run', {
      body: { mode: 'screening', message: 'Architecture test', context: {} }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.mode, 'screening');
    assert.strictEqual(res.body.data.content, MODE_CONTENT.screening);
    assert.strictEqual(res.body.data.provider, 'mock');
    assert.strictEqual(res.body.data.model, 'mock-v1');
  });

  await testAsync('usage and cost are reported as zero', async () => {
    setAiEnv(allModesOn());
    const res = await authed('POST', '/ai/run', { body: { mode: 'insights', message: 'test' } });
    assert.deepStrictEqual(res.body.data.usage, {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0
    });
  });

  await testAsync('repeated identical requests return identical content', async () => {
    setAiEnv(allModesOn());
    const body = { mode: 'comparison', message: 'same input', context: { candidateIds: ['c1', 'c2'] } };
    const first = await authed('POST', '/ai/run', { body });
    const second = await authed('POST', '/ai/run', { body });

    assert.strictEqual(first.body.data.content, second.body.data.content);
    assert.deepStrictEqual(first.body.data.structuredData, second.body.data.structuredData);
    // Only the correlation id and timing differ between two runs.
    assert.notStrictEqual(first.body.data.requestId, second.body.data.requestId);
  });

  await testAsync('a validated context is accepted and reflected as identifiers only', async () => {
    setAiEnv(allModesOn());
    const res = await authed('POST', '/ai/run', {
      body: {
        mode: 'ranking',
        message: 'rank these',
        context: { jobId: job.id, candidateIds: ['c1', 'c2'], filters: { minScore: 80 } }
      }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.structuredData.jobId, job.id);
    assert.strictEqual(res.body.data.structuredData.candidateCount, 2);
    assert.deepStrictEqual(res.body.data.structuredData.filterKeys, ['minScore']);
  });

  await testAsync('the response never carries a secret or an internal field', async () => {
    setAiEnv(allModesOn());
    const res = await authed('POST', '/ai/run', { body: { mode: 'assistant', message: 'test' } });
    const serialized = JSON.stringify(res.body);

    for (const forbidden of ['apiKey', 'api_key', 'JWT_SECRET', 'DATABASE_URL', 'passwordHash', 'sk-']) {
      assert.ok(!serialized.includes(forbidden), `response contained ${forbidden}`);
    }
  });

  /* ------------------------------------------------------- invalid input - */

  suite.group('Input validation');

  await testAsync('an unknown mode is refused with AI_REQUEST_INVALID', async () => {
    setAiEnv(allModesOn());
    for (const mode of ['nonsense', 'constructor', '__proto__', 'SCREENING', '']) {
      const res = await authed('POST', '/ai/run', { body: { mode, message: 'test' } });
      assert.strictEqual(res.status, 400, `mode ${JSON.stringify(mode)}`);
      assert.strictEqual(res.body.code, 'AI_REQUEST_INVALID');
    }
  });

  await testAsync('a missing or empty message is refused', async () => {
    setAiEnv(allModesOn());
    for (const body of [{ mode: 'screening' }, { mode: 'screening', message: '' }, { mode: 'screening', message: 42 }]) {
      const res = await authed('POST', '/ai/run', { body });
      assert.strictEqual(res.status, 400, JSON.stringify(body));
      assert.strictEqual(res.body.code, 'AI_REQUEST_INVALID');
    }
  });

  await testAsync('a JSON array body is refused by the controller', async () => {
    setAiEnv(allModesOn());
    const res = await authed('POST', '/ai/run', { body: '[]' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'AI_REQUEST_INVALID');
  });

  await testAsync('a bare primitive body is refused by the existing JSON parser', async () => {
    setAiEnv(allModesOn());
    // express.json() runs in strict mode, so a top-level scalar never reaches the
    // controller. It is still a controlled 400 from the handler the whole app
    // already uses — the AI route adds no parsing of its own.
    for (const body of ['"a string"', '42', 'null']) {
      const res = await authed('POST', '/ai/run', { body });
      assert.strictEqual(res.status, 400, body);
      assert.strictEqual(res.body.code, 'MALFORMED_JSON', body);
      assert.strictEqual(res.body.stack, undefined, 'no stack trace may reach a client');
    }
  });

  await testAsync('malformed JSON is handled by the existing global handler', async () => {
    setAiEnv(allModesOn());
    const res = await authed('POST', '/ai/run', { body: '{ "mode": ' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'MALFORMED_JSON', 'existing behaviour must be reused, not replaced');
  });

  await testAsync('a client cannot supply its own identity in context', async () => {
    setAiEnv(allModesOn());
    for (const key of ['userId', 'userRole', 'requestId']) {
      const res = await authed('POST', '/ai/run', {
        body: { mode: 'screening', message: 'test', context: { [key]: 'ADMIN' } }
      });
      assert.strictEqual(res.status, 400, key);
      assert.strictEqual(res.body.code, 'AI_REQUEST_INVALID');
    }
  });

  await testAsync('a record cannot be smuggled in through context', async () => {
    setAiEnv(allModesOn());
    const res = await authed('POST', '/ai/run', {
      body: {
        mode: 'screening',
        message: 'test',
        context: { filters: { candidate: { name: 'Rahul', resumeText: 'a whole resume' } } }
      }
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'AI_REQUEST_INVALID');
  });

  await testAsync('an unsupported context field is refused', async () => {
    setAiEnv(allModesOn());
    const res = await authed('POST', '/ai/run', {
      body: { mode: 'screening', message: 'test', context: { resumeText: 'x' } }
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'AI_REQUEST_INVALID');
  });

  await testAsync('a malicious-looking identifier is refused rather than passed on', async () => {
    setAiEnv(allModesOn());
    for (const jobId of ["'; DROP TABLE \"Job\"; --", '../../etc/passwd', '<script>alert(1)</script>']) {
      const res = await authed('POST', '/ai/run', {
        body: { mode: 'screening', message: 'test', context: { jobId } }
      });
      assert.strictEqual(res.status, 400, jobId);
      assert.strictEqual(res.body.code, 'AI_REQUEST_INVALID');
    }
  });

  /* ------------------------------------------------ provider misconfig --- */

  suite.group('Provider misconfiguration');

  await testAsync('a paid provider is refused over HTTP with no fallback', async () => {
    setAiEnv(allModesOn({ AI_PROVIDER: 'anthropic' }));
    const res = await authed('POST', '/ai/run', { body: { mode: 'screening', message: 'test' } });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body.code, 'AI_PROVIDER_INVALID');
    assert.ok(!/mock/.test(res.body.data || ''), 'must not have silently used the mock provider');
  });

  await testAsync('an unknown provider is refused', async () => {
    setAiEnv(allModesOn({ AI_PROVIDER: 'no-such-provider' }));
    const res = await authed('POST', '/ai/run', { body: { mode: 'screening', message: 'test' } });
    assert.strictEqual(res.body.code, 'AI_PROVIDER_INVALID');
  });

  /* ------------------------------------------------------------ methods -- */

  suite.group('Route surface');

  await testAsync('only POST is accepted on /ai/run', async () => {
    setAiEnv(allModesOn());
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const res = await authed(method, '/ai/run');
      assert.strictEqual(res.status, 404, `${method} should not be routed`);
    }
  });

  await testAsync('no other AI path accepts a POST', async () => {
    setAiEnv(allModesOn());
    // /ai/config exists but is read-only, so it must reject a POST like any
    // unregistered path. Nothing else under /ai is writable at all.
    for (const path of ['/ai', '/ai/', '/ai/config', '/ai/modes', '/ai/providers', '/ai/tools']) {
      const res = await authed('POST', path, { body: { mode: 'screening', message: 'test' } });
      assert.strictEqual(res.status, 404, `POST ${path} should not exist`);
    }
  });

  await testAsync('the tool registry is not reachable over HTTP', async () => {
    setAiEnv(allModesOn());
    // The tool layer is backend-only by design: an agent reaches it in-process,
    // a browser must not reach it at all.
    for (const path of ['/ai/tools', '/ai/tools/getCandidates', '/ai/registry', '/ai/execute']) {
      const res = await authed('GET', path);
      assert.strictEqual(res.status, 404, `GET ${path} should not exist`);
    }
  });

  /* --------------------------------------------------------- regression -- */

  suite.group('Existing routes are unaffected');

  await testAsync('protected routes remain protected while AI is enabled', async () => {
    setAiEnv(allModesOn());
    for (const path of ['/candidates', '/jobs', '/dashboard/overview', `/jobs/${job.id}`]) {
      const res = await request('GET', path);
      assert.strictEqual(res.status, 401, `${path} must still require a session`);
    }
  });

  await testAsync('existing endpoints behave identically with AI on and with AI off', async () => {
    setAiEnv({ AI_ENABLED: 'false' });
    const jobsOff = await authed('GET', '/jobs');
    const dashOff = await authed('GET', '/dashboard/overview');

    setAiEnv(allModesOn());
    const jobsOn = await authed('GET', '/jobs');
    const dashOn = await authed('GET', '/dashboard/overview');

    assert.strictEqual(jobsOff.status, 200);
    assert.strictEqual(jobsOn.status, 200);
    assert.strictEqual(jobsOff.body.data.length, jobsOn.body.data.length, 'job listing changed');
    assert.strictEqual(
      dashOff.body.data.metrics.totalCandidates,
      dashOn.body.data.metrics.totalCandidates,
      'dashboard metrics changed'
    );
    assert.strictEqual(
      dashOff.body.data.strongMatchThreshold,
      dashOn.body.data.strongMatchThreshold,
      'scoring threshold changed'
    );
  });

  await testAsync('an AI failure does not disturb a subsequent ordinary request', async () => {
    setAiEnv(allModesOn({ AI_PROVIDER: 'anthropic' }));
    const failed = await authed('POST', '/ai/run', { body: { mode: 'screening', message: 'test' } });
    assert.strictEqual(failed.body.code, 'AI_PROVIDER_INVALID');

    const healthy = await authed('GET', '/jobs');
    assert.strictEqual(healthy.status, 200, 'the app must still be serving normally');

    const health = await request('GET', '/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.success, true);
  });

  await testAsync('the health endpoint reports nothing about AI', async () => {
    setAiEnv(allModesOn());
    const res = await request('GET', '/health');
    assert.ok(!/ai/i.test(JSON.stringify(res.body).replace(/database/gi, '')), JSON.stringify(res.body));
  });

  /* ------------------------------------------------- GET /api/ai/config --- */

  suite.group('Feature-flag endpoint (GET /api/ai/config)');

  await testAsync('the config endpoint requires a session', async () => {
    setAiEnv(allModesOn());
    const res = await request('GET', '/ai/config');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.code, 'AUTH_REQUIRED');
  });

  await testAsync('with AI off it reports every mode off', async () => {
    setAiEnv({ AI_ENABLED: 'false' });
    const res = await authed('GET', '/ai/config');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.enabled, false);
    for (const id of AGENT_MODE_IDS) {
      assert.strictEqual(res.body.data.modes[id], false, `${id} should be off`);
    }
  });

  await testAsync('the master switch overrides an individually enabled mode', async () => {
    // A mode flag on while AI_ENABLED is off must not report the mode usable —
    // the UI would offer a route the orchestrator refuses.
    setAiEnv({ AI_ENABLED: 'false', AI_RANKING_ENABLED: 'true' });
    const res = await authed('GET', '/ai/config');

    assert.strictEqual(res.body.data.enabled, false);
    assert.strictEqual(res.body.data.modes.ranking, false);
  });

  await testAsync('individual mode flags are reported independently', async () => {
    setAiEnv({
      AI_ENABLED: 'true',
      AI_PROVIDER: 'mock',
      AI_ASSISTANT_ENABLED: 'true',
      AI_RANKING_ENABLED: 'false',
      AI_SCREENING_ENABLED: 'true'
    });
    const res = await authed('GET', '/ai/config');

    assert.strictEqual(res.body.data.enabled, true);
    assert.strictEqual(res.body.data.modes.assistant, true);
    assert.strictEqual(res.body.data.modes.screening, true);
    assert.strictEqual(res.body.data.modes.ranking, false, 'ranking was explicitly disabled');
    assert.strictEqual(res.body.data.modes.comparison, false, 'an unset flag defaults to off');
  });

  await testAsync('every known mode is always present as a boolean', async () => {
    setAiEnv(allModesOn());
    const res = await authed('GET', '/ai/config');

    const keys = Object.keys(res.body.data.modes).sort();
    assert.deepStrictEqual(keys, [...AGENT_MODE_IDS].sort(), 'mode list drifted from the backend authority');
    for (const id of AGENT_MODE_IDS) {
      assert.strictEqual(typeof res.body.data.modes[id], 'boolean');
    }
  });

  await testAsync('the response carries booleans only — no provider, limits or secrets', async () => {
    setAiEnv(allModesOn());
    const res = await authed('GET', '/ai/config');

    // The browser is told what is on, and nothing about how it is configured.
    assert.deepStrictEqual(Object.keys(res.body.data).sort(), ['enabled', 'modes']);

    const serialized = JSON.stringify(res.body);
    for (const forbidden of ['mock', 'provider', 'limit', 'apiKey', 'key', 'openai', 'anthropic']) {
      assert.ok(
        !new RegExp(forbidden, 'i').test(serialized),
        `"${forbidden}" must not appear in the client payload: ${serialized}`
      );
    }
  });

  const { failed } = suite.summary();
  await teardown();
  process.exit(failed > 0 ? 1 : 0);
};

run().catch(async (error) => {
  console.error('\n  SUITE ERROR:', error.message);
  console.error(error.stack);
  try {
    await teardown();
  } catch {
    /* teardown is best effort */
  }
  process.exit(1);
});
