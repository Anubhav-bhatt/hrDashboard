/**
 * Structured schema definition and validation for Assistant intent interpretation.
 */

const ASSISTANT_INTENT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: [
        'SCREEN_CANDIDATE',
        'RANK_CANDIDATES',
        'COMPARE_CANDIDATES',
        'RANK_AND_COMPARE',
        'GET_INSIGHTS',
        'GENERAL_HELP',
        'UNKNOWN'
      ]
    },
    candidateName: { type: ['string', 'null'] },
    candidateReference: { type: ['string', 'null'], enum: ['FIRST', 'SECOND', 'THIRD', null] },
    candidateCount: { type: ['integer', 'null'] },
    scope: { type: ['string', 'null'], enum: ['CURRENT_JOB', 'WORKSPACE', null] },
    requiresJobContext: { type: ['boolean', 'null'] }
  },
  required: ['intent'],
  additionalProperties: false
});

/**
 * Validates a structured model output against the Assistant intent schema.
 *
 * @param {any} data
 * @returns {{ valid: boolean, data?: Object, error?: string }}
 */
const validateAssistantIntent = (data) => {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Output must be an object' };
  }

  const validIntents = [
    'SCREEN_CANDIDATE',
    'RANK_CANDIDATES',
    'COMPARE_CANDIDATES',
    'RANK_AND_COMPARE',
    'GET_INSIGHTS',
    'GENERAL_HELP',
    'UNKNOWN'
  ];

  if (!data.intent || !validIntents.includes(data.intent)) {
    return { valid: false, error: `Invalid intent "${data.intent}"` };
  }

  const sanitized = {
    intent: data.intent,
    candidateName: typeof data.candidateName === 'string' && data.candidateName.trim() ? data.candidateName.trim() : null,
    candidateReference: ['FIRST', 'SECOND', 'THIRD'].includes(data.candidateReference) ? data.candidateReference : null,
    candidateCount: Number.isInteger(data.candidateCount) && data.candidateCount > 0 ? data.candidateCount : null,
    scope: ['CURRENT_JOB', 'WORKSPACE'].includes(data.scope) ? data.scope : null,
    requiresJobContext: typeof data.requiresJobContext === 'boolean' ? data.requiresJobContext : false
  };

  return { valid: true, data: sanitized };
};

module.exports = {
  ASSISTANT_INTENT_SCHEMA,
  validateAssistantIntent
};
