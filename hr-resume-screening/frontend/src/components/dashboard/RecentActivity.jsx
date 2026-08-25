import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText } from 'lucide-react';
import { Avatar, EmptyState, Skeleton, cx } from '../ui';
import { formatRelativeTime, getScoreMeta } from '../../utils/format';

/**
 * The newest candidates to enter the workspace.
 *
 * A note on what this is *not*: the product has no activity-log endpoint. There
 * is an `activityService` on the backend, but it records events per candidate and
 * is only read on a candidate's own timeline — there is no workspace-wide feed to
 * query. So rather than invent "Priya was screened 22 minutes ago" from data that
 * does not exist, this section shows the one workspace-wide stream of timestamped
 * events the API does return: candidates as they arrive, newest first, from
 * `overview.recentCandidates`.
 *
 * Every value here is therefore real. If a genuine activity feed is added later,
 * this component is where it plugs in.
 */
const RecentActivity = ({ candidates = [], loading = false, viewAllTo = '/candidates?sort=newest', limit = 5 }) => {
  const visible = candidates.slice(0, limit);

  return (
    <section aria-labelledby="dashboard-activity-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="dashboard-activity-heading" className="section-title">
            Recent activity
          </h2>
          <p className="text-meta text-slate-500 mt-0.5">The latest candidates added to your roles.</p>
        </div>

        {candidates.length > 0 && (
          <Link to={viewAllTo} className="btn btn-sm btn-ghost shrink-0">
            View all
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>

      <div className="mt-4 card p-0 overflow-hidden">
        {loading ? (
          <ul className="divide-y divide-slate-100">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                <Skeleton className="w-8 h-8 rounded-pill shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40 max-w-full" />
                  <Skeleton className="h-3 w-52 max-w-full" />
                </div>
                <Skeleton className="h-3 w-10 shrink-0" />
              </li>
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={FileText}
              title="No candidates yet"
              description="Once resumes are added to a role, the newest arrivals show up here."
              className="border-0 shadow-none py-6"
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((candidate) => {
              const id = candidate.id || candidate._id;
              const score = candidate.overallScore ?? candidate.matchAnalysis?.overallScore;
              const scoreMeta = getScoreMeta(score);
              const when = formatRelativeTime(candidate.createdAt, '');

              return (
                <li key={id}>
                  <Link
                    to={`/candidates/${id}`}
                    className="group flex items-center gap-3 px-5 py-3.5 transition-colors duration-fast
                               hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2
                               focus-visible:ring-brand-500 focus-visible:ring-inset"
                    aria-label={`Open profile for ${candidate.name}`}
                  >
                    <Avatar name={candidate.name} size="sm" />

                    <div className="min-w-0 flex-1">
                      <p className="text-meta font-bold text-slate-900 truncate group-hover:text-brand-700 transition-colors duration-fast">
                        {candidate.name}
                      </p>
                      <p className="text-meta text-slate-500 truncate">
                        {[candidate.jobTitle ? `Added to ${candidate.jobTitle}` : 'Added', when]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    {score !== undefined && score !== null && (
                      <span className={cx('text-meta font-bold tabular-nums shrink-0', scoreMeta.text)}>
                        {Math.round(score)}%
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export default RecentActivity;
