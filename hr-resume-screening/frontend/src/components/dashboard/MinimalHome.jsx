import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Briefcase, CheckCircle2, Plus } from 'lucide-react';
import PageHeader from '../layout/PageHeader';
import RecommendedNextStep from '../workspace/RecommendedNextStep';
import JobWorkItem from '../workspace/JobWorkItem';
import { EmptyState, Skeleton } from '../ui';

/**
 * Minimal Mode's home: a work queue, not a dashboard.
 *
 * Standard Mode's home orients first and decides second — a snapshot of four
 * figures, then the recommendation, then the queue, then the analytics behind a
 * disclosure. That order is right for a recruiter who wants to understand their
 * pipeline before touching it.
 *
 * This one answers a narrower question: what should I work on now. So the work
 * comes first and the numbers come last, reduced to a single line of prose. No
 * KPI grid, no charts, no pipeline breakdown, no recent-activity feed — those
 * are all still one click away in Standard Mode and in Hiring Insights, and the
 * links at the foot of this page say so.
 *
 * It fetches nothing. The dashboard already loads job summaries and the overview
 * for its own use and passes them down, so entering Minimal Mode reorganises the
 * page rather than reloading it.
 */

/**
 * The whole snapshot, as one sentence.
 *
 * Rendered only once the numbers have actually arrived: printing "0 active jobs"
 * at an established workspace for one frame is worse than printing nothing, and
 * a guided mode has no business showing a figure it is about to correct.
 */
const SummaryLine = ({ openJobs, pendingReview, loading }) => {
  if (loading) return <Skeleton className="h-4 w-56" />;

  const parts = [];
  if (openJobs > 0) parts.push(`${openJobs} active job${openJobs === 1 ? '' : 's'}`);
  if (pendingReview > 0) parts.push(`${pendingReview} awaiting review`);
  if (parts.length === 0) return null;

  return <p className="text-meta text-slate-500">{parts.join(' · ')}</p>;
};

const QueueSkeleton = () => (
  <ul className="divide-y divide-slate-100" aria-label="Loading your hiring work">
    {Array.from({ length: 3 }, (_, i) => (
      <li key={i} className="py-4 space-y-2">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </li>
    ))}
  </ul>
);

const MinimalHome = ({
  attentionItems = [],
  metrics = null,
  threshold = 80,
  jobsPending = false,
  hasLoadedJobs = false,
  openJobCount = 0
}) => {
  /*
   * The queue is already ordered.
   *
   * `deriveAttentionItems` sorts by the funnel — a role with a candidate chosen
   * outranks one with a pending shortlist, which outranks unscored resumes — so
   * this renders that order rather than inventing a second notion of urgency.
   */
  const [lead, ...rest] = attentionItems;
  const nextUp = rest.slice(0, 4);
  const remaining = Math.max(attentionItems.length - 1 - nextUp.length, 0);

  const header = (
    <PageHeader
      title="Home"
      description="Your hiring work, most urgent first."
      className="mb-0"
      primaryAction={
        <Link to="/jobs/new" className="btn btn-sm btn-primary">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Create job</span>
        </Link>
      }
    />
  );

  /* Nothing to work on yet, because there is nothing to work on. */
  if (hasLoadedJobs && openJobCount === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={Briefcase}
          title="No active jobs"
          description="Create a job to begin screening candidates."
          action={
            <Link to="/jobs/new" className="btn btn-sm btn-primary">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Create job
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}

      <SummaryLine
        openJobs={openJobCount}
        pendingReview={metrics?.pendingReview ?? 0}
        loading={jobsPending && !hasLoadedJobs}
      />

      {jobsPending && !hasLoadedJobs ? (
        <QueueSkeleton />
      ) : lead ? (
        <>
          {/*
            One dominant action, in the stronger of the two RecommendedNextStep
            layouts. It is fed straight from the head of the queue, so the hero
            and the list below it can never disagree about what matters most.
          */}
          <RecommendedNextStep
            title={lead.fact}
            description={lead.detail}
            actionLabel={lead.actionLabel}
            to={lead.to}
            icon={lead.icon}
            badge={
              <span className="text-[11px] font-bold text-slate-500 truncate max-w-[14rem]">
                {lead.job.title}
              </span>
            }
          />

          {nextUp.length > 0 && (
            <section aria-labelledby="minimal-home-queue-heading">
              <h2 id="minimal-home-queue-heading" className="section-title">
                Next up
              </h2>
              <ul className="divide-y divide-slate-100 mt-1">
                {nextUp.map((item) => (
                  <JobWorkItem key={item.job.id} job={item.job} attention={item} threshold={threshold} />
                ))}
              </ul>
              {remaining > 0 && (
                <p className="text-meta text-slate-500 mt-3">
                  {remaining === 1 ? '1 more role needs' : `${remaining} more roles need`} attention.
                </p>
              )}
            </section>
          )}
        </>
      ) : (
        /*
          Every role is up to date. Said plainly rather than with an empty
          panel, because "nothing needs attention" is good news about a
          workspace that is working, not a missing feature.
        */
        <section
          aria-label="Hiring status"
          className="flex items-start gap-3 rounded-panel border border-emerald-200 bg-emerald-50 px-4 py-3.5"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-body font-bold text-slate-900">Nothing needs attention</p>
            <p className="text-meta text-slate-600 mt-0.5">
              Every active role is up to date. Add candidates to keep a pipeline moving.
            </p>
          </div>
        </section>
      )}

      {/*
        Where the rest of the product is.
        Minimal Mode shows less; it must never be the mode that can reach less.
        These are quiet text links, not a row of competing buttons.
      */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
        <Link
          to="/jobs"
          className="inline-flex items-center gap-1.5 text-meta font-bold text-brand-700 hover:text-brand-800
                     rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          View all active jobs
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
        <Link
          to="/ai/insights"
          className="inline-flex items-center gap-1.5 text-meta font-bold text-slate-600 hover:text-slate-900
                     rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
          See hiring insights
        </Link>
      </div>
    </>
  );
};

export default MinimalHome;
