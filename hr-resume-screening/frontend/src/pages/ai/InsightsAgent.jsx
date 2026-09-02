import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Clock,
  GitCompare,
  ListOrdered,
  Search,
  Sparkles,
  Star,
  Users
} from 'lucide-react';
import { Button, Card, CardHeader, InlineAlert, Skeleton, StatCardSkeleton, cx } from '../../components/ui';
import StatCard from '../../components/StatCard';
import AgentShell from '../../components/ai/AgentShell';
import AgentInput from '../../components/ai/AgentInput';
import { AGENT_MODES } from '../../constants/agentModes';
import { useAiConfig } from '../../context/AiConfigContext';
import { useRecruitmentContext } from '../../context/RecruitmentContext';
import { useApiResource } from '../../hooks/useApiResource';
import { getDashboardOverview } from '../../services/api';
import { runAgent } from '../../services/aiService';

/**
 * Deterministic Recruitment Insights Page.
 *
 * Exposes actionable evidence-backed findings across workspace jobs or scoped to the
 * active role, with direct one-click handoffs to specialist agents and workflow pages.
 */

const QUICK_QUESTIONS = [
  'What needs attention?',
  'Show insights for this job',
  'Show pipeline health',
  'What should I focus on?'
];

const InsightCard = ({ item }) => {
  const isAttention = item.severity === 'ATTENTION' || item.severity === 'HIGH';

  return (
    <div
      className={cx(
        'p-4 rounded-card border transition-all duration-fast flex flex-col sm:flex-row sm:items-center justify-between gap-4',
        isAttention
          ? 'bg-amber-50/40 border-amber-200/80 shadow-sm'
          : 'bg-white border-slate-200/90 shadow-card hover:border-slate-300'
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={cx(
            'w-8 h-8 rounded-control flex items-center justify-center shrink-0 mt-0.5',
            isAttention ? 'bg-amber-100 text-amber-700' : 'bg-brand-50 text-brand-600'
          )}
          aria-hidden="true"
        >
          {isAttention ? <AlertCircle className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-card-title text-slate-900 font-semibold">{item.title}</h3>
            {isAttention && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-200/70 text-amber-900">
                Needs attention
              </span>
            )}
          </div>
          <p className="text-body text-slate-600 mt-1 leading-relaxed">{item.message}</p>
        </div>
      </div>

      {item.to && (
        <div className="shrink-0 flex sm:self-center">
          <Link
            to={item.to}
            className={cx(
              'btn btn-sm inline-flex items-center gap-1.5 font-semibold',
              isAttention ? 'btn-primary' : 'btn-secondary'
            )}
          >
            {item.actionLabel || 'View details'}
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
};

const InsightsAgent = () => {
  const navigate = useNavigate();
  const { isModeEnabled } = useAiConfig();
  const { currentJobId } = useRecruitmentContext();

  const [promptText, setPromptText] = useState('');
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [customInsights, setCustomInsights] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);

  const { data, loading, error, refetch } = useApiResource(
    (config) => getDashboardOverview(currentJobId ? { jobId: currentJobId } : {}, config),
    [currentJobId]
  );

  const overview = data?.data || null;
  const metrics = overview?.metrics || null;
  const isInsightsEnabled = isModeEnabled('insights');

  const handleAsk = async (question) => {
    if (!question || !question.trim() || runningAnalysis) return;
    setPromptText('');
    setRunningAnalysis(true);
    setAnalysisError(null);

    try {
      const response = await runAgent({
        mode: 'insights',
        message: question.trim(),
        context: {
          jobId: currentJobId || undefined
        }
      });

      const structured = response.structuredData || {};
      setCustomInsights({
        query: question.trim(),
        summary: response.content,
        insights: structured.insights || []
      });
    } catch (err) {
      setAnalysisError(err.message || 'Failed to generate insights.');
    } finally {
      setRunningAnalysis(false);
    }
  };

  // Derive initial deterministic insights directly from live overview payload if not queried yet
  const defaultInsights = React.useMemo(() => {
    if (!overview) return [];
    const list = [];
    const jobs = overview.jobs || [];

    for (const j of jobs) {
      if (j.selectedCount > 0) {
        list.push({
          type: 'CANDIDATE_SELECTED_JOB_OPEN',
          severity: 'ATTENTION',
          title: `${j.title} is ready to close`,
          message: `${j.selectedCount} candidate(s) selected. Review the hire and close the job.`,
          to: `/jobs/${j.id || j.jobId}`,
          actionLabel: 'Close job'
        });
      } else if (j.shortlistedCount >= 2) {
        list.push({
          type: 'SHORTLIST_READY_FOR_COMPARISON',
          severity: 'INFO',
          title: `${j.title} has shortlisted candidates ready to compare`,
          message: `${j.shortlistedCount} shortlisted candidates are ready for side-by-side trade-off comparison.`,
          to: `/ai/comparison?jobId=${j.id || j.jobId}`,
          actionLabel: 'Compare shortlisted'
        });
      } else if (j.candidateCount === 0) {
        list.push({
          type: 'JOB_NEEDS_CANDIDATES',
          severity: 'ATTENTION',
          title: `${j.title} has no candidates yet`,
          message: 'Add candidate resumes to begin matching against this role.',
          to: `/jobs/${j.id || j.jobId}/import`,
          actionLabel: 'Add candidates'
        });
      } else if (j.strongMatchCount > 0 && j.shortlistedCount === 0) {
        list.push({
          type: 'STRONG_MATCHES_AVAILABLE',
          severity: 'INFO',
          title: `${j.title} has ${j.strongMatchCount} strong match(es)`,
          message: `${j.strongMatchCount} candidate(s) scored 80% or higher against requirements.`,
          to: `/jobs/${j.id || j.jobId}/candidates?minScore=80`,
          actionLabel: 'Review matches'
        });
      }
    }

    if (metrics?.pendingReview >= 15) {
      list.unshift({
        type: 'PIPELINE_BOTTLENECK',
        severity: 'ATTENTION',
        title: 'High review backlog across roles',
        message: `${metrics.pendingReview} candidates are currently awaiting review across open roles.`,
        to: '/jobs',
        actionLabel: 'View open roles'
      });
    }

    return list;
  }, [overview, metrics]);

  const activeInsights = customInsights ? customInsights.insights : defaultInsights;
  const attentionItems = activeInsights.filter((i) => i.severity === 'ATTENTION' || i.severity === 'HIGH');
  const informationalItems = activeInsights.filter((i) => i.severity === 'INFO');

  return (
    <AgentShell
      mode={AGENT_MODES.insights}
      input={
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-[11px] text-slate-400 font-medium">Quick queries:</span>
            {QUICK_QUESTIONS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAsk(chip)}
                disabled={!isInsightsEnabled || runningAnalysis}
                className="px-2.5 py-0.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors disabled:opacity-50 cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
          <AgentInput
            value={promptText}
            onChange={setPromptText}
            onSubmit={handleAsk}
            busy={runningAnalysis}
            disabled={!isInsightsEnabled}
            placeholder="Ask about recruitment bottlenecks, job health, or next steps…"
            disabledHint={!isInsightsEnabled ? 'Insights capability is currently disabled.' : undefined}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-6" id="insights-container">
        {/* KPI Strip */}
        <section aria-label="Current recruitment metrics">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-section">Recruitment Performance Metrics</h2>
            <p className="text-xs text-slate-500">Authoritative workspace metrics</p>
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
              message={`${error.message} The AI section is unaffected.`}
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
                subtitle={metrics.unanalyzed > 0 ? `${metrics.unanalyzed} unanalyzed` : undefined}
              />
            </div>
          ) : null}
        </section>

        {/* Custom Query Result Banner */}
        {customInsights && (
          <div className="p-4 bg-brand-50/70 border border-brand-200 rounded-card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                Query: "{customInsights.query}"
              </span>
              <button
                type="button"
                onClick={() => setCustomInsights(null)}
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Reset to default overview
              </button>
            </div>
            <p className="text-body text-slate-800 whitespace-pre-wrap">{customInsights.summary}</p>
          </div>
        )}

        {analysisError && (
          <InlineAlert tone="error" title="Analysis Error" message={analysisError} />
        )}

        {/* Attention Section */}
        {attentionItems.length > 0 && (
          <section className="space-y-3" aria-label="Items needing attention">
            <div className="flex items-center justify-between">
              <h2 className="text-section text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Needs Immediate Attention
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                {attentionItems.length} action item{attentionItems.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {attentionItems.map((item, idx) => (
                <InsightCard key={idx} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* Pipeline Opportunities / Informational Section */}
        {informationalItems.length > 0 && (
          <section className="space-y-3" aria-label="Pipeline recommendations">
            <div className="flex items-center justify-between">
              <h2 className="text-section text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-600" />
                Pipeline Opportunities & Next Steps
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                {informationalItems.length} recommendation{informationalItems.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {informationalItems.map((item, idx) => (
                <InsightCard key={idx} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* All caught up state */}
        {activeInsights.length === 0 && !loading && (
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-card flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
            <div>
              <p className="text-card-title text-slate-900 font-semibold">You're caught up!</p>
              <p className="text-body text-slate-600 mt-0.5">
                Every active role is currently moving forward. No pipeline bottlenecks or pending decisions detected.
              </p>
            </div>
          </div>
        )}
      </div>
    </AgentShell>
  );
};

export default InsightsAgent;
