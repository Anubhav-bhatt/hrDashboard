import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardList, GitCompare, Sparkles, UserPlus } from 'lucide-react';
import { EmptyState, Skeleton, cx } from '../ui';

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
 * Soft semantic tints, one per kind of work.
 *
 * The hue carries the *type* of action — review, compare, close, unblock — so a
 * recruiter can tell the cards apart before reading them. It is never the only
 * signal: every card also states its fact in words and names its action on the
 * button, so nothing depends on colour alone.
 *
 * These resolve through the theme's colour variables, so each tint becomes a
 * dark wash rather than a bright block when the dark theme is active.
 */
const TONES = {
  sky: { surface: 'bg-sky-50 border-sky-200', icon: 'bg-white/70 text-sky-700 border-sky-200' },
  lavender: { surface: 'bg-violet-50 border-violet-200', icon: 'bg-white/70 text-violet-700 border-violet-200' },
  mint: { surface: 'bg-teal-50 border-teal-200', icon: 'bg-white/70 text-teal-700 border-teal-200' },
  amber: { surface: 'bg-amber-50 border-amber-200', icon: 'bg-white/70 text-amber-800 border-amber-200' },
  neutral: { surface: 'bg-slate-100 border-slate-200', icon: 'bg-white/70 text-slate-600 border-slate-200' }
};

/** One attention card: a role, one supporting fact, one action. */
const AttentionCard = ({ item }) => {
  const tone = TONES[item.tone] || TONES.neutral;

  return (
    <li
      className={cx(
        'flex flex-col rounded-card border p-5 transition-shadow duration-fast',
        'hover:shadow-card-hover focus-within:shadow-card-hover',
        tone.surface
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cx('w-9 h-9 rounded-control border flex items-center justify-center shrink-0', tone.icon)}
          aria-hidden="true"
        >
          <item.icon className="w-4 h-4" />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-card-title text-slate-900 break-words">
            <Link
              to={`/jobs/${item.job.id}`}
              className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {item.job.title}
            </Link>
          </h3>
          <p className="text-meta text-slate-700 mt-1">{item.fact}</p>
          <p className="text-meta text-slate-600">{item.detail}</p>
        </div>
      </div>

      {/* The action sits on its own line at the card's foot so every card in the
          row lines its button up, however long the role title wrapped. */}
      <div className="mt-4 pt-3 flex items-center justify-between gap-3 border-t border-slate-900/5">
        {item.metric ? (
          <span className="text-meta text-slate-600 tabular-nums">
            {item.metric.label} <strong className="text-slate-900">{item.metric.value}</strong>
          </span>
        ) : (
          <span aria-hidden="true" />
        )}

        <Link
          to={item.to}
          className="btn btn-sm btn-secondary shrink-0"
          aria-label={`${item.actionLabel} for ${item.job.title}`}
        >
          {item.actionLabel}
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
};

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="dashboard-attention-heading" className="section-title">
            Needs your attention
          </h2>
          <p className="text-meta text-slate-500 mt-0.5">The next useful step for each active role.</p>
        </div>

        {remaining > limit && (
          <Link to="/jobs" className="btn btn-sm btn-ghost shrink-0">
            View all {items.length}
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>

      {loading ? (
        <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="rounded-card border border-slate-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="w-9 h-9 rounded-control shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-44" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </div>
              <div className="mt-4 pt-3 flex items-center justify-between border-t border-slate-100">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-28 rounded-control" />
              </div>
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <div className="mt-4">
          {/* Two different situations, and conflating them would mislead: either
              nothing anywhere needs work, or the only thing that does is already
              named in the recommendation above this section. */}
          <EmptyState
            icon={CheckCircle2}
            title={items.length > 0 ? 'Nothing else waiting' : 'Nothing waiting on you'}
            description={
              items.length > 0
                ? 'That is the only role needing a decision right now.'
                : 'Every active role is up to date. Create a job to start screening for a new role.'
            }
            action={
              items.length === 0 ? (
                <Link to="/jobs/new" className="btn btn-sm btn-primary">
                  Create job
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visible.map((item) => (
            <AttentionCard key={item.job.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
};

export { deriveNextAction };
export default NeedsAttention;
