/**
 * Shared shapes for the AI layer.
 *
 * The backend is plain CommonJS JavaScript, so these are JSDoc typedefs rather
 * than TypeScript declarations — editors and `tsc --checkJs` both understand
 * them, and no language migration is implied. Nothing here executes.
 *
 * @module ai/types
 */

/**
 * The five agent modes. Kept as a documented union so a typo in a mode string is
 * visible in an editor; `ai/modes/agentModes.js` is the runtime authority.
 *
 * @typedef {'assistant' | 'screening' | 'ranking' | 'comparison' | 'insights'} AgentModeId
 */

/**
 * Static description of a mode. `enabled` is not stored here — it is derived
 * from configuration at request time, because a flag can change without a
 * restart.
 *
 * @typedef {Object} AgentMode
 * @property {AgentModeId} id
 * @property {string} displayName
 * @property {string} description
 * @property {boolean} readOnly Whether the mode may ever mutate data. Every
 *   mode is read-only in this phase.
 * @property {string} flagKey Environment variable gating this mode.
 */

/**
 * Execution metadata handed to a provider.
 *
 * Deliberately identifiers and request metadata only — never loaded records,
 * resume text or candidate profiles. The context is a routing slip, not a second
 * database: later phases fetch what they need through controlled tools that go
 * via the existing business services.
 *
 * `userId` and `userRole` are always taken from the authenticated session and
 * can never be supplied by a client.
 *
 * @typedef {Object} AgentContext
 * @property {string} requestId Correlates logs for one AI execution.
 * @property {string|null} userId
 * @property {string|null} userRole
 * @property {string|null} sessionId
 * @property {string|null} jobId
 * @property {string[]} candidateIds
 * @property {Object<string, string|number|boolean|Array<string|number|boolean>>} filters
 */

/**
 * A normalized request as it reaches a provider.
 *
 * @typedef {Object} AIRequest
 * @property {AgentModeId} mode
 * @property {string} message
 * @property {AgentContext} context
 * @property {Object<string, string|number|boolean>} metadata Non-sensitive
 *   execution hints (never credentials).
 */

/**
 * Token and cost accounting. Zero for every local provider.
 *
 * @typedef {Object} AIUsage
 * @property {number} promptTokens
 * @property {number} completionTokens
 * @property {number} totalTokens
 * @property {number} costUsd
 */

/**
 * What a provider returns. Providers do not time themselves — the orchestrator
 * measures and stamps `durationMs`, which keeps provider output fully
 * deterministic and therefore assertable in tests.
 *
 * @typedef {Object} AIProviderResult
 * @property {AgentModeId} mode
 * @property {string} content Human-readable text.
 * @property {Object|null} structuredData Machine-readable payload, when the mode
 *   produces one.
 * @property {string} provider Provider identifier, e.g. `mock`.
 * @property {string} model Model identifier, e.g. `mock-v1`.
 * @property {AIUsage} usage
 */

/**
 * The orchestrator's return value: a provider result plus timing.
 *
 * @typedef {AIProviderResult & { requestId: string, durationMs: number }} AIResponse
 */

module.exports = {};
