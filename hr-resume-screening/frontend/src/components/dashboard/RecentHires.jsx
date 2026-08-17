import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Avatar, Card, CardHeader, EmptyState, Skeleton } from '../ui';
import { formatDate, formatExperience } from '../../utils/format';

/**
 * The most recent hiring outcomes across the workspace.
 *
 * Each row answers who was hired, for which role, how well they matched and
 * when the job closed — and nothing more, so the row stays scannable. The
 * candidate name and the job title are separate links because they lead to
 * different places, and neither nests inside the other.
 */
const RecentHires = ({ hires = [], loading = false }) => (
  <Card padding="p-0">
    <div className="px-5 py-4 border-b border-slate-100">
      <CardHeader
        title="Recent hires"
        description="Candidates selected when a job was closed."
        actions={
          hires.length > 0 && (
            <Link to="/jobs/closed" className="btn btn-sm btn-ghost">
              View closed jobs
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          )
        }
      />
    </div>

    {loading ? (
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="px-5 py-3 flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-pill shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-3.5 w-12" />
          </div>
        ))}
      </div>
    ) : hires.length === 0 ? (
      <div className="p-5">
        <EmptyState
          icon={CheckCircle2}
          title="No hires yet"
          description="Close a job with a selected candidate and the hire will appear here."
        />
      </div>
    ) : (
      <ul className="divide-y divide-slate-100">
        {hires.map((hire) => (
          <li
            key={`${hire.jobId}-${hire.candidateId}`}
            className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors duration-fast"
          >
            <Avatar name={hire.candidateName} size="sm" />

            <div className="min-w-0 flex-1">
              <Link
                to={`/jobs/${hire.jobId}/candidates/${hire.candidateId}`}
                className="text-body font-medium text-slate-900 hover:text-brand-700 rounded
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {hire.candidateName || 'Unnamed candidate'}
              </Link>
              <p className="text-meta text-slate-500 truncate">
                <Link
                  to={`/jobs/${hire.jobId}`}
                  className="hover:text-brand-700 hover:underline rounded
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {hire.jobTitle}
                </Link>
                {hire.totalExperience ? ` · ${formatExperience(hire.totalExperience)}` : ''}
              </p>
            </div>

            <div className="text-right shrink-0">
              {hire.overallScore !== null && hire.overallScore !== undefined && (
                <p className="text-meta font-semibold text-brand-700 tabular-nums">
                  {Math.round(hire.overallScore)}% match
                </p>
              )}
              <p className="text-[11px] text-slate-500">{formatDate(hire.closedAt)}</p>
            </div>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

export default RecentHires;
