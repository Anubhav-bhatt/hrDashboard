import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardList, GitCompare, Sparkles, UserPlus } from 'lucide-react';
import { Skeleton } from '../ui';

/**
 * Works out the single most useful next step for a job from its real counts.
 *
 * The ordering follows the screening funnel from the end backwards: a role with a
 * chosen candidate only needs closing, which matters more than a pending
 * shortlist, which matters more than unscored resumes, which matter more than a
 * pile of candidates nobody has looked at. Nothing here is a prediction or a
 * recommendation engine — each card states a fact from the job's own numbers and
 * links to the screen where that fact is acted on.
 *
 * @param {Object} job Job summary with aggregated candidate counts
 * @param {number} threshold Shared strong-match score threshold
 * @returns {Object|null} Attention item, or null when the job needs nothing
 */
const deriveNextAction = (job, threshold) => {
  const {
    candidateCount = 0,
    analyzedCount = 0,
    strongMatchCount = 0,
    shortlistedCount = 0,
    selectedCount = 0,
    bestMatchScore = null
  } = job;

  // A closed job is finished by definition.
  if (job.status === 'CLOSED') return null;

  // A chosen candidate on a still-open role leaves exactly one thing to do.
  if (selectedCount > 0 || job.selectedCandidateId) {
    return {
      priority: 0,
      kind: 'close',
      tone: 'mint',
      icon: CheckCircle2,
      fact: selectedCount > 1 ? `${selectedCount} candidates selected.` : 'A candidate has been selected.',
      detail: 'This role is ready to be closed.',
      metric: null,
      actionLabel: 'Close job',
      to: `/jobs/${job.id}`
    };
  }

  if (shortlistedCount > 0) {
    return {
      priority: 1,
      kind: 'decide',
      tone: 'lavender',
      icon: GitCompare,
      fact: `${shortlistedCount} shortlisted candidate${shortlistedCount === 1 ? '' : 's'}.`,
      detail: shortlistedCount === 1 ? 'Ready to make a final decision.' : 'Ready to compare and pick a finalist.',
      metric: bestMatchScore != null ? { label: 'Best match', value: `${Math.round(bestMatchScore)}%` } : null,
      actionLabel: 'Review shortlist',
      to: `/jobs/${job.id}/candidates?hrStatus=SHORTLISTED&sort=score_desc`
    };
  }

  if (candidateCount === 0) {
    return {
      priority: 4,
      kind: 'add-candidates',
      tone: 'neutral',
      icon: UserPlus,
      fact: 'No candidates yet.',
      detail: 'Add resumes to start matching against this role.',
      metric: null,
      actionLabel: 'Add candidates',
      to: `/jobs/${job.id}/import`
    };
  }

  if (analyzedCount === 0) {
    return {
      priority: 2,
      kind: 'score',
      tone: 'amber',
      icon: Sparkles,
      fact: `${candidateCount} candidate${candidateCount === 1 ? '' : 's'} waiting to be scored.`,
      detail: 'None have been matched against this role yet.',
      metric: null,
      actionLabel: 'Score candidates',
      to: `/jobs/${job.id}`
    };
  }

  if (strongMatchCount > 0) {
    return {
      priority: 3,
      kind: 'review-strong',
      tone: 'sky',
      icon: ClipboardList,
      fact: `${strongMatchCount} strong candidate${strongMatchCount === 1 ? '' : 's'} waiting for review.`,
      detail: `Scored ${threshold}% or higher against this role.`,
      metric: bestMatchScore != null ? { label: 'Best match', value: `${Math.round(bestMatchScore)}%` } : null,
      actionLabel: 'Review candidates',
      to: `/jobs/${job.id}/candidates?minScore=${threshold}&sort=score_desc`
    };
  }

  return {
    priority: 5,
    kind: 'review-all',
    tone: 'neutral',
    icon: ClipboardList,
    fact: `${candidateCount} candidate${candidateCount === 1 ? '' : 's'} scored.`,
    detail: `None reached a ${threshold}% match — worth a look before deciding.`,
    metric: bestMatchScore != null ? { label: 'Best match', value: `${Math.round(bestMatchScore)}%` } : null,
    actionLabel: 'Review candidates',
    to: `/jobs/${job.id}/candidates?sort=score_desc`
  };
};

/**
 * Which of the three markers a row carries.
 *
 * `deriveNextAction` distinguishes six kinds of work, but a marker is only
 * useful if its colour means something, and six hues across three rows means
 * nothing. These collapse to the three states a recruiter actually sorts by:
 * something is waiting on their decision, candidates are waiting to be read, or
 * the role has not been set up yet. Purely presentational — the underlying
 * action, wording and destination are untouched.
 */
const INDICATOR_BY_KIND = {
  close: 'attention-row-decide',
  decide: 'attention-row-decide',
  score: 'attention-row-decide',
  'review-strong': 'attention-row-review',
  'review-all': 'attention-row-review',
  'add-candidates': 'attention-row-setup'
};

/** One row of the queue: a role, why it is here, and the one thing to do. */
const AttentionRow = ({ item }) => {
  const indicator = INDICATOR_BY_KIND[item.kind] || 'attention-row-setup';

  return (
    <li className={`attention-row ${indicator}`}>
      <span className="attention-dot" aria-hidden="true" />

      <h3 className="attention-row-title text-card-title text-slate-900 min-w-0 break-words">
        <Link
          to={`/jobs/${item.job.id}`}
          className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {item.job.title}
        </Link>
      </h3>

      {/*
        A quiet text action, not a filled button: the dashboard's recommended
        step is the only primary call on this screen, and three solid buttons
        here would compete with it. The row is not itself a link — the title and
        the action already go to two different places, and laying a third target
        over both would make the click ambiguous and the keyboard order worse.
      */}
      <Link
        to={item.to}
        className="attention-row-action -mx-1 flex shrink-0 items-center gap-1.5 rounded px-1 text-meta font-semibold
                   text-brand-700 hover:text-brand-800 hover:underline
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label={`${item.actionLabel} for ${item.job.title}`}
      >
        {item.actionLabel}
        <ArrowRight className="attention-arrow w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      </Link>

      {/*
        The fact carries the number a recruiter scans for, so it leads and is
        weighted above the sentence explaining it. Both stay on one flowing line
        and wrap together rather than being stacked into a third row, which is
        what pushed the old cards past a scannable height.
      */}
      <p className="attention-row-context text-meta text-slate-600">
        <span className="font-medium text-slate-800">{item.fact}</span> {item.detail}
        {item.metric && (
          <span className="whitespace-nowrap text-slate-500 tabular-nums">
            {' · '}
            {item.metric.label} <strong className="font-semibold text-slate-700">{item.metric.value}</strong>
          </span>
        )}
      </p>
    </li>
  );
};

/** Placeholder rows that keep the panel's rhythm while the jobs load. */
const AttentionRowSkeleton = () => (
  <li className="attention-row">
    <Skeleton className="attention-dot h-2 w-2 rounded-pill" />
    <Skeleton className="attention-row-title h-4 w-40" />
    <Skeleton className="attention-row-action h-4 w-28" />
    <Skeleton className="attention-row-context h-3 w-64 max-w-full" />
  </li>
);

/**
 * Every job that needs something, most urgent first.
 *
 * Exported because the dashboard promotes the first entry into its "Recommended
 * next step" banner. Both surfaces call this one function, so the banner is
 * always literally the head of this list and the two can never disagree about
 * what matters most.
 */
export const deriveAttentionItems = (jobs = [], threshold = 80) =>
  jobs
    .map((job) => {
      const action = deriveNextAction(job, threshold);
      return action ? { ...action, job } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority || b.job.candidateCount - a.job.candidateCount);

/**
 * "Needs your attention" — the dashboard's answer to "what should I do next?".
 *
 * Derived entirely from the job summaries the dashboard already loads, so it adds
 * no requests. Shows a handful of roles rather than all of them: this is a
 * shortlist of work, and the full list lives in Jobs.
 *
 * `skip` lets the caller drop entries it has already shown elsewhere — the
 * dashboard passes 1 because the top item is promoted into the recommendation
 * banner above, and repeating it immediately underneath would read as a bug.
 */
const NeedsAttention = ({ jobs = [], threshold = 80, loading = false, limit = 3, skip = 0 }) => {
  const items = useMemo(() => deriveAttentionItems(jobs, threshold), [jobs, threshold]);

  const visible = items.slice(skip, skip + limit);
  const remaining = Math.max(items.length - skip, 0);

  return (
    <section aria-labelledby="dashboard-attention-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id="dashboard-attention-heading" className="section-title">
            Needs your attention
          </h2>
          <p className="text-meta text-slate-500 mt-0.5">
            Roles that need action before hiring can move forward.
          </p>
        </div>

        {/* A count, not a badge: this is orientation, not an alert. */}
        {!loading && remaining > 0 && (
          <span className="text-meta text-slate-500 tabular-nums shrink-0">
            {remaining} item{remaining === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {loading ? (
        <ul className="attention-panel mt-4">
          {Array.from({ length: 3 }, (_, i) => (
            <AttentionRowSkeleton key={i} />
          ))}
        </ul>
      ) : visible.length === 0 ? (
        /*
         * Being finished is good news and should read as one line of it. The
         * full empty-state block — icon plate, heading, paragraph, button in a
         * tall bordered box — gave the absence of work more room than the work
         * itself, which is backwards.
         *
         * The two situations stay distinct: either nothing anywhere needs work,
         * or the only thing that does is already named in the recommendation
         * directly above this section.
         */
        <div className="attention-panel mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-card-title text-slate-900">
              {items.length > 0 ? 'Nothing else waiting' : "You're caught up"}
            </p>
            <p className="text-meta text-slate-600 mt-0.5">
              {items.length > 0
                ? 'That is the only role needing a decision right now.'
                : 'Every active role is up to date. Create a job to start screening for a new role.'}
            </p>
          </div>
          {items.length === 0 && (
            <Link to="/jobs/new" className="btn btn-sm btn-secondary shrink-0">
              Create job
            </Link>
          )}
        </div>
      ) : (
        <>
          <ul className="attention-panel mt-4">
            {visible.map((item) => (
              <AttentionRow key={item.job.id} item={item} />
            ))}
          </ul>

          {/* The queue is bounded on purpose; the rest is one link away. */}
          {remaining > limit && (
            <div className="mt-2 flex justify-end">
              <Link to="/jobs" className="btn btn-sm btn-ghost text-brand-700">
                View all {remaining}
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export { deriveNextAction };
export default NeedsAttention;
