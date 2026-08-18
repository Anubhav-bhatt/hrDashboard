/**
 * The tool registry: the only way into the recruitment data from the AI layer.
 *
 * Every execution goes through one path:
 *
 *     executeTool(name, input, context)
 *        -> the name resolves to a registered tool, or nothing happens
 *        -> the context carries an authenticated user, or nothing happens
 *        -> the user holds the tool's declared permission
 *        -> the input is validated into primitives
 *        -> the tool calls an existing business service
 *        -> the result is wrapped in the standard envelope and logged
 *
 * Two structural guarantees are worth stating explicitly.
 *
 * Tools are resolved from a `Map`, never by indexing an object with a
 * caller-supplied string and never by building a module path from one. A name
 * like `constructor`, `__proto__` or `../../services/authService` resolves to
 * nothing. There is no `require()` anywhere in the execution path, so a tool name
 * cannot become arbitrary module execution.
 *
 * Every tool is read-only, and that is asserted at registration rather than left
 * as a convention — a tool that declares `readOnly: false` fails to register,
 * loudly, at startup. Write capability is separately gated behind
 * `AI_WRITE_ACTIONS_ENABLED`, which no tool consults because none may write.
 *
 * The model does not choose tools. Nothing here is wired to a provider in this
 * phase; the orchestrator neither imports this file nor knows it exists. This is
 * a data layer being built and tested ahead of the agents that will use it.
 */
const { resolveAiConfig } = require('../config/aiConfig');
const { resolvePermissions } = require('./permissions');
const {
  ToolError,
  toolInvalidInput,
  toolForbidden,
  toolExecutionFailed
} = require('../errors/tool.errors');
const { logToolRun } = require('../logging/aiLogger');

const jobTools = require('./jobs.tools');
const candidateTools = require('./candidates.tools');
const scoringTools = require('./scoring.tools');
const analyticsTools = require('./analytics.tools');

/** Every tool definition, in registration order. */
const TOOL_DEFINITIONS = [
  jobTools.getJobs,
  jobTools.getJob,
  jobTools.getJobRequirements,
  candidateTools.getCandidate,
  candidateTools.getCandidates,
  candidateTools.searchCandidates,
  scoringTools.getCandidateScore,
  scoringTools.getScoringBreakdown,
  scoringTools.getJobRankingData,
  analyticsTools.getDashboardMetrics,
  analyticsTools.getJobMetrics,
  analyticsTools.getPipelineMetrics
];

/**
 * Validates a definition at registration.
 *
 * A malformed tool is a programming error, so it throws on require rather than
 * failing later during a request.
 */
const assertValidDefinition = (tool) => {
  const required = ['name', 'description', 'category', 'permission', 'service'];
  for (const field of required) {
    if (!tool || typeof tool[field] !== 'string' || !tool[field]) {
      throw new Error(`Tool definition is missing "${field}": ${JSON.stringify(tool && tool.name)}`);
    }
  }
  if (typeof tool.validate !== 'function' || typeof tool.execute !== 'function') {
    throw new Error(`Tool "${tool.name}" must define validate() and execute().`);
  }
  // The phase-wide guarantee, enforced rather than documented.
  if (tool.readOnly !== true) {
    throw new Error(`Tool "${tool.name}" must be read-only. Write-capable tools are not permitted in this phase.`);
  }
};

const TOOLS = new Map();
for (const definition of TOOL_DEFINITIONS) {
  assertValidDefinition(definition);
  if (TOOLS.has(definition.name)) throw new Error(`Duplicate tool name: ${definition.name}`);
  TOOLS.set(definition.name, Object.freeze(definition));
}

/** @returns {string[]} */
const listToolNames = () => Array.from(TOOLS.keys());

/** Public metadata for every tool. No handlers, no internals. */
const describeTools = () =>
  Array.from(TOOLS.values()).map((tool) => ({
    name: tool.name,
    description: tool.description,
    category: tool.category,
    readOnly: tool.readOnly,
    permission: tool.permission,
    service: tool.service
  }));

/**
 * @param {unknown} name
 * @returns {Object|null} Null for anything not registered.
 */
const getTool = (name) => (typeof name === 'string' && TOOLS.has(name) ? TOOLS.get(name) : null);

/** The success envelope. */
const ok = (data, metadata) => ({ success: true, data, metadata: metadata || {} });

/** The failure envelope. Carries a code and a safe message; never a stack. */
const fail = (code, message) => ({ success: false, error: { code, message } });

/**
 * Executes one tool.
 *
 * Never throws: a caller always receives an envelope, so a failing tool cannot
 * take down the agent turn that invoked it.
 *
 * @param {string} name
 * @param {Object} [input] Caller-supplied arguments.
 * @param {import('../types/ai.types').AgentContext} context Execution context,
 *   built by `ai/context/AgentContext.js` from the authenticated session.
 * @param {Object} [options]
 * @param {import('../config/aiConfig').AiConfig} [options.config] Injectable for tests.
 * @returns {Promise<Object>} `{ success, data, metadata }` or `{ success, error }`.
 */
const executeTool = async (name, input = {}, context = null, { config } = {}) => {
  const startedAt = Date.now();
  const activeConfig = config || resolveAiConfig();
  const requestId = (context && context.requestId) || null;
  const userId = (context && context.userId) || null;

  /** Logs the outcome and returns the failure envelope. */
  const rejected = (error) => {
    logToolRun({
      requestId,
      toolName: typeof name === 'string' ? name : 'unknown',
      userId,
      status: 'REJECTED',
      durationMs: Date.now() - startedAt,
      errorCode: error.code
    });
    return fail(error.code, error.message);
  };

  const tool = getTool(name);
  if (!tool) {
    return rejected(toolInvalidInput(`"${String(name)}" is not a registered tool.`));
  }

  // Authorization before validation: a caller without permission learns nothing
  // about the tool's input shape.
  const permissions = resolvePermissions(context);
  if (!permissions.has(tool.permission)) {
    return rejected(toolForbidden(tool.permission));
  }

  let validated;
  try {
    validated = tool.validate(input, { config: activeConfig, context });
  } catch (error) {
    if (error instanceof ToolError) return rejected(error);
    return rejected(toolInvalidInput('The supplied input could not be validated.'));
  }

  try {
    const result = await tool.execute(validated, { context, config: activeConfig });
    const durationMs = Date.now() - startedAt;
    const metadata = { ...(result.metadata || {}), toolName: tool.name, durationMs };

    logToolRun({
      requestId,
      toolName: tool.name,
      userId,
      status: 'SUCCESS',
      durationMs,
      resultCount: metadata.resultCount
    });

    return ok(result.data, metadata);
  } catch (error) {
    // A ToolError from a handler (a missing record, most often) is already a
    // decision; anything else is an unexpected service failure.
    const wrapped = error instanceof ToolError ? error : toolExecutionFailed(error);

    logToolRun({
      requestId,
      toolName: tool.name,
      userId,
      status: wrapped.code === 'TOOL_EXECUTION_FAILED' ? 'FAILED' : 'REJECTED',
      durationMs: Date.now() - startedAt,
      errorCode: wrapped.code
    });

    // Server-side only. The underlying message can contain query fragments.
    if (wrapped.cause) {
      console.error(`[AI_TOOL] ${tool.name} failed requestId=${requestId || 'none'}: ${wrapped.cause.message}`);
    }

    return fail(wrapped.code, wrapped.message);
  }
};

module.exports = {
  TOOLS,
  listToolNames,
  describeTools,
  getTool,
  executeTool
};
