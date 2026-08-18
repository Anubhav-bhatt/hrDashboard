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
const SUPPORTED_PROVIDERS = Object.freeze(['mock']);

/**
 * Providers we intend to support but have not implemented. Naming them lets the
 * error message say "not implemented yet" instead of "unknown", while still
 * refusing to run — configuring one must never silently fall through to a
 * different provider, least of all a paid one.
 */
const KNOWN_UNIMPLEMENTED_PROVIDERS = Object.freeze(['openai', 'anthropic', 'claude', 'gemini', 'google']);

const DEFAULT_PROVIDER = 'mock';

const TRUTHY = Object.freeze(['true', '1', 'yes', 'on', 'enabled']);
const FALSY = Object.freeze(['false', '0', 'no', 'off', 'disabled', '']);

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
 * @typedef {Object} AiConfig
 * @property {boolean} enabled Master switch. When false every mode is off.
 * @property {string} provider Raw configured provider name, lower-cased.
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

  return Object.freeze({
    enabled,
    provider,
    writeActionsEnabled: parseFlag(env.AI_WRITE_ACTIONS_ENABLED, false, 'AI_WRITE_ACTIONS_ENABLED', warnings),
    modes: Object.freeze(modes),
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
  providerSupported: SUPPORTED_PROVIDERS.includes(config.provider),
  writeActionsEnabled: config.writeActionsEnabled,
  modes: { ...config.modes }
});

module.exports = {
  SUPPORTED_PROVIDERS,
  KNOWN_UNIMPLEMENTED_PROVIDERS,
  DEFAULT_PROVIDER,
  resolveAiConfig,
  isModeEnabled,
  describeAiConfig
};
