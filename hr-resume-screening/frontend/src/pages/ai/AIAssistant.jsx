import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, GitCompare, ListOrdered, Search, Users } from 'lucide-react';
import { cx } from '../../components/ui';
import AgentShell from '../../components/ai/AgentShell';
import AgentInput from '../../components/ai/AgentInput';
import { AGENT_MODES } from '../../constants/agentModes';
import { useAiConfig } from '../../context/AiConfigContext';

/**
 * The entry point to the AI section.
 *
 * Deliberately a menu rather than a chat box. A recruiter arriving here has a job
 * to do — screen someone, rank a pool, compare a shortlist — and naming those
 * jobs as cards gets them there in one click. An empty prompt would ask them to
 * guess what the system can do, and guessing is how a feature ends up unused.
 *
 * Natural-language routing (typing "rank the Pune backend candidates" and landing
 * in the ranking agent with that job selected) belongs to a later phase. Until
 * the orchestrator can do that honestly, the instruction field below states that
 * it is not yet connected rather than accepting text and discarding it.
 */

/** Each card names a task, then points at the agent that performs it. */
const ACTIONS = [
  {
    label: 'Find strong candidates',
    description: 'Search the pool for the best matches across your open roles.',
    icon: Users,
    // No dedicated agent owns open-ended search yet; ranking is the closest
    // honest destination, so the card says what it will actually do.
    mode: AGENT_MODES.ranking,
    note: 'Opens the Ranking Agent'
  },
  {
    label: 'Screen a candidate',
    description: 'Analyse one candidate against a specific job.',
    icon: Search,
    mode: AGENT_MODES.screening
  },
  {
    label: 'Rank candidates',
    description: 'Order a job’s candidates by how well they fit.',
    icon: ListOrdered,
    mode: AGENT_MODES.ranking
  },
  {
    label: 'Compare candidates',
    description: 'Put two to five candidates side by side.',
    icon: GitCompare,
    mode: AGENT_MODES.comparison
  },
  {
    label: 'Analyse recruitment performance',
    description: 'Understand pipeline health, bottlenecks and job quality.',
    icon: BarChart3,
    mode: AGENT_MODES.insights
  }
];

const AIAssistant = () => {
  const navigate = useNavigate();
  const { isModeEnabled } = useAiConfig();

  return (
    <AgentShell
      mode={AGENT_MODES.assistant}
      input={
        <AgentInput
          disabled
          placeholder="Ask a question about your jobs and candidates…"
          disabledHint="Typed questions are not answered yet. Choose one of the actions above to open the agent that handles it."
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-section">What would you like to do?</h2>
          <p className="text-meta text-slate-500 mt-1">
            Pick a task and the right agent opens with the tools for it.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {ACTIONS.map((action) => {
            const available = isModeEnabled(action.mode.id);
            const Icon = action.icon;

            return (
              <button
                key={action.label}
                type="button"
                onClick={() => navigate(action.mode.route)}
                disabled={!available}
                aria-disabled={!available}
                className={cx(
                  'card card-pad text-left flex flex-col gap-2 min-w-0 transition duration-fast',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                  available
                    ? 'hover:border-brand-300 hover:shadow-card-hover cursor-pointer'
                    : 'opacity-60 cursor-not-allowed'
                )}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-8 h-8 rounded-control bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-card-title text-slate-900 min-w-0 truncate">{action.label}</span>
                </span>

                <span className="text-meta text-slate-500">{action.description}</span>

                <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 mt-auto pt-1">
                  {available ? (
                    <>
                      {action.note || `Opens the ${action.mode.name}`}
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </>
                  ) : (
                    <span className="text-slate-500">Coming soon</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </AgentShell>
  );
};

export default AIAssistant;
