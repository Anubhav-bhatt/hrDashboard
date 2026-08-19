/**
 * The orchestrator: the single entry point into the AI layer.
 *
 * Flow, in this order:
 *
 *     request
 *        -> AI_ENABLED
 *        -> requested mode is one of the five
 *        -> that mode's feature flag
 *        -> message and context validation
 *        -> resolve provider
 *        -> provider.run()
 *        -> normalize response
 *        -> result
 *
 * The master switch is checked first, before the mode is even looked at. That
 * ordering is intentional: when AI is off, a request naming a mode that does not
 * exist is answered with AI_DISABLED rather than "no such mode", so a disabled
 * installation does not describe its own feature surface to a caller.
 *
 * What this file deliberately cannot do, in this phase: query candidates or jobs,
 * score a resume, modify data, call a tool, touch the database, or make an
 * external request. Its entire import list is configuration, mode metadata, the
 * provider registry, context validation, errors and the logger — there is no
 * Prisma client and no HTTP client in reach. Those capabilities arrive in later
 * phases, behind controlled tools.
 */
const crypto = require('crypto');
const { resolveAiConfig, isModeEnabled } = require('../config/aiConfig');
const { getAgentMode, isAgentMode, AGENT_MODE_IDS } = require('../modes/agentModes');
const { getAIProvider } = require('../providers');
const { normalizeAgentContext } = require('../context/AgentContext');
const { AiError, aiDisabled, aiModeDisabled, aiRequestInvalid, aiProviderError } = require('../errors/ai.errors');
const { logAiRun, logAiConfigWarnings } = require('../logging/aiLogger');
const { runScreeningAgent } = require('../modes/screening.agent');
const { runRankingAgent } = require('../modes/ranking.agent');
const { runComparisonAgent } = require('../modes/comparison.agent');

/**
 * Upper bound on a prompt. Generous for a recruiter's question and small enough
 * that the body limit already in front of it (`express.json({ limit: '1mb' })`)
 * is never the thing that decides.
 */
const MAX_MESSAGE_LENGTH = 8000;

/**
 * @param {unknown} message
 * @returns {string}
 */
const normalizeMessage = (message) => {
  if (typeof message !== 'string') {
    throw aiRequestInvalid('message is required and must be a string.');
  }
  const trimmed = message.trim();
  if (!trimmed) {
    throw aiRequestInvalid('message cannot be empty.');
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw aiRequestInvalid(`message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`);
  }
  return trimmed;
};

/**
 * Reshapes whatever a provider returned into exactly the response contract.
 *
 * Whitelisted field by field rather than spread, so a provider cannot widen the
 * public response — a vendor client that attached its raw HTTP response, or its
 * configuration, would otherwise have it forwarded straight to the client.
 *
 * @param {unknown} result
 * @param {string} mode
 * @returns {import('../types/ai.types').AIProviderResult}
 */
const normalizeProviderResult = (result, mode) => {
  if (!result || typeof result !== 'object') {
    throw new Error('Provider returned no result object.');
  }
  if (typeof result.content !== 'string' || !result.content) {
    throw new Error('Provider returned no content.');
  }
  if (typeof result.provider !== 'string' || typeof result.model !== 'string') {
    throw new Error('Provider did not identify itself.');
  }

  const usage = result.usage && typeof result.usage === 'object' ? result.usage : {};
  const count = (value) => (Number.isFinite(value) && value >= 0 ? value : 0);

  return {
    // The orchestrator's mode wins: a provider cannot answer as a different mode
    // than the one whose flag was checked.
    mode,
    content: result.content,
    structuredData:
      result.structuredData && typeof result.structuredData === 'object' ? result.structuredData : null,
    provider: result.provider,
    model: result.model,
    usage: {
      promptTokens: count(usage.promptTokens),
      completionTokens: count(usage.completionTokens),
      totalTokens: count(usage.totalTokens),
      costUsd: count(usage.costUsd)
    }
  };
};

/**
 * Runs one AI request.
 *
 * @param {Object} request
 * @param {string} request.mode
 * @param {string} request.message
 * @param {Object} [request.context]
 * @param {Object} [options]
 * @param {{id?: string, role?: string}|null} [options.user] Authenticated user.
 * @param {import('../config/aiConfig').AiConfig} [options.config] Injectable for tests.
 * @param {import('../providers/AIProvider').AIProvider} [options.provider] Injectable for tests.
 * @returns {Promise<import('../types/ai.types').AIResponse>}
 * @throws {AiError} Always an AiError — never a raw provider or validation error.
 */
const run = async ({ mode, message, context } = {}, { user = null, config, provider } = {}) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const userId = user && user.id ? user.id : null;

  const activeConfig = config || resolveAiConfig();
  logAiConfigWarnings(activeConfig.warnings, requestId);

  /**
   * Logs a turned-away request and returns the error to throw. Returning rather
   * than throwing keeps every exit from `run` a visible `throw` at the call site.
   *
   * @param {AiError} error
   * @returns {AiError}
   */
  const rejected = (error) => {
    logAiRun({
      requestId,
      mode: isAgentMode(mode) ? mode : 'unknown',
      provider: activeConfig.provider,
      status: 'REJECTED',
      durationMs: Date.now() - startedAt,
      userId,
      errorCode: error.code
    });
    return error;
  };

  // 1. Master switch.
  if (!activeConfig.enabled) throw rejected(aiDisabled());

  // 2. Requested mode must be one of the five.
  const agentMode = getAgentMode(mode);
  if (!agentMode) {
    throw rejected(aiRequestInvalid(`mode must be one of: ${AGENT_MODE_IDS.join(', ')}.`));
  }

  // 3. That mode's own flag.
  if (!isModeEnabled(activeConfig, agentMode.id)) {
    throw rejected(aiModeDisabled(agentMode.displayName));
  }

  // 4. Input validation.
  let normalizedMessage;
  let agentContext;
  try {
    normalizedMessage = normalizeMessage(message);
    agentContext = normalizeAgentContext(context, { user, requestId });
  } catch (error) {
    if (error instanceof AiError) throw rejected(error);
    throw error;
  }

  // 5. Provider resolution. A misconfigured provider is a rejection, not a
  //    failure — nothing was attempted.
  let activeProvider;
  try {
    activeProvider = provider || getAIProvider(activeConfig);
  } catch (error) {
    if (error instanceof AiError) throw rejected(error);
    throw error;
  }

  // 6. Execution. Any throw from a provider becomes AI_PROVIDER_ERROR, so a
  //    vendor's error text never reaches a client and an AI fault stays inside
  //    the AI layer.
  let result;
  try {
    let rawResult;
    if (agentMode.id === 'screening' && agentContext && agentContext.jobId) {
      rawResult = await runScreeningAgent({
        message: normalizedMessage,
        context: agentContext,
        provider: activeProvider,
        config: activeConfig
      });
    } else if (agentMode.id === 'ranking' && agentContext && agentContext.jobId) {
      rawResult = await runRankingAgent({
        message: normalizedMessage,
        context: agentContext,
        provider: activeProvider,
        config: activeConfig
      });
    } else if (agentMode.id === 'comparison' && agentContext && agentContext.jobId) {
      rawResult = await runComparisonAgent({
        message: normalizedMessage,
        context: agentContext,
        provider: activeProvider,
        config: activeConfig
      });
    } else {
      rawResult = await activeProvider.run({
        mode: agentMode.id,
        message: normalizedMessage,
        context: agentContext,
        metadata: { readOnly: agentMode.readOnly, writeActionsEnabled: activeConfig.writeActionsEnabled }
      });
    }

    result = normalizeProviderResult(rawResult, agentMode.id);
  } catch (error) {
    const wrapped = error instanceof AiError ? error : aiProviderError(error);
    logAiRun({
      requestId,
      mode: agentMode.id,
      provider: activeProvider.name || activeConfig.provider,
      status: 'FAILED',
      durationMs: Date.now() - startedAt,
      userId,
      errorCode: wrapped.code,
      messageLength: normalizedMessage.length
    });
    // Server-side only: the cause is useful for diagnosis and never returned.
    if (wrapped.cause) {
      console.error(`[AI] provider failure requestId=${requestId}: ${wrapped.cause.message}`);
    }
    throw wrapped;
  }

  const durationMs = Date.now() - startedAt;

  logAiRun({
    requestId,
    mode: agentMode.id,
    provider: result.provider,
    status: 'SUCCESS',
    durationMs,
    userId,
    messageLength: normalizedMessage.length
  });

  return { ...result, requestId, durationMs };
};

module.exports = { run, MAX_MESSAGE_LENGTH, normalizeMessage };
