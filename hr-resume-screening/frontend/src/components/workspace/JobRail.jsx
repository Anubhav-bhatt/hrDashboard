import React from 'react';
import { Briefcase } from 'lucide-react';
import { Skeleton, cx } from '../ui';

/**
 * The role rail.
 *
 * One job is in focus at a time, which is what keeps the minimalist workspace
 * from turning back into a dashboard: everything to the right of this rail
 * answers a question about exactly one role. Each entry carries the count that
 * decides whether it is worth opening — how many candidates already clear the
 * strong-match threshold — taken from the same job summary the jobs portal uses.
 */

const RailSkeleton = () => (
  <div className="space-y-1.5" aria-label="Loading roles">
    {Array.from({ length: 4 }, (_, index) => (
      <div key={index} className="px-3 py-2.5 rounded-control">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-2 h-3 w-20" />
      </div>
    ))}
  </div>
);

/**
 * Describes a role's pool in one line.
 *
 * "Strong" is only ever said when candidates actually clear the server's
 * threshold. A role with applicants but none above the bar says so rather than
 * borrowing the word.
 */
const railSummary = (job) => {
  const strong = job.strongMatchCount || 0;
  const total = job.candidateCount || 0;

  if (total === 0) return 'No candidates yet';
  if (strong === 0) return `${total} candidate${total === 1 ? '' : 's'}`;
  return `${strong} strong`;
};

const JobRail = ({ jobs, selectedJobId, onSelect, loading = false, className }) => {
  if (loading) {
    return (
      <div className={className}>
        <p className="text-label uppercase text-slate-500 px-3 mb-2">Jobs</p>
        <RailSkeleton />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className={className}>
        <p className="text-label uppercase text-slate-500 px-3 mb-2">Jobs</p>
        <p className="px-3 text-meta text-slate-500">No open roles.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-label uppercase text-slate-500 px-3 mb-2" id="focus-job-rail-label">
        Jobs
      </p>

      <div
        role="radiogroup"
        aria-labelledby="focus-job-rail-label"
        className="space-y-1 max-h-[22rem] lg:max-h-[30rem] overflow-y-auto scroll-slim pr-0.5"
      >
        {jobs.map((job) => {
          const active = job.id === selectedJobId;

          return (
            <button
              key={job.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(job.id)}
              className={cx(
                'w-full text-left px-3 py-2.5 rounded-control transition-colors duration-fast min-w-0',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                active ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-100 text-slate-700'
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                {/* A filled versus hollow marker, so the focused role is
                    distinguishable without relying on the tint alone. */}
                <span
                  className={cx(
                    'w-2 h-2 rounded-full shrink-0 border',
                    active ? 'bg-brand-600 border-brand-600' : 'bg-transparent border-slate-300'
                  )}
                  aria-hidden="true"
                />
                <span className={cx('truncate text-meta', active ? 'font-bold' : 'font-medium')}>{job.title}</span>
              </span>
              <span className="mt-0.5 block pl-4 text-xs text-slate-500 truncate">{railSummary(job)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Compact role picker for narrow screens, where a vertical rail costs too much height. */
export const JobRailSelect = ({ jobs, selectedJobId, onSelect, loading = false, className }) => (
  <div className={className}>
    <label htmlFor="focus-job-select" className="field-label">
      <span className="inline-flex items-center gap-1.5">
        <Briefcase className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        Job
      </span>
    </label>
    <select
      id="focus-job-select"
      className="select"
      value={selectedJobId || ''}
      disabled={loading || jobs.length === 0}
      onChange={(event) => onSelect(event.target.value)}
    >
      {jobs.length === 0 && <option value="">No open roles</option>}
      {jobs.map((job) => (
        <option key={job.id} value={job.id}>
          {job.title} — {railSummary(job)}
        </option>
      ))}
    </select>
  </div>
);

export default JobRail;
