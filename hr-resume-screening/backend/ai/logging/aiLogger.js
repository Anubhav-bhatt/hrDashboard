/**
 * AI execution logging.
 *
 * Console-based, matching the `[Auth]` / `[Server]` / `[Resume]` prefixes the rest
 * of the backend already uses. No table is added: Phase 0 found an existing audit
 * trail (`CandidateActivity`) but it is scoped to a candidate and records
 * recruiter actions, so writing AI diagnostics into it would corrupt a log that
 * recruiters read. Persistent AI execution history is a later phase's job.
 *
 * What is logged is deliberately narrow: identifiers, the mode, the provider, an
 * outcome and a duration. The prompt text is never logged — a recruiter asking
 * "why is this candidate a poor fit for the Pune role" puts personal data in the
 * message, and a log is the wrong place for it. Only its length is recorded,
 * which is enough to investigate a truncation or size problem.
 */

/** Values that must never appear in a log line, whatever the caller passes. */
const FORBIDDEN_KEYS = Object.freeze([
  'message',
  'content',
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'api_key',
  'secret',
  'authorization',
  'cookie',
  'resume',
  'resumetext',
  'resumedata'
]);

/**
 * Strips anything sensitive and flattens the rest to a single line.
 *
 * A guard rather than a formality: it means a future caller that adds a field in
 * good faith cannot leak a prompt or a credential through this function.
 *
 * @param {Object} fields
 */
const sanitize = (fields) => {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase())) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') continue; // never expand nested structures
    // Collapse anything that could break a log line into a single token.
    safe[key] = String(value).replace(/[\r\n\t]+/g, ' ').slice(0, 200);
  }
  return safe;
};

/** `key=value key=value` — grep-friendly and stable. */
const format = (fields) =>
  Object.entries(sanitize(fields))
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');

/**
 * Records the outcome of one AI execution.
 *
 * @param {Object} entry
 * @param {string} entry.requestId
 * @param {string} entry.mode
 * @param {string} entry.provider
 * @param {'SUCCESS'|'FAILED'|'REJECTED'} entry.status REJECTED covers a request
 *   turned away by a flag or by validation; FAILED covers a provider fault.
 * @param {number} entry.durationMs
 * @param {string|null} [entry.userId]
 * @param {string|null} [entry.errorCode]
 * @param {number|null} [entry.messageLength]
 */
const logAiRun = ({ requestId, mode, provider, status, durationMs, userId, errorCode, messageLength }) => {
  const line = format({
    requestId,
    mode,
    provider,
    status,
    durationMs,
    userId,
    errorCode,
    messageLength
  });

  if (status === 'SUCCESS') console.log(`[AI] ${line}`);
  else if (status === 'REJECTED') console.warn(`[AI] ${line}`);
  else console.error(`[AI] ${line}`);
};

/**
 * Reports non-fatal configuration problems once per request that has any.
 *
 * These do not stop execution — an unparseable flag has already resolved to
 * false, which is the safe outcome — but an operator needs to know the value they
 * set is being ignored.
 *
 * @param {string[]} warnings
 * @param {string} requestId
 */
const logAiConfigWarnings = (warnings, requestId) => {
  if (!Array.isArray(warnings) || warnings.length === 0) return;
  for (const warning of warnings) {
    console.warn(`[AI] ${format({ requestId, configWarning: warning })}`);
  }
};

module.exports = { logAiRun, logAiConfigWarnings, FORBIDDEN_KEYS };
