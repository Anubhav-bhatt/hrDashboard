import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Skeleton } from '../ui';

/**
 * The one thing worth doing next, stated in a sentence.
 *
 * "Needs your attention" below this lists the next step for several roles; this
 * names the single highest-priority one so a recruiter who wants to be told
 * where to start does not have to compare the cards themselves. It is derived
 * from the same `deriveNextAction` ordering, so the two can never disagree —
 * this is the first item of that list, promoted, not a second opinion.
 *
 * Rendered only when there is a real item to name. With nothing waiting there is
 * no recommendation to make, and inventing one ("all caught up!") would add a
 * banner that carries no decision.
 */
const RecommendedAction = ({ item, loading = false }) => {
  if (loading) {
    return (
      <div className="rounded-card border border-slate-200 border-l-2 border-l-brand-600 bg-white px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-5 w-72 max-w-full" />
          </div>
          <Skeleton className="h-9 w-40 rounded-control shrink-0" />
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <section
      aria-labelledby="dashboard-recommended-heading"
      className="rounded-card border border-slate-200 border-l-2 border-l-brand-600 bg-white px-5 py-4 sm:px-6 sm:py-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2
            id="dashboard-recommended-heading"
            className="text-label uppercase text-brand-700 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            Recommended next step
          </h2>

          <p className="text-body text-slate-900 mt-1.5">
            <Link
              to={`/jobs/${item.job.id}`}
              className="font-bold rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {item.job.title}
            </Link>
            {' — '}
            {item.fact} {item.detail}
          </p>
        </div>

        <Link
          to={item.to}
          className="btn btn-md btn-primary shrink-0 justify-center"
          aria-label={`${item.actionLabel} for ${item.job.title}`}
        >
          {item.actionLabel}
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
};

export default RecommendedAction;
