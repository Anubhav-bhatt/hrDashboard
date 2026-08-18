import React from 'react';
import { BarChart3, Briefcase, Star, Users } from 'lucide-react';
import { Card, CardHeader, InlineAlert, StatCardSkeleton } from '../../components/ui';
import StatCard from '../../components/StatCard';
import AgentShell from '../../components/ai/AgentShell';
import AgentInput from '../../components/ai/AgentInput';
import AgentEmptyState from '../../components/ai/AgentEmptyState';
import AgentResultContainer from '../../components/ai/AgentResultContainer';
import { useApiResource } from '../../hooks/useApiResource';
import { getDashboardOverview } from '../../services/api';
import { AGENT_MODES } from '../../constants/agentModes';

/**
 * Insights: hiring performance and where the pipeline is stuck.
 *
 * The KPI strip is real. It calls `/api/dashboard/overview` — the same endpoint
 * that serves the dashboard — so the figures a recruiter reads here are the
 * figures they read there. That equality is the point: the previous phase went to
 * some trouble to make sure AI and the dashboard would quote one number, and
 * duplicating the arithmetic on this page would have quietly undone it.
 *
 * The generated commentary on top of those numbers is what is not connected yet.
 * Suggested questions are shown as the vocabulary this agent will accept, marked
 * clearly as not yet answerable rather than presented as working controls.
 */
const InsightsAgent = () => {
  const { data, loading, error, refetch } = useApiResource((config) => getDashboardOverview({}, config), []);

  const overview = data?.data || null;
  const metrics = overview?.metrics || null;

  return (
    <AgentShell
      mode={AGENT_MODES.insights}
      input={
        <AgentInput
          disabled
          placeholder="Ask about hiring performance…"
          disabledHint="Questions become answerable once the insights agent is connected."
        />
      }
    >
      <div className="flex flex-col gap-5">
        <section aria-label="Current recruitment metrics">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-section">Where things stand</h2>
            <p className="text-xs text-slate-500">Same figures as your dashboard</p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <InlineAlert
              tone="warning"
              title="Unable to load recruitment metrics"
              message={`${error.message} The AI section is unaffected — your dashboard remains available.`}
            />
          ) : metrics ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard label="Candidates" value={metrics.totalCandidates} icon={Users} tone="brand" to="/candidates" />
              <StatCard label="Open roles" value={metrics.totalJobs} icon={Briefcase} tone="violet" to="/jobs" />
              <StatCard
                label="Strong matches"
                value={metrics.strongMatch}
                icon={Star}
                tone="emerald"
                subtitle={
                  overview?.strongMatchThreshold ? `Scoring ${overview.strongMatchThreshold}% or above` : undefined
                }
              />
              <StatCard
                label="Awaiting review"
                value={metrics.pendingReview}
                icon={BarChart3}
                tone="amber"
                subtitle={metrics.unanalyzed > 0 ? `${metrics.unanalyzed} not scored yet` : undefined}
              />
            </div>
          ) : null}
        </section>

        <AgentResultContainer
          onRetry={refetch}
          empty={
            <div className="space-y-4">
              <AgentEmptyState
                icon={BarChart3}
                title="No analysis yet"
                description="The metrics above are live. Written analysis of what they mean — which jobs need attention, where the funnel is slowing — arrives in the next release."
              />

              <Card>
                <CardHeader
                  title="What you’ll be able to ask"
                  description="These questions become answerable when the insights agent is connected."
                  icon={BarChart3}
                />
                <ul className="mt-4 space-y-2">
                  {AGENT_MODES.insights.suggestedActions.map((prompt) => (
                    <li
                      key={prompt}
                      className="flex items-start gap-2.5 text-meta text-slate-600 px-3 py-2.5 rounded-control bg-slate-50"
                    >
                      <span className="text-slate-400 shrink-0" aria-hidden="true">
                        ?
                      </span>
                      {prompt}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          }
        >
          {null}
        </AgentResultContainer>
      </div>
    </AgentShell>
  );
};

export default InsightsAgent;
