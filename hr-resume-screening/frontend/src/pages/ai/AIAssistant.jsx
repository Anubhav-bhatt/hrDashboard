import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Briefcase,
  GitCompare,
  ListOrdered,
  RefreshCw,
  Search,
  Sparkles,
  User,
  Users
} from 'lucide-react';
import { Button, Card, ErrorState, InlineAlert, Skeleton, cx } from '../../components/ui';
import AgentShell from '../../components/ai/AgentShell';
import AgentInput from '../../components/ai/AgentInput';
import { AGENT_MODES } from '../../constants/agentModes';
import { useAiConfig } from '../../context/AiConfigContext';
import {
  buildAgentPath,
  SOURCE_WORKFLOWS,
  useRecruitmentContext
} from '../../context/RecruitmentContext';
import { useApiResource } from '../../hooks/useApiResource';
import { getJobSummary } from '../../services/api';
import { runAgent } from '../../services/aiService';
import { deriveNextAction } from '../../components/dashboard/NeedsAttention';

/**
 * AI Assistant Unified Orchestration Page.
 *
 * Serves as the unified recruitment Assistant entry point.
 * Preserves the Phase 7 context-first job landing while activating natural-language
 * intent routing (Rank, Compare, Screen, Rank & Compare) over controlled tools.
 */

const ACTIONS = [
  {
    label: 'Find strong candidates',
    description: 'Search the pool for the best matches across your open roles.',
    icon: Users,
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

const QUICK_SUGGESTIONS = [
  'Rank candidates',
  'Compare top 2',
  'Compare top 3',
  'Screen the first candidate',
  'What can you help me with?'
];

const contextualAgentActions = ({ jobId, stats, isClosed, isModeEnabled }) => {
  if (isClosed) return [];

  const analyzed = stats?.analyzedCount ?? 0;
  const shortlisted = stats?.shortlistedCount ?? 0;
  const candidates = stats?.candidateCount ?? 0;
  const source = SOURCE_WORKFLOWS.dashboard;

  return [
    {
      key: 'rank',
      label: 'Rank candidates',
      icon: ListOrdered,
      available: isModeEnabled('ranking') && analyzed > 0,
      to: buildAgentPath('ranking', { jobId, source })
    },
    {
      key: 'compare',
      label: shortlisted >= 2 ? `Compare ${shortlisted} shortlisted` : 'Compare shortlisted',
      icon: GitCompare,
      available: isModeEnabled('comparison') && shortlisted >= 2,
      to: buildAgentPath('comparison', { jobId, source })
    },
    {
      key: 'screen',
      label: 'Screen a candidate',
      icon: Search,
      available: isModeEnabled('screening') && candidates > 0,
      to: buildAgentPath('screening', { jobId, source })
    },
    {
      key: 'insights',
      label: 'Recruitment insights',
      icon: BarChart3,
      available: isModeEnabled('insights'),
      to: buildAgentPath('insights', { jobId, source })
    }
  ].filter((action) => action.available);
};

const ContextMetric = ({ value, label }) =>
  value === null || value === undefined ? null : (
    <div className="min-w-0">
      <p className="text-lg font-bold text-slate-900 tabular-nums leading-none">{value}</p>
      <p className="text-meta text-slate-500 mt-1">{label}</p>
    </div>
  );

const ContextSkeleton = () => (
  <Card className="border-brand-200 bg-brand-50/50">
    <p className="text-label uppercase text-brand-700">Current job</p>
    <Skeleton className="h-5 w-56 mt-2 rounded" />
    <div className="flex flex-wrap gap-x-8 gap-y-3 mt-4">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i}>
          <Skeleton className="h-5 w-10 rounded" />
          <Skeleton className="h-3 w-20 mt-1.5 rounded" />
        </div>
      ))}
    </div>
    <Skeleton className="h-9 w-40 mt-4 rounded-control" />
    <span className="sr-only" role="status">
      Loading the current job summary…
    </span>
  </Card>
);

const CurrentJobPanel = ({ job, stats, threshold, agentActions }) => {
  const recommendation = deriveNextAction(
    {
      id: job.id,
      status: job.status,
      selectedCandidateId: job.selectedCandidateId,
      candidateCount: stats?.candidateCount ?? 0,
      analyzedCount: stats?.analyzedCount ?? 0,
      strongMatchCount: stats?.strongMatchCount ?? 0,
      shortlistedCount: stats?.shortlistedCount ?? 0,
      selectedCount: stats?.selectedCount ?? 0,
      bestMatchScore: stats?.bestMatchScore ?? null
    },
    threshold
  );

  const isClosed = job.status === 'CLOSED';
  const primary = recommendation
    ? { label: recommendation.actionLabel, to: recommendation.to, fact: recommendation.fact, detail: recommendation.detail }
    : isClosed
      ? {
          label: 'View closed job',
          to: `/jobs/${job.id}`,
          fact: 'This role is closed.',
          detail: 'Its candidates and outcome are kept as hiring history.'
        }
      : null;

  return (
    <Card className="border-brand-200 bg-brand-50/50" padding="card-pad">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <p id="assistant-context-label" className="text-label uppercase text-brand-700">
            Current job
          </p>
          <h2 id="assistant-current-job" className="text-card-title text-slate-900 mt-1 truncate">
            <Link
              to={`/jobs/${job.id}`}
              className="rounded hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {job.title}
            </Link>
            {isClosed && <span className="text-meta font-semibold text-slate-500 ml-2">· Closed</span>}
          </h2>
        </div>

        <div id="assistant-context-metrics" className="flex flex-wrap gap-x-8 gap-y-3">
          <ContextMetric value={stats?.candidateCount} label="Candidates" />
          <ContextMetric value={stats?.strongMatchCount} label={`Strong matches (${threshold}%+)`} />
          <ContextMetric value={stats?.shortlistedCount} label="Shortlisted" />
        </div>

        {primary && (
          <div className="pt-1">
            <p className="text-label uppercase text-brand-700">Recommended next step</p>
            <p className="text-body text-slate-900 mt-1.5">
              {primary.fact} {primary.detail}
            </p>
            <Link
              to={primary.to}
              id="assistant-recommended-action"
              className="btn btn-md btn-primary mt-3 justify-center"
              aria-label={`${primary.label} for ${job.title}`}
            >
              {primary.label}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        )}

        {agentActions.length > 0 && (
          <div className="pt-3 border-t border-brand-200/70">
            <p className="text-meta text-slate-500 mb-2">Also available for this role</p>
            <div className="flex flex-wrap gap-2">
              {agentActions.map((action) => (
                <Link key={action.key} to={action.to} className="btn btn-sm btn-secondary">
                  <action.icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

const AIAssistant = () => {
  const navigate = useNavigate();
  const { isModeEnabled } = useAiConfig();
  const {
    currentJobId,
    selectedCandidateIds,
    lastRankingCandidateIds,
    lastComparisonCandidateIds,
    recordRanking,
    recordComparison,
    setJob,
    activeFilters
  } = useRecruitmentContext();

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState(null);

  const activeJobIdRef = useRef(currentJobId);
  useEffect(() => {
    activeJobIdRef.current = currentJobId;
  }, [currentJobId]);

  const { data, error, loading, refetch } = useApiResource(
    (config) => getJobSummary(currentJobId, config),
    [currentJobId],
    { enabled: Boolean(currentJobId) }
  );

  const job = data?.data?.job || null;
  const stats = data?.data?.stats || null;
  const threshold = data?.data?.strongMatchThreshold ?? 80;

  const invalidJob = error?.status === 404 || error?.code === 'JOB_NOT_FOUND';
  useEffect(() => {
    if (invalidJob && currentJobId) setJob(null);
  }, [invalidJob, currentJobId, setJob]);

  const hasJobContext = Boolean(currentJobId) && !invalidJob;
  const isClosed = job?.status === 'CLOSED';
  const isAssistantEnabled = isModeEnabled('assistant');
  const agentActions = job ? contextualAgentActions({ jobId: job.id, stats, isClosed, isModeEnabled }) : [];

  const handleSendPrompt = async (promptText) => {
    if (!promptText || !promptText.trim() || assistantLoading) return;
    const text = promptText.trim();
    setInputValue('');
    setAssistantError(null);

    const userMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    setAssistantLoading(true);

    const jobIdAtStart = currentJobId;

    try {
      const response = await runAgent({
        mode: 'assistant',
        message: text,
        context: {
          jobId: currentJobId || undefined,
          candidateIds: selectedCandidateIds.length > 0 ? selectedCandidateIds : undefined,
          lastRankingCandidateIds: lastRankingCandidateIds.length > 0 ? lastRankingCandidateIds : undefined,
          lastComparisonCandidateIds: lastComparisonCandidateIds.length > 0 ? lastComparisonCandidateIds : undefined,
          activeFilters: activeFilters && Object.keys(activeFilters).length > 0 ? activeFilters : undefined,
          candidateScope: 'ALL'
        }
      });

      // Guard against race conditions if user switched jobs during request
      if (activeJobIdRef.current !== jobIdAtStart) {
        return;
      }

      const content = response.content || response.message || 'Task completed.';
      const structured = response.structuredData || {};

      // Update recruitment context from Assistant orchestration
      if (structured.candidateIds && Array.isArray(structured.candidateIds) && structured.candidateIds.length > 0 && jobIdAtStart) {
        if (structured.specialistMode === 'ranking') {
          recordRanking(jobIdAtStart, structured.candidateIds);
        } else if (structured.specialistMode === 'comparison') {
          recordComparison(jobIdAtStart, structured.candidateIds);
        }
      }

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: content,
        structuredData: structured,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      if (activeJobIdRef.current !== jobIdAtStart) return;
      setAssistantError(err.message || 'Assistant error. Please try again.');
    } finally {
      if (activeJobIdRef.current === jobIdAtStart) {
        setAssistantLoading(false);
      }
    }
  };

  const handleActionClick = (action) => {
    if (action.to) {
      navigate(action.to);
    } else if (action.candidateIds && action.candidateIds.length >= 2) {
      handleSendPrompt(`Compare top ${action.candidateIds.length}`);
    } else if (action.candidateId) {
      handleSendPrompt(`Screen candidate`);
    } else if (action.label) {
      handleSendPrompt(action.label);
    }
  };

  const carryJobIntoTasks = hasJobContext && !isClosed;

  return (
    <AgentShell
      mode={AGENT_MODES.assistant}
      input={
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-[11px] text-slate-400 font-medium">Suggestions:</span>
            {QUICK_SUGGESTIONS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendPrompt(chip)}
                disabled={!isAssistantEnabled || assistantLoading}
                className="px-2 py-0.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors disabled:opacity-50 cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
          <AgentInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSendPrompt}
            busy={assistantLoading}
            disabled={!isAssistantEnabled}
            placeholder="Ask about this job or its candidates… (e.g. Rank candidates, Compare top 3, Screen Rahul)"
            disabledHint={!isAssistantEnabled ? 'AI Assistant is currently disabled in configuration.' : undefined}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-5" id="ai-assistant-container">
        {hasJobContext && loading && <ContextSkeleton />}

        {hasJobContext && !loading && error && (
          <ErrorState
            title="We couldn’t load the current job summary"
            error={error}
            onRetry={refetch}
          />
        )}

        {hasJobContext && !loading && !error && job && (
          <CurrentJobPanel job={job} stats={stats} threshold={threshold} agentActions={agentActions} />
        )}

        {/* Interactive Assistant Conversation Thread */}
        {messages.length > 0 && (
          <div className="space-y-4 pt-2 border-t border-slate-200" id="assistant-conversation-thread">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-600" />
                Assistant Conversation
              </h2>
              <button
                type="button"
                onClick={() => setMessages([])}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Clear thread
              </button>
            </div>

            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cx(
                    'p-4 rounded-lg flex gap-3 text-sm animate-fade-in',
                    msg.sender === 'user'
                      ? 'bg-slate-100 text-slate-900 border border-slate-200 ml-6 sm:ml-12'
                      : 'bg-white border border-brand-200 shadow-sm mr-2'
                  )}
                >
                  <div
                    className={cx(
                      'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                      msg.sender === 'user' ? 'bg-slate-700 text-white' : 'bg-brand-600 text-white'
                    )}
                  >
                    {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-xs text-slate-700">
                        {msg.sender === 'user' ? 'You' : 'AI Recruitment Assistant'}
                      </span>
                      <span className="text-[11px] text-slate-400">{msg.timestamp}</span>
                    </div>

                    <div className="whitespace-pre-wrap text-slate-800 leading-relaxed font-sans">
                      {msg.text}
                    </div>

                    {/* Contextual Suggested Actions */}
                    {msg.structuredData?.suggestedActions && msg.structuredData.suggestedActions.length > 0 && (
                      <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
                        {msg.structuredData.suggestedActions.map((act, idx) => (
                          <Button
                            key={idx}
                            variant="secondary"
                            size="sm"
                            onClick={() => handleActionClick(act)}
                          >
                            {act.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {assistantLoading && (
                <div className="p-3 bg-brand-50/60 border border-brand-200 rounded-lg flex items-center gap-2.5 text-xs text-brand-800 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-600" />
                  <span>Assistant is evaluating requirements and orchestrating specialist tools…</span>
                </div>
              )}

              {assistantError && (
                <InlineAlert
                  tone="error"
                  title="Assistant Request Error"
                  message={assistantError}
                />
              )}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-section">{hasJobContext ? 'Other actions' : 'What would you like to do?'}</h2>
          <p className="text-meta text-slate-500 mt-1">
            {carryJobIntoTasks
              ? 'Every task below opens with this role already selected.'
              : 'Pick a task and the right agent opens with the tools for it.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {ACTIONS.map((action) => {
            const available = isModeEnabled(action.mode.id);
            const Icon = action.icon;
            const to = carryJobIntoTasks
              ? buildAgentPath(action.mode.id, {
                  jobId: currentJobId,
                  source: SOURCE_WORKFLOWS.dashboard
                })
              : action.mode.route;

            return (
              <button
                key={action.label}
                type="button"
                onClick={() => navigate(to)}
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

        {!hasJobContext && (
          <p className="text-meta text-slate-500 inline-flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
            Open a role from{' '}
            <Link
              to="/jobs"
              className="font-bold text-brand-700 hover:text-brand-800 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Jobs
            </Link>{' '}
            and these tasks will start with it already selected.
          </p>
        )}
      </div>
    </AgentShell>
  );
};

export default AIAssistant;
