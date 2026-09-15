import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, DownloadCloud, FileText, Users } from 'lucide-react';
import { Badge, cx } from './ui';
import { formatDate } from '../utils/format';

const STATUS_META = {
  COMPLETED: { label: 'All scored', variant: 'success' },
  READY_FOR_ANALYSIS: { label: 'Ready to score', variant: 'warning' },
  IMPORTING: { label: 'Importing', variant: 'info' },
  NEW: { label: 'New', variant: 'neutral' }
};

/**
 * Job summary card.
 *
 * The card body is one link into the job workspace; the two secondary
 * destinations sit in a footer row outside that link, so there are no nested
 * interactive elements.
 */
const JobCard = ({ job }) => {
  const status = STATUS_META[job.status] || STATUS_META.NEW;
  const requiredSkills = job.requirements?.requiredSkills || [];

  const stats = [
    { label: 'Candidates', value: job.candidatesCount || 0, tone: 'text-slate-900' },
    { label: 'Scored', value: job.analyzedCount || 0, tone: 'text-slate-900' },
    { label: job.strongMatchThreshold ? `${job.strongMatchThreshold}%+ match` : 'Strong matches', value: job.highMatchCount || 0, tone: 'text-emerald-700' }
  ];

  return (
    <div className="card hover:shadow-card-hover hover:border-slate-300 transition duration-fast flex flex-col">
      <Link
        to={`/jobs/${job._id}`}
        className="group flex-1 p-5 rounded-card focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
        aria-label={`Open job: ${job.title}`}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-card-title text-slate-900 line-clamp-2 group-hover:text-brand-700 transition-colors duration-fast">
            {job.title}
          </h3>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <div className="mt-3 space-y-1.5 text-xs text-slate-500">
          <p className="flex items-center gap-1.5 min-w-0">
            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="truncate" title={job.jdFileName}>
              {job.jdFileName}
            </span>
          </p>
          <p className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            Created {formatDate(job.createdAt)}
          </p>
        </div>

        {requiredSkills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {requiredSkills.slice(0, 4).map((skill) => (
              <span key={skill} className="chip py-0.5 text-[11px]">
                {skill}
              </span>
            ))}
            {requiredSkills.length > 4 && (
              <span className="chip py-0.5 text-[11px] text-slate-500">+{requiredSkills.length - 4}</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mt-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-control border border-slate-200 bg-slate-50 px-2 py-2 text-center">
              <p className="text-[11px] text-slate-500 font-medium">{stat.label}</p>
              <p className={cx('text-card-title mt-0.5 tabular-nums', stat.tone)}>{stat.value}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 inline-flex items-center gap-1.5 text-meta font-semibold text-brand-700">
          Open workspace
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-fast" aria-hidden="true" />
        </p>
      </Link>

      <div className="border-t border-slate-100 px-3 py-2 flex items-center gap-1">
        <Link to={`/jobs/${job._id}/import`} className="btn btn-sm btn-ghost flex-1">
          <DownloadCloud className="w-3.5 h-3.5" aria-hidden="true" />
          Import
        </Link>
        <Link to={`/candidates?jobId=${job._id}&sort=score_desc`} className="btn btn-sm btn-ghost flex-1">
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          Candidates
        </Link>
      </div>
    </div>
  );
};

export default JobCard;
