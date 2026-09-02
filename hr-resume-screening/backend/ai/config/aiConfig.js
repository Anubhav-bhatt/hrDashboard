/**
 * The single source of truth for AI configuration.
 *
 * Every AI flag is parsed here and nowhere else, so there is exactly one
 * definition of what "enabled" means. No other file in the AI layer reads
 * `process.env`.
 *
 * Configuration is resolved per request rather than cached at module load. Two
 * reasons: a feature flag that needs a restart to take effect is not much of a
 * kill switch, and resolving fresh keeps the tests honest — they flip a variable
 * and observe the real code path rather than a re-implementation. The work is a
 * handful of string comparisons, which is nothing next to a provider call.
 *
 * Defaults are chosen so that a deployment which never sets any of these — every
 * deployment that exists today — behaves exactly as it did before the AI layer
 * was added: everything off.
 */
const { AGENT_MODES, AGENT_MODE_IDS } = require('../modes/agentModes');

/** Providers this build can actually construct. */
const SUPPORTED_PROVIDERS = Object.freeze(['mock', 'openai']);

/**
 * Providers we intend to support but have not implemented. Naming them lets the
 * error message say "not implemented yet" instead of "unknown", while still
 * refusing to run — configuring one must never silently fall through to a
 * different provider, least of all a paid one.
 */
const KNOWN_UNIMPLEMENTED_PROVIDERS = Object.freeze(['anthropic', 'claude', 'gemini', 'google']);

const DEFAULT_PROVIDER = 'mock';

const TRUTHY = Object.freeze(['true', '1', 'yes', 'on', 'enabled']);
const FALSY = Object.freeze(['false', '0', 'no', 'off', 'disabled', '']);

/**
 * Retrieval ceilings for the tool layer.
 *
 * These exist so a single agent request can never pull the whole candidate table.
 * They are enforced today even though the provider is a mock, because the point
 * is that the limit is already in place before anything expensive is connected.
 */
const LIMIT_DEFAULTS = Object.freeze({
  AI_TOOL_DEFAULT_CANDIDATE_LIMIT: 50,
  AI_TOOL_MAX_CANDIDATE_LIMIT: 200,
  AI_TOOL_DEFAULT_JOB_LIMIT: 25,
  AI_TOOL_MAX_JOB_LIMIT: 100,
  AI_REQUEST_TIMEOUT_MS: 15000,
  AI_MAX_OUTPUT_TOKENS: 500
});

/**
 * Parses a positive-integer limit.
 *
 * A value that is absent, unparseable, zero, negative or fractional falls back to
 * the documented default and is reported. Guessing at a malformed ceiling is the
 * one failure mode that matters here: reading `AI_TOOL_MAX_CANDIDATE_LIMIT=2OO`
 * as `NaN` and then as "no limit" is exactly the accident these bounds exist to
 * prevent.
 */
const parseLimit = (raw, key, warnings) => {
  const fallback = LIMIT_DEFAULTS[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;

  const parsed = Number(String(raw).trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    warnings.push(`${key} must be a positive integer ("${raw}"); using the default of ${fallback}.`);
    return fallback;
  }
  return parsed;
};

/**
 * Parses a boolean flag.
 *
 * An unset flag takes `fallback`. A value we do not recognise resolves to
 * `false` and is reported as a warning — for a feature flag, refusing to guess
 * is the safe failure: a typo such as `AI_ENABLED=ture` leaves AI off rather
 * than accidentally switching it on.
 *
 * @param {string|undefined} raw
 * @param {boolean} fallback
 * @param {string} key Flag name, used in the warning text.
 * @param {string[]} warnings Collector, appended to in place.
 */
const parseFlag = (raw, fallback, key, warnings) => {
  if (raw === undefined || raw === null) return fallback;

  const normalized = String(raw).trim().toLowerCase();
  if (TRUTHY.includes(normalized)) return true;
  if (FALSY.includes(normalized)) return false;

  warnings.push(`${key} is not a recognised boolean ("${normalized}"); treating it as false.`);
  return false;
};

/**
 * Parses the provider execution mode ('mock' | 'shadow' | 'live').
 */
const parseProviderMode = (raw, fallback = 'mock') => {
  if (!raw || typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['mock', 'shadow', 'live'].includes(normalized)) return normalized;
  return fallback;
};

/**
 * @typedef {Object} AiConfig
 * @property {boolean} enabled Master switch. When false every mode is off.
 * @property {string} provider Raw configured provider name, lower-cased.
 * @property {string} providerMode Execution mode: 'mock' | 'shadow' | 'live'.
 * @property {boolean} realProviderEnabled Rollout guard for live provider interpretation.
 * @property {boolean} writeActionsEnabled Whether agents may ever mutate data.
 * @property {Object<string, boolean>} modes Per-mode flag state, before the
 *   master switch is applied.
 * @property {string[]} warnings Non-fatal configuration problems.
 */

/**
 * Resolves AI configuration from an environment bag.
 *
 * @param {Object<string, string|undefined>} [env=process.env]
 * @returns {Readonly<AiConfig>}
 */
const resolveAiConfig = (env = process.env) => {
  const warnings = [];

  const enabled = parseFlag(env.AI_ENABLED, false, 'AI_ENABLED', warnings);

  // Built with a null prototype so a mode lookup can never resolve an inherited
  // member such as `constructor`.
  const modes = Object.create(null);
  for (const id of AGENT_MODE_IDS) {
    const { flagKey } = AGENT_MODES[id];
    modes[id] = parseFlag(env[flagKey], false, flagKey, warnings);
  }

  const rawProvider = env.AI_PROVIDER;
  const provider =
    rawProvider === undefined || rawProvider === null || String(rawProvider).trim() === ''
      ? DEFAULT_PROVIDER
      : String(rawProvider).trim().toLowerCase();

  const providerMode = parseProviderMode(env.AI_PROVIDER_MODE, 'mock');
  const realProviderEnabled = parseFlag(env.AI_REAL_PROVIDER_ENABLED, false, 'AI_REAL_PROVIDER_ENABLED', warnings);

  // A default above its own maximum is contradictory; the smaller of the two is
  // the only safe reading, and the operator is told which one was applied.
  const clampDefault = (defaultValue, maxValue, defaultKey, maxKey) => {
    if (defaultValue <= maxValue) return defaultValue;
    warnings.push(`${defaultKey} (${defaultValue}) exceeds ${maxKey} (${maxValue}); using ${maxValue}.`);
    return maxValue;
  };

  const maxCandidateLimit = parseLimit(env.AI_TOOL_MAX_CANDIDATE_LIMIT, 'AI_TOOL_MAX_CANDIDATE_LIMIT', warnings);
  const maxJobLimit = parseLimit(env.AI_TOOL_MAX_JOB_LIMIT, 'AI_TOOL_MAX_JOB_LIMIT', warnings);

  const limits = Object.freeze({
    defaultCandidateLimit: clampDefault(
      parseLimit(env.AI_TOOL_DEFAULT_CANDIDATE_LIMIT, 'AI_TOOL_DEFAULT_CANDIDATE_LIMIT', warnings),
      maxCandidateLimit,
      'AI_TOOL_DEFAULT_CANDIDATE_LIMIT',
      'AI_TOOL_MAX_CANDIDATE_LIMIT'
    ),
    maxCandidateLimit,
    defaultJobLimit: clampDefault(
      parseLimit(env.AI_TOOL_DEFAULT_JOB_LIMIT, 'AI_TOOL_DEFAULT_JOB_LIMIT', warnings),
      maxJobLimit,
      'AI_TOOL_DEFAULT_JOB_LIMIT',
      'AI_TOOL_MAX_JOB_LIMIT'
    ),
    maxJobLimit
  });

  const requestTimeoutMs = parseLimit(env.AI_REQUEST_TIMEOUT_MS, 'AI_REQUEST_TIMEOUT_MS', warnings);
  const maxOutputTokens = parseLimit(env.AI_MAX_OUTPUT_TOKENS, 'AI_MAX_OUTPUT_TOKENS', warnings);
  const model = env.AI_MODEL || (provider === 'openai' ? 'gpt-4o-mini' : 'mock-v1');

  return Object.freeze({
    enabled,
    provider,
    providerMode,
    realProviderEnabled,
    writeActionsEnabled: parseFlag(env.AI_WRITE_ACTIONS_ENABLED, false, 'AI_WRITE_ACTIONS_ENABLED', warnings),
    modes: Object.freeze(modes),
    limits,
    requestTimeoutMs,
    maxOutputTokens,
    model,
    apiKey: env.OPENAI_API_KEY || null,
    warnings: Object.freeze(warnings)
  });
};

/**
 * Whether a specific mode may run: the master switch and the mode's own flag
 * must both be on.
 *
 * @param {AiConfig} config
 * @param {string} modeId
 */
const isModeEnabled = (config, modeId) =>
  Boolean(config && config.enabled && Object.prototype.hasOwnProperty.call(config.modes, modeId) && config.modes[modeId]);

/**
 * A summary safe to log or return to a signed-in recruiter.
 *
 * Contains flag states and a provider name only — there is nothing secret in
 * here, and there is nothing here that could become secret: no API keys are read
 * by this module, because the mock provider needs none.
 *
 * @param {AiConfig} config
 */
const describeAiConfig = (config) => ({
  enabled: config.enabled,
  provider: config.provider,
  providerMode: config.providerMode || 'mock',
  realProviderEnabled: Boolean(config.realProviderEnabled),
  providerSupported: SUPPORTED_PROVIDERS.includes(config.provider),
  writeActionsEnabled: config.writeActionsEnabled,
  modes: { ...config.modes },
  limits: { ...config.limits }
});

module.exports = {
  SUPPORTED_PROVIDERS,
  KNOWN_UNIMPLEMENTED_PROVIDERS,
  DEFAULT_PROVIDER,
  LIMIT_DEFAULTS,
  resolveAiConfig,
  isModeEnabled,
  describeAiConfig
};
