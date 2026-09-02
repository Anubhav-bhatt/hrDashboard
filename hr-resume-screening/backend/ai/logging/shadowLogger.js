/**
 * Sanitized telemetry logger for AI Assistant Shadow Mode evaluation.
 *
 * Records agreement/disagreement metrics between deterministic intent and real provider intent
 * without storing PII, resumes, tokens, or candidate contact information.
 */

const shadowRuns = [];

/**
 * Logs a single shadow evaluation turn.
 *
 * @param {Object} params
 * @param {string} [params.timestamp]
 * @param {string} params.provider
 * @param {string} params.mode
 * @param {string} params.deterministicIntent
 * @param {string} params.providerIntent
 * @param {boolean} params.agreed
 * @param {number} params.latencyMs
 * @param {boolean} params.success
 * @param {string|null} [params.errorCode]
 */
const logShadowRun = ({
  timestamp = new Date().toISOString(),
  provider,
  mode = 'shadow',
  deterministicIntent,
  providerIntent,
  agreed,
  latencyMs,
  success,
  errorCode = null
}) => {
  const record = {
    timestamp,
    provider: String(provider || 'unknown'),
    mode,
    deterministicIntent: String(deterministicIntent || 'UNKNOWN'),
    providerIntent: String(providerIntent || 'UNKNOWN'),
    agreed: Boolean(agreed),
    latencyMs: Number.isFinite(latencyMs) ? latencyMs : 0,
    success: Boolean(success),
    errorCode: errorCode ? String(errorCode) : null
  };

  shadowRuns.push(record);

  // In non-test environment, write structured single-line log
  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[AI_SHADOW] timestamp=${record.timestamp} provider=${record.provider} agreed=${record.agreed} det=${record.deterministicIntent} prov=${record.providerIntent} latencyMs=${record.latencyMs}`
    );
  }

  return record;
};

/**
 * Returns recorded shadow evaluation runs for telemetry / testing.
 */
const getShadowRuns = () => [...shadowRuns];

/**
 * Clears shadow run records (for test isolation).
 */
const clearShadowRuns = () => {
  shadowRuns.length = 0;
};

module.exports = {
  logShadowRun,
  getShadowRuns,
  clearShadowRuns
};
