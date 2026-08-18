/**
 * AI-specific error type.
 *
 * Deliberately the same shape as `services/jobClosureService.JobClosureError`,
 * which is the pattern this codebase already uses for domain errors: a stable
 * machine-readable `code`, a message written for a recruiter, and an explicit
 * `statusCode`. Controllers translate these into responses themselves, so an AI
 * failure never reaches the global error handler as an unknown 500 and never
 * carries a stack trace to a client.
 */

/** Every code the AI layer can produce, with the status each maps to. */
const AI_ERROR_CODES = Object.freeze({
  /** The whole AI layer is switched off (`AI_ENABLED=false`). */
  AI_DISABLED: 503,
  /** AI is on, but this specific mode's flag is off. */
  AI_MODE_DISABLED: 503,
  /** `AI_PROVIDER` names a provider that is not available. */
  AI_PROVIDER_INVALID: 503,
  /** The caller's mode, message or context failed validation. */
  AI_REQUEST_INVALID: 400,
  /** The resolved provider threw while handling the request. */
  AI_PROVIDER_ERROR: 502
});

/**
 * Error carrying a stable code and a client-safe message.
 *
 * `expose` is set so that if one of these ever does reach the global error
 * handler, the handler forwards the intended message rather than replacing it.
 */
class AiError extends Error {
  /**
   * @param {keyof typeof AI_ERROR_CODES} code
   * @param {string} message Safe to show a signed-in recruiter.
   * @param {number} [statusCode] Defaults to the status mapped to `code`.
   */
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.statusCode = statusCode || AI_ERROR_CODES[code] || 500;
    this.expose = true;

    // Keep the constructor out of the captured trace so server-side logs point
    // at the throw site rather than at this file.
    if (Error.captureStackTrace) Error.captureStackTrace(this, AiError);
  }
}

/* --------------------------------------------------------------- factories -- */

const aiDisabled = () =>
  new AiError('AI_DISABLED', 'AI features are currently turned off for this workspace.');

/** @param {string} displayName */
const aiModeDisabled = (displayName) =>
  new AiError('AI_MODE_DISABLED', `${displayName} is currently turned off for this workspace.`);

/**
 * A misconfigured provider. The message names the supported values so an
 * operator can fix it, but never echoes secrets or internal paths.
 *
 * @param {string[]} supported
 */
const aiProviderInvalid = (supported) =>
  new AiError(
    'AI_PROVIDER_INVALID',
    `The configured AI provider is not available. Supported providers: ${supported.join(', ')}.`
  );

/** @param {string} message Written for the caller — states what was wrong. */
const aiRequestInvalid = (message) => new AiError('AI_REQUEST_INVALID', message);

/**
 * Wraps a provider failure. The underlying message is kept on `cause` for
 * server-side logging and deliberately left out of the client-facing text,
 * because a provider error can contain vendor detail.
 *
 * @param {Error} cause
 */
const aiProviderError = (cause) => {
  const error = new AiError('AI_PROVIDER_ERROR', 'The AI provider could not complete this request.');
  error.cause = cause;
  return error;
};

module.exports = {
  AI_ERROR_CODES,
  AiError,
  aiDisabled,
  aiModeDisabled,
  aiProviderInvalid,
  aiRequestInvalid,
  aiProviderError
};
