/**
 * The five agent modes.
 *
 * This is the single runtime authority on which modes exist. A mode that is not
 * listed here cannot be executed, which is what keeps a client-supplied `mode`
 * string from selecting anything other than one of these five.
 *
 * Every mode is `readOnly: true` in this phase. Write-capable agents do not
 * exist yet, and `AI_WRITE_ACTIONS_ENABLED` is a separate, independently
 * defaulted-off flag so that adding one later is a deliberate act rather than a
 * side effect of enabling a mode.
 */

/** @type {Readonly<Object<string, import('../types/ai.types').AgentMode>>} */
const AGENT_MODES = Object.freeze({
  assistant: Object.freeze({
    id: 'assistant',
    displayName: 'Recruitment Assistant',
    description: 'Answers recruiter questions about jobs and candidates in plain language.',
    readOnly: true,
    flagKey: 'AI_ASSISTANT_ENABLED'
  }),
  screening: Object.freeze({
    id: 'screening',
    displayName: 'Screening Agent',
    description: 'Summarises how a candidate measures against a role’s stated requirements.',
    readOnly: true,
    flagKey: 'AI_SCREENING_ENABLED'
  }),
  ranking: Object.freeze({
    id: 'ranking',
    displayName: 'Ranking Agent',
    description: 'Explains the ordering of a candidate shortlist. Never replaces the deterministic score.',
    readOnly: true,
    flagKey: 'AI_RANKING_ENABLED'
  }),
  comparison: Object.freeze({
    id: 'comparison',
    displayName: 'Comparison Agent',
    description: 'Contrasts two or more candidates against the same role.',
    readOnly: true,
    flagKey: 'AI_COMPARISON_ENABLED'
  }),
  insights: Object.freeze({
    id: 'insights',
    displayName: 'Insights Agent',
    description: 'Describes trends across a job’s candidate pipeline.',
    readOnly: true,
    flagKey: 'AI_INSIGHTS_ENABLED'
  })
});

/** Mode ids in a stable, documented order. */
const AGENT_MODE_IDS = Object.freeze(Object.keys(AGENT_MODES));

/**
 * Membership is tested against a Set rather than by indexing AGENT_MODES.
 *
 * `AGENT_MODES[mode]` would resolve inherited members — `constructor`,
 * `toString`, `__proto__` — every one of which is truthy. A client posting
 * `{"mode":"constructor"}` would then pass a naive existence check. A Set has no
 * such prototype surface.
 */
const MODE_ID_SET = new Set(AGENT_MODE_IDS);

/**
 * @param {unknown} value
 * @returns {boolean} True only for one of the five known mode ids.
 */
const isAgentMode = (value) => typeof value === 'string' && MODE_ID_SET.has(value);

/**
 * Looks up a mode's static definition.
 *
 * @param {unknown} value
 * @returns {import('../types/ai.types').AgentMode|null} Null for anything unknown.
 */
const getAgentMode = (value) => (isAgentMode(value) ? AGENT_MODES[value] : null);

/**
 * Every mode with its live `enabled` state resolved from configuration.
 *
 * Used for logging and diagnostics. A mode is enabled only when the AI layer as
 * a whole is on *and* its own flag is on.
 *
 * @param {import('../config/aiConfig').AiConfig} config
 */
const describeModes = (config) =>
  AGENT_MODE_IDS.map((id) => {
    const mode = AGENT_MODES[id];
    return {
      id: mode.id,
      displayName: mode.displayName,
      description: mode.description,
      enabled: Boolean(config && config.enabled && config.modes[id]),
      readOnly: mode.readOnly
    };
  });

module.exports = {
  AGENT_MODES,
  AGENT_MODE_IDS,
  isAgentMode,
  getAgentMode,
  describeModes
};
