import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase } from 'lucide-react';
import { EmptyState, Skeleton } from '../ui';

/**
 * Which roles are moving, and how far along each one is.
 *
 * Deliberately not a job card: the Jobs page and the job workspace already
 * render the full picture, and repeating it here would make the dashboard a
 * second Jobs page. A row carries the title, the three counts that describe
 * progress, and one way in.
 *
 * The counts are stated as words rather than as a chart because at three numbers
 * a sentence is faster to read than a graphic, and because "0 shortlisted" is
 * information a bar of zero width loses.
 */
const JobRow = ({ job }) => {
  const candidateCount = job.candidateCount || 0;
  const strong = job.strongMatchCount || 0;
  const shortlisted = job.shortlistedCount || 0;

  // Only facts that exist. A role with nothing in it says so, rather than
  // rendering "0 candidates · 0 strong · 0 shortlisted".
  const facts =
    candidateCount === 0
      ? ['No candidates yet']
      : [
          `${candidateCount.toLocaleString('en-IN')} candidate${candidateCount === 1 ? '' : 's'}`,
          strong > 0 ? `${strong} strong match${strong === 1 ? '' : 'es'}` : null,
          shortlisted > 0 ? `${shortlisted} shortlisted` : null
        ].filter(Boolean);

  return (
    <li>
      <Link
        to={`/jobs/${job.id}`}
        className="group flex items-center gap-4 px-5 py-4 transition-colors duration-fast
                   hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-brand-500 focus-visible:ring-inset"
        aria-label={`Open ${job.title}: ${facts.join(', ')}`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-card-title text-slate-900 truncate group-hover:text-brand-700 transition-colors duration-fast">
            {job.title}
          </p>
          <p className="text-meta text-slate-600 mt-0.5 truncate">{facts.join(' · ')}</p>
        </div>

        <span className="text-meta text-brand-700 hidden sm:inline shrink-0">View</span>
        <ArrowRight
          className="w-4 h-4 text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5
                     transition-all duration-fast shrink-0"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
};

const ActiveHiring = ({ jobs = [], loading = false, limit = 4 }) => {
  const visible = jobs.slice(0, limit);

  return (
    <section aria-labelledby="dashboard-active-hiring-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="dashboard-active-hiring-heading" className="section-title">
            Active hiring
          </h2>
          <p className="text-meta text-slate-500 mt-0.5">Roles currently open for candidates.</p>
        </div>

        {jobs.length > limit && (
          <Link to="/jobs" className="btn btn-sm btn-ghost shrink-0">
            View all jobs
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>

      <div className="mt-4 card p-0 overflow-hidden">
        {loading ? (
          <ul className="divide-y divide-slate-100">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <Skeleton className="h-4 w-4 rounded shrink-0" />
              </li>
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Briefcase}
              title="No active roles"
              description="Create a job to start screening candidates against it."
              action={
                <Link to="/jobs/new" className="btn btn-sm btn-primary">
                  Create job
                </Link>
              }
              className="border-0 shadow-none py-6"
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default ActiveHiring;
