/**
 * Tool-layer errors.
 *
 * Separate from `ai.errors.js` because they answer a different question. An
 * AiError says why an AI *request* could not run — the layer is off, the mode is
 * off, the provider is wrong. A ToolError says why a *data retrieval* could not
 * run — bad input, no permission, no such record, too much asked for.
 *
 * Same discipline as everywhere else in this codebase: a stable machine-readable
 * `code`, a message safe to show a recruiter, and never a stack trace or an ORM
 * message in the payload.
 */

/** Every code the tool layer can produce. */
const TOOL_ERROR_CODES = Object.freeze({
  /** Input failed validation, or the tool name is not registered. */
  TOOL_INVALID_INPUT: 'TOOL_INVALID_INPUT',
  /** The executing user lacks the permission the tool declares. */
  TOOL_FORBIDDEN: 'TOOL_FORBIDDEN',
  /** The job or candidate asked for does not exist, or is out of scope. */
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  /** The underlying business service threw. */
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  /** A requested page size or count exceeds the configured ceiling. */
  TOOL_LIMIT_EXCEEDED: 'TOOL_LIMIT_EXCEEDED'
});

class ToolError extends Error {
  /**
   * @param {keyof typeof TOOL_ERROR_CODES} code
   * @param {string} message Safe to show a signed-in recruiter.
   */
  constructor(code, message) {
    super(message);
    this.name = 'ToolError';
    this.code = TOOL_ERROR_CODES[code] || 'TOOL_EXECUTION_FAILED';
    this.expose = true;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ToolError);
  }
}

const toolInvalidInput = (message) => new ToolError('TOOL_INVALID_INPUT', message);

const toolForbidden = (permission) =>
  new ToolError('TOOL_FORBIDDEN', `You do not have permission to use this tool (${permission} required).`);

/**
 * A missing record. The message deliberately does not distinguish "does not
 * exist" from "belongs to a job you did not ask about" — the job-scoped lookups
 * elsewhere in this codebase make the same choice, so a caller cannot probe for
 * the existence of records outside the scope they requested.
 *
 * @param {string} resource
 */
const resourceNotFound = (resource) => new ToolError('RESOURCE_NOT_FOUND', `${resource} could not be found.`);

const toolLimitExceeded = (message) => new ToolError('TOOL_LIMIT_EXCEEDED', message);

/**
 * Wraps a failure from an underlying business service. The cause is kept for
 * server-side logging and never travels in the response: a Prisma message can
 * carry query fragments and absolute paths.
 *
 * @param {Error} cause
 */
const toolExecutionFailed = (cause) => {
  const error = new ToolError('TOOL_EXECUTION_FAILED', 'This tool could not complete its request.');
  error.cause = cause;
  return error;
};

module.exports = {
  TOOL_ERROR_CODES,
  ToolError,
  toolInvalidInput,
  toolForbidden,
  resourceNotFound,
  toolLimitExceeded,
  toolExecutionFailed
};
