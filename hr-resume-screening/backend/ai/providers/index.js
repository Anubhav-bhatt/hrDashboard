/**
 * Provider resolution — the one place that decides which provider runs.
 *
 *     getAIProvider(config) -> config.provider -> 'mock' -> MockAIProvider
 *
 * The registry is a static Map of explicit factory functions. It is deliberately
 * not a dynamic `require()` built from a configuration string: that would turn an
 * environment variable into a module path and hand anyone who can set the
 * environment a way to load arbitrary code.
 *
 * An unsupported provider throws. It never falls back — silently substituting a
 * different provider for a misconfigured one is how a deployment ends up calling
 * a paid API it was never meant to touch.
 */
const {
  SUPPORTED_PROVIDERS,
  KNOWN_UNIMPLEMENTED_PROVIDERS,
  resolveAiConfig
} = require('../config/aiConfig');
const { aiProviderInvalid, AiError } = require('../errors/ai.errors');
const { MockAIProvider } = require('./MockAIProvider');

/**
 * Provider name -> factory. Adding a real vendor later means adding one entry
 * and one file under this directory; nothing outside `ai/providers/` changes.
 */
const PROVIDER_FACTORIES = new Map([['mock', () => new MockAIProvider()]]);

/**
 * Instances are created once and reused. Every provider here is stateless, and a
 * real vendor client will want its connection pool kept alive rather than rebuilt
 * per request.
 */
const instances = new Map();

/**
 * Resolves the configured provider.
 *
 * @param {import('../config/aiConfig').AiConfig} [config] Defaults to the live configuration.
 * @returns {import('./AIProvider').AIProvider}
 * @throws {AiError} AI_PROVIDER_INVALID when the configured provider cannot be built.
 */
const getAIProvider = (config = resolveAiConfig()) => {
  const name = config.provider;

  const factory = PROVIDER_FACTORIES.get(name);
  if (!factory) {
    // Distinguish "planned but not built yet" from "no idea what that is". Both
    // refuse to run; only the wording differs, so an operator who set
    // AI_PROVIDER=openai in this phase gets told why rather than guessing.
    if (KNOWN_UNIMPLEMENTED_PROVIDERS.includes(name)) {
      throw new AiError(
        'AI_PROVIDER_INVALID',
        `The AI provider "${name}" is not implemented in this build. Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}.`
      );
    }
    throw aiProviderInvalid(SUPPORTED_PROVIDERS);
  }

  if (!instances.has(name)) instances.set(name, factory());
  return instances.get(name);
};

/** Test seam: drops cached instances so a suite starts from a clean slate. */
const resetProviderCache = () => instances.clear();

module.exports = {
  getAIProvider,
  resetProviderCache,
  SUPPORTED_PROVIDERS
};
