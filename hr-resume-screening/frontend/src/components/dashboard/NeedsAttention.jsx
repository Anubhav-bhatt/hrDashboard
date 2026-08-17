import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardList, Sparkles, UserPlus } from 'lucide-react';
import { Card, CardHeader, EmptyState, Skeleton } from '../ui';

/**
 * Works out the single most useful next step for a job from its real counts.
 *
 * The ordering follows the screening funnel from the end backwards: a pending
 * hiring decision matters more than unscored resumes, which matter more than a
 * pile of candidates nobody has looked at. Nothing here is a prediction or a
 * recommendation engine — each card states a fact from the job's own numbers and
 * links to the screen where that fact is acted on.
 *
 * @param {Object} job Job summary with aggregated candidate counts
 * @param {number} threshold Shared strong-match score threshold
 * @returns {Object|null} Attention item, or null when the job needs nothing
 */
const deriveNextAction = (job, threshold) => {
  const { candidateCount = 0, analyzedCount = 0, strongMatchCount = 0, shortlistedCount = 0 } = job;

  // A closed job is finished by definition.
  if (job.status === 'CLOSED') return null;

  if (shortlistedCount > 0) {
    return {
      priority: 1,
      icon: CheckCircle2,
      tone: 'brand',
      fact: `${shortlistedCount} candidate${shortlistedCount === 1 ? '' : 's'} shortlisted.`,
      detail: 'Ready to select a final candidate.',
      actionLabel: 'Review shortlist',
      to: `/jobs/${job.id}/candidates?hrStatus=SHORTLISTED&sort=score_desc`
    };
  }

  if (candidateCount === 0) {
    return {
      priority: 4,
      icon: UserPlus,
      tone: 'slate',
      fact: 'No candidates yet.',
      detail: 'Add resumes to start comparing candidates against this job.',
      actionLabel: 'Add candidates',
      to: `/jobs/${job.id}/import`
    };
  }

  if (analyzedCount === 0) {
    return {
      priority: 2,
      icon: Sparkles,
      tone: 'amber',
      fact: `${candidateCount} candidate${candidateCount === 1 ? '' : 's'} added.`,
      detail: 'None have been matched against this job yet.',
      actionLabel: 'Score candidates',
      to: `/jobs/${job.id}`
    };
  }

  if (strongMatchCount > 0) {
    return {
      priority: 3,
      icon: ClipboardList,
      tone: 'emerald',
      fact: `${candidateCount} candidate${candidateCount === 1 ? '' : 's'} added.`,
      detail: `${strongMatchCount} ${strongMatchCount === 1 ? 'has' : 'have'} a ${threshold}%+ job match.`,
      actionLabel: 'Review candidates',
      to: `/jobs/${job.id}/candidates?minScore=${threshold}&sort=score_desc`
    };
  }

  return {
    priority: 5,
    icon: ClipboardList,
    tone: 'slate',
    fact: `${candidateCount} candidate${candidateCount === 1 ? '' : 's'} scored.`,
    detail: `None reached a ${threshold}% match — worth a look before deciding.`,
    actionLabel: 'Review candidates',
    to: `/jobs/${job.id}/candidates?sort=score_desc`
  };
};

const TONES = {
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200'
};

/**
 * "Needs your attention" — the dashboard's answer to "what should I do next?".
 *
 * Derived entirely from the job summaries the dashboard already loads, so it adds
 * no requests. Shows a handful of jobs rather than all of them: this is a
 * shortlist of work, and the full list lives in Jobs.
 */
const NeedsAttention = ({ jobs = [], threshold = 80, loading = false, limit = 4 }) => {
  const items = useMemo(
    () =>
      jobs
        .map((job) => {
          const action = deriveNextAction(job, threshold);
          return action ? { ...action, job } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.priority - b.priority || b.job.candidateCount - a.job.candidateCount)
        .slice(0, limit),
    [jobs, threshold, limit]
  );

  return (
    <Card padding="p-0">
      <div className="px-5 py-4 border-b border-slate-100">
        <CardHeader
          title="Needs your attention"
          description="The next useful step for each active role."
          actions={
            jobs.length > limit && (
              <Link to="/jobs" className="btn btn-sm btn-ghost">
                All jobs
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            )
          }
        />
      </div>

      {loading ? (
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-control shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-44" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-8 w-28 rounded-control" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={CheckCircle2}
            title="Nothing waiting on you"
            description="Every active role is up to date. Create a job to start screening for a new role."
            action={
              <Link to="/jobs/new" className="btn btn-sm btn-primary">
                Create job
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li
              key={item.job.id}
              className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-slate-50 transition-colors duration-fast"
            >
              <span
                className={`w-9 h-9 rounded-control border flex items-center justify-center shrink-0 ${TONES[item.tone]}`}
                aria-hidden="true"
              >
                <item.icon className="w-4 h-4" />
              </span>

              <div className="min-w-0 flex-1">
                <Link
                  to={`/jobs/${item.job.id}`}
                  className="text-body font-semibold text-slate-900 hover:text-brand-700 rounded
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {item.job.title}
                </Link>
                <p className="text-meta text-slate-600 mt-0.5">
                  {item.fact} {item.detail}
                </p>
              </div>

              <Link to={item.to} className="btn btn-sm btn-secondary shrink-0 sm:w-auto w-full justify-center">
                {item.actionLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export { deriveNextAction };
export default NeedsAttention;
