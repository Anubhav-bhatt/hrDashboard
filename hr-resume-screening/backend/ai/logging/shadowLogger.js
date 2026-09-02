/**
 * Sanitized telemetry logger for AI Assistant Shadow Mode evaluation.
 *
 * Records quality metrics, intent agreement, parameter agreement, and latency
 * without storing PII, raw resumes, candidate contact data, or credentials.
 *
 * Enforces a bounded in-memory buffer (MAX_SHADOW_LOGS) to prevent memory growth.
 */

const MAX_SHADOW_LOGS = 500;
const shadowRuns = [];

/**
 * Normalizes string values for comparison.
 */
const normalizeStr = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : null);

/**
 * Evaluates semantic parameter agreement between deterministic intent and provider intent.
 *
 * @param {Object} [det] Deterministic parsed object
 * @param {Object} [prov] Provider structured output
 * @returns {boolean}
 */
const evaluateParameterAgreement = (det = {}, prov = {}) => {
  if (!det || !prov) return false;

  // 1. Intent must match
  if (det.intent !== prov.intent) return false;

  // 2. Candidate count (if specified)
  const detCount = det.targetCount ?? det.candidateCount ?? null;
  const provCount = prov.candidateCount ?? prov.targetCount ?? null;
  if (detCount !== null && provCount !== null && detCount !== provCount) {
    return false;
  }

  // 3. Candidate reference (FIRST, SECOND, THIRD)
  const detRef = det.candidateReference ?? (det.targetCandidate?.position ? (det.targetCandidate.position === 1 ? 'FIRST' : det.targetCandidate.position === 2 ? 'SECOND' : 'THIRD') : null);
  const provRef = prov.candidateReference ?? null;
  if (detRef && provRef && detRef !== provRef) {
    return false;
  }

  // 4. Candidate name (if specified)
  const detName = normalizeStr(det.candidateName ?? det.targetCandidate?.name);
  const provName = normalizeStr(prov.candidateName);
  if (detName && provName && !detName.includes(provName) && !provName.includes(detName)) {
    return false;
  }

  return true;
};

/**
 * Logs a single shadow evaluation turn.
 *
 * @param {Object} params
 * @param {string} [params.timestamp]
 * @param {string} params.provider
 * @param {string} [params.providerModel]
 * @param {string} [params.mode]
 * @param {string} [params.requestCategory]
 * @param {string} params.deterministicIntent
 * @param {string} params.providerIntent
 * @param {Object} [params.deterministicParams]
 * @param {Object} [params.providerParams]
 * @param {boolean} [params.intentAgreement]
 * @param {boolean} [params.parameterAgreement]
 * @param {boolean} [params.agreed]
 * @param {number} params.latencyMs
 * @param {boolean} params.success
 * @param {boolean} [params.schemaValid]
 * @param {boolean} [params.fallbackUsed]
 * @param {string|null} [params.errorCode]
 */
const logShadowRun = ({
  timestamp = new Date().toISOString(),
  provider,
  providerModel = 'unknown',
  mode = 'shadow',
  requestCategory = 'GENERAL',
  deterministicIntent,
  providerIntent,
  deterministicParams = {},
  providerParams = {},
  intentAgreement = null,
  parameterAgreement = null,
  agreed = null,
  latencyMs = 0,
  success = true,
  schemaValid = true,
  fallbackUsed = false,
  errorCode = null
}) => {
  const dIntent = String(deterministicIntent || 'UNKNOWN');
  const pIntent = String(providerIntent || 'UNKNOWN');
  const iAgreed = intentAgreement !== null ? Boolean(intentAgreement) : dIntent === pIntent;
  const pAgreed =
    parameterAgreement !== null
      ? Boolean(parameterAgreement)
      : evaluateParameterAgreement(
          { intent: dIntent, ...deterministicParams },
          { intent: pIntent, ...providerParams }
        );
  const overallAgreed = agreed !== null ? Boolean(agreed) : iAgreed && pAgreed;

  const record = {
    timestamp,
    provider: String(provider || 'unknown'),
    providerModel: String(providerModel),
    mode,
    requestCategory: String(requestCategory),
    deterministicIntent: dIntent,
    providerIntent: pIntent,
    intentAgreement: iAgreed,
    parameterAgreement: pAgreed,
    agreed: overallAgreed,
    latencyMs: Number.isFinite(latencyMs) ? latencyMs : 0,
    success: Boolean(success),
    schemaValid: Boolean(schemaValid),
    fallbackUsed: Boolean(fallbackUsed),
    errorCode: errorCode ? String(errorCode) : null
  };

  // Enforce ring-buffer capacity limit
  if (shadowRuns.length >= MAX_SHADOW_LOGS) {
    shadowRuns.shift();
  }
  shadowRuns.push(record);

  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[AI_SHADOW] timestamp=${record.timestamp} provider=${record.provider} agreed=${record.agreed} intentAgreed=${record.intentAgreement} paramAgreed=${record.parameterAgreement} det=${record.deterministicIntent} prov=${record.providerIntent} latencyMs=${record.latencyMs}`
    );
  }

  return record;
};

/**
 * Returns recorded shadow evaluation runs for telemetry / testing.
 */
const getShadowRuns = () => [...shadowRuns];

/**
 * Computes aggregated quality metrics across all recorded shadow runs.
 */
const computeShadowQualityMetrics = () => {
  const total = shadowRuns.length;
  if (total === 0) {
    return {
      totalRuns: 0,
      intentAgreementRate: 1.0,
      parameterAgreementRate: 1.0,
      overallAgreementRate: 1.0,
      schemaValidityRate: 1.0,
      successRate: 1.0,
      fallbackRate: 0.0,
      averageLatencyMs: 0,
      p95LatencyMs: 0
    };
  }

  let intentAgreedCount = 0;
  let paramAgreedCount = 0;
  let overallAgreedCount = 0;
  let schemaValidCount = 0;
  let successCount = 0;
  let fallbackCount = 0;
  const latencies = [];

  for (const r of shadowRuns) {
    if (r.intentAgreement) intentAgreedCount++;
    if (r.parameterAgreement) paramAgreedCount++;
    if (r.agreed) overallAgreedCount++;
    if (r.schemaValid) schemaValidCount++;
    if (r.success) successCount++;
    if (r.fallbackUsed) fallbackCount++;
    latencies.push(r.latencyMs);
  }

  latencies.sort((a, b) => a - b);
  const avgLatency = Math.round(latencies.reduce((sum, l) => sum + l, 0) / latencies.length);
  const p95Idx = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies[Math.min(p95Idx, latencies.length - 1)] || 0;

  return {
    totalRuns: total,
    intentAgreementRate: Number((intentAgreedCount / total).toFixed(4)),
    parameterAgreementRate: Number((paramAgreedCount / total).toFixed(4)),
    overallAgreementRate: Number((overallAgreedCount / total).toFixed(4)),
    schemaValidityRate: Number((schemaValidCount / total).toFixed(4)),
    successRate: Number((successCount / total).toFixed(4)),
    fallbackRate: Number((fallbackCount / total).toFixed(4)),
    averageLatencyMs: avgLatency,
    p95LatencyMs: p95Latency
  };
};

/**
 * Clears shadow run records (for test isolation).
 */
const clearShadowRuns = () => {
  shadowRuns.length = 0;
};

module.exports = {
  MAX_SHADOW_LOGS,
  logShadowRun,
  getShadowRuns,
  evaluateParameterAgreement,
  computeShadowQualityMetrics,
  clearShadowRuns
};
