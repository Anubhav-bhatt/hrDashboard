import { BarChart3, GitCompare, ListOrdered, Search, Sparkles } from 'lucide-react';

/**
 * The five agent modes, as the browser knows them.
 *
 * This mirrors `backend/ai/modes/agentModes.js` — same five ids, same order — but
 * carries what only a UI needs: a route, an icon, and copy written for a
 * recruiter. The backend file stays the runtime authority on which modes may
 * execute; nothing here can enable a mode the server would refuse.
 *
 * The language is deliberately plain. A recruiter reading this menu should
 * understand what each agent does for them without knowing what an agent is, so
 * the descriptions say "analyze", "rank" and "compare" rather than naming models,
 * prompts or tools.
 *
 * `flagKey` is the browser-side flag name, which matches the mode id used by
 * `GET /api/ai/config`. The env var it ultimately reflects (AI_SCREENING_ENABLED
 * and friends) is a server concern and is never exposed here.
 */

/** Icons come from lucide-react, already a dependency — no new icon package. */
export const AGENT_MODES = Object.freeze({
  assistant: Object.freeze({
    id: 'assistant',
    name: 'AI Assistant',
    shortDescription: 'Ask questions and analyse recruitment across jobs and candidates.',
    icon: Sparkles,
    route: '/ai',
    flagKey: 'assistant',
    suggestedActions: Object.freeze([
      'Find strong candidates',
      'Screen a candidate',
      'Rank candidates',
      'Compare candidates',
      'Analyse recruitment performance'
    ])
  }),
  screening: Object.freeze({
    id: 'screening',
    name: 'Screening Agent',
    shortDescription: 'Analyse a candidate against a specific job.',
    icon: Search,
    route: '/ai/screening',
    flagKey: 'screening',
    suggestedActions: Object.freeze([
      'Does this candidate meet the required skills?',
      'What experience is missing for this role?',
      'Summarise this candidate’s fit'
    ])
  }),
  ranking: Object.freeze({
    id: 'ranking',
    name: 'Ranking Agent',
    shortDescription: 'Rank candidates for a selected role.',
    icon: ListOrdered,
    route: '/ai/ranking',
    flagKey: 'ranking',
    suggestedActions: Object.freeze([
      'Who are the strongest candidates?',
      'Prioritise strong Node.js experience',
      'Rank the shortlist for this job'
    ])
  }),
  comparison: Object.freeze({
    id: 'comparison',
    name: 'Comparison Agent',
    shortDescription: 'Compare multiple candidates side by side.',
    icon: GitCompare,
    route: '/ai/comparison',
    flagKey: 'comparison',
    suggestedActions: Object.freeze([
      'Compare the top three candidates',
      'Which candidate has stronger backend depth?',
      'Where do these candidates differ most?'
    ])
  }),
  insights: Object.freeze({
    id: 'insights',
    name: 'Insights Agent',
    shortDescription: 'Understand recruitment metrics, bottlenecks and job health.',
    icon: BarChart3,
    route: '/ai/insights',
    flagKey: 'insights',
    suggestedActions: Object.freeze([
      'Which jobs need attention?',
      'Where is the hiring funnel slowing down?',
      'How many strong candidates remain unreviewed?',
      'Which jobs have the highest match quality?'
    ])
  })
});

/** Mode ids in the order they are presented, everywhere. */
export const AGENT_MODE_IDS = Object.freeze(Object.keys(AGENT_MODES));

/** Modes as an array, for mapping over in navigation and menus. */
export const AGENT_MODE_LIST = Object.freeze(AGENT_MODE_IDS.map((id) => AGENT_MODES[id]));

/**
 * Looks up a mode by id.
 *
 * Membership is tested with `hasOwnProperty` rather than by truthiness of
 * `AGENT_MODES[id]`, so a route parameter of `constructor` or `toString` resolves
 * to null instead of an inherited function — the same care the backend takes.
 *
 * @param {unknown} id
 * @returns {Object|null}
 */
export const getAgentMode = (id) =>
  typeof id === 'string' && Object.prototype.hasOwnProperty.call(AGENT_MODES, id) ? AGENT_MODES[id] : null;

/**
 * Resolves the mode that owns a pathname.
 *
 * `/ai` is matched exactly: every other mode lives beneath it, so a prefix test
 * would make the assistant own all of them.
 *
 * @param {string} pathname
 * @returns {Object|null}
 */
export const getAgentModeByPath = (pathname) => {
  if (!pathname) return null;
  const path = pathname.replace(/\/+$/, '') || '/ai';
  if (path === '/ai') return AGENT_MODES.assistant;
  return AGENT_MODE_LIST.find((mode) => mode.route !== '/ai' && path === mode.route) || null;
};

export default AGENT_MODES;
