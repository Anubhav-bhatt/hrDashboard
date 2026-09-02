import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Briefcase, GitCompare, ListOrdered, Search, Users } from 'lucide-react';
import { Card, ErrorState, Skeleton, cx } from '../../components/ui';
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
import { deriveNextAction } from '../../components/dashboard/NeedsAttention';

/**
 * The entry point to the AI section.
 *
 * Deliberately a menu rather than a chat box. A recruiter arriving here has a job
 * to do — screen someone, rank a pool, compare a shortlist — and naming those
 * jobs as cards gets them there in one click. An empty prompt would ask them to
 * guess what the system can do, and guessing is how a feature ends up unused.
 *
 * What changed
 * ------------
 * The menu used to be all there was, which made this the one surface that had
 * forgotten the role the recruiter was already working on. Every other agent
 * picks the current job up from `RecruitmentContext`; arriving here reset them to
 * "choose a task, then choose a job again" — the exact re-asking the shared
 * context exists to stop. When a role is known, this page now states where that
 * role has got to and names the single next step, with the task menu demoted
 * beneath it.
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

/**
 * The specialist agents worth offering for the state this role is actually in.
 *
 * Mirrors the reasoning in `JobNextStep.contextualTools`: ranking needs
 * something to rank, comparison needs at least two shortlisted people. An action
 * that can only disappoint is not rendered, and neither is one whose agent is
 * switched off — the flag is checked here so a disabled mode never appears as a
 * live control that leads to a "not enabled" screen.
 *
 * `source` is `dashboard` rather than an assistant-specific origin. There is no
 * `assistant` member of SOURCE_WORKFLOWS, and adding one would widen an enum that
 * is persisted in session storage for no behavioural gain — `dashboard` is what
 * the other hub surfaces (AIPowerTools, the command palette) already send when
 * they launch an agent from an overview.
 *
 * A closed role offers none of them. Ranking a filled vacancy, or comparing the
 * people who lost it, is working a hiring cycle that is over — the same thing the
 * candidate lifecycle scoping stopped the tool layer doing server-side. The only
 * honest action on a closed role is to go and read it.
 */
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

/** One figure from the role, shown only when the backend actually supplied it. */
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

/**
 * Where the recruiter's current role has got to, and the one thing to do next.
 *
 * The recommendation comes from `deriveNextAction` — the same function behind the
 * dashboard's attention queue and the Job Workspace's next step. Reusing it is
 * the point rather than a convenience: three surfaces telling a recruiter three
 * different things about one role would make all three untrustworthy, and a
 * second copy of the funnel ordering would drift the moment either was edited.
 */
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

  /*
   * A closed role is finished, and `deriveNextAction` returns null to say so.
   *
   * Rather than leaving the panel without a next step, the one honest action on
   * a filled vacancy is to go and read it. Nothing here offers to rank, shortlist,
   * select or close — that work is over, and the API refuses it anyway.
   */
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

        {/* Wraps rather than sitting in fixed columns, so three figures stack
            cleanly at 375px without a horizontal scrollbar. */}
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

        {/* Secondary, and visibly so: small outline buttons rather than a second
            row of filled ones competing with the recommendation above. */}
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
  const { currentJobId, setJob } = useRecruitmentContext();

  /*
   * One request, and only when a role is actually known.
   *
   * `/api/jobs/:id/summary` already returns the title, the lifecycle counts and
   * the strong-match threshold together — the same payload the Job Workspace
   * reads — so there is nothing to add server-side and no reason to pull the
   * candidate list just to count it. `useApiResource` cancels a superseded
   * request, so switching roles cannot let a slow response for the previous one
   * land on top of the new one.
   */
  const { data, error, loading, refetch } = useApiResource(
    (config) => getJobSummary(currentJobId, config),
    [currentJobId],
    { enabled: Boolean(currentJobId) }
  );

  const job = data?.data?.job || null;
  const stats = data?.data?.stats || null;
  const threshold = data?.data?.strongMatchThreshold ?? 80;

  /*
   * A remembered role that no longer exists.
   *
   * Permanent deletion means a stored `currentJobId` can outlive its job, and a
   * context pointing at a 404 would otherwise show this error on every visit.
   * `setJob(null)` drops that role and everything scoped to it — the selection,
   * the last ranking, the last comparison — and leaves the rest of the session
   * alone. The page then falls through to its no-role state.
   */
  const invalidJob = error?.status === 404 || error?.code === 'JOB_NOT_FOUND';
  useEffect(() => {
    if (invalidJob && currentJobId) setJob(null);
  }, [invalidJob, currentJobId, setJob]);

  const hasJobContext = Boolean(currentJobId) && !invalidJob;
  const isClosed = job?.status === 'CLOSED';
  const agentActions = job ? contextualAgentActions({ jobId: job.id, stats, isClosed, isModeEnabled }) : [];

  /*
   * Whether a task should open pre-loaded with this role.
   *
   * Only for a role still being hired for. Handing a closed job's id to the
   * ranking agent would pre-select an archived pool as though it were live work,
   * so on a finished role the tasks below stay available but open blank — the
   * recruiter chooses a live role for them, as they would from a cold start.
   */
  const carryJobIntoTasks = hasJobContext && !isClosed;

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
      <div className="flex flex-col gap-5">
        {hasJobContext && loading && <ContextSkeleton />}

        {/* A failed summary costs the recruiter the context panel, not the page:
            every task below stays reachable, and the remembered role is kept so
            a retry has something to retry with. */}
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
            /*
             * Carry the role into the task when one is known.
             *
             * This is the whole point of the change: choosing "Rank candidates"
             * from here should not then ask which role to rank. `buildAgentPath`
             * builds the link so the parameter names cannot drift from the ones
             * every other handoff uses.
             */
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

        {/* Nothing to work on yet, and no role remembered — the one case where a
            recruiter genuinely has to start somewhere else. */}
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
