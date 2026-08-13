import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, DownloadCloud, FileText, Settings2, Users } from 'lucide-react';
import { Badge, cx } from '../ui';
import { formatDate } from '../../utils/format';

const STATUS_META = {
  COMPLETED: { label: 'All scored', variant: 'success' },
  READY_FOR_ANALYSIS: { label: 'Ready to score', variant: 'warning' },
  IMPORTING: { label: 'Importing', variant: 'info' },
  NEW: { label: 'New', variant: 'neutral' }
};

/** One KPI figure inside a job card. */
const Stat = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="rounded-control border border-slate-200 bg-slate-50 px-2 py-2 text-center">
    <p className={cx('text-card-title tabular-nums', tone)}>{value}</p>
    <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-tight">{label}</p>
  </div>
);

/**
 * Job card for the jobs portal and the dashboard's jobs overview.
 *
 * The card body is the primary action and opens the job's candidate list,
 * because reviewing candidates is what a recruiter does most after a job exists.
 * Job details and import are secondary actions in a footer row, kept outside the
 * card link so there are no nested interactive elements.
 *
 * @param {Object} props
 * @param {Object} props.job Job summary including aggregated candidate counts
 * @param {number} [props.strongMatchThreshold=80] Used only for the stat label
 * @param {boolean} [props.compact=false] Denser variant for the dashboard
 */
const JobSummaryCard = ({ job, strongMatchThreshold = 80, compact = false }) => {
  const status = STATUS_META[job.status] || STATUS_META.NEW;
  const hasCandidates = job.candidateCount > 0;

  return (
    <div className="card hover:shadow-card-hover hover:border-slate-300 transition duration-fast flex flex-col">
      <Link
        to={`/jobs/${job.id}/candidates`}
        className={cx(
          'group flex-1 rounded-card focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset',
          compact ? 'p-4' : 'p-5'
        )}
        aria-label={`View ${job.candidateCount} candidates for ${job.title}`}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-card-title text-slate-900 line-clamp-2 group-hover:text-brand-700 transition-colors duration-fast">
            {job.title}
          </h3>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            {formatDate(job.createdAt)}
          </span>
          {!compact && job.jdFileName && (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[12rem]" title={job.jdFileName}>
                {job.jdFileName}
              </span>
            </span>
          )}
        </div>

        {/* Required skills as small chips — never the full job description */}
        {job.requiredSkills?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {job.requiredSkills.slice(0, compact ? 3 : 5).map((skill) => (
              <span key={skill} className="chip py-0.5 text-[11px]">
                {skill}
              </span>
            ))}
            {job.requiredSkills.length > (compact ? 3 : 5) && (
              <span className="chip py-0.5 text-[11px] text-slate-500">
                +{job.requiredSkills.length - (compact ? 3 : 5)}
              </span>
            )}
          </div>
        )}

        <div className={cx('grid gap-2 mt-4', compact ? 'grid-cols-3' : 'grid-cols-4')}>
          <Stat label="Candidates" value={job.candidateCount} />
          <Stat
            label={`${strongMatchThreshold}%+ matches`}
            value={job.strongMatchCount}
            tone={job.strongMatchCount > 0 ? 'text-emerald-700' : 'text-slate-900'}
          />
          {!compact && <Stat label="Shortlisted" value={job.shortlistedCount} />}
          <Stat
            label="Best match"
            value={job.bestMatchScore === null ? '—' : `${job.bestMatchScore}%`}
            tone={job.bestMatchScore !== null ? 'text-brand-700' : 'text-slate-400'}
          />
        </div>

        <p className="mt-4 inline-flex items-center gap-1.5 text-meta font-semibold text-brand-700">
          {hasCandidates ? 'View candidates' : 'No candidates yet'}
          <ArrowRight
            className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-fast"
            aria-hidden="true"
          />
        </p>
      </Link>

      {/* Secondary actions, siblings of the card link */}
      <div className="border-t border-slate-100 px-3 py-2 flex items-center gap-1">
        {hasCandidates ? (
          <Link to={`/jobs/${job.id}`} className="btn btn-sm btn-ghost flex-1">
            <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
            Job details
          </Link>
        ) : (
          <Link to={`/jobs/${job.id}/import`} className="btn btn-sm btn-ghost flex-1">
            <DownloadCloud className="w-3.5 h-3.5" aria-hidden="true" />
            Import candidates
          </Link>
        )}
        <Link to={`/jobs/${job.id}/candidates`} className="btn btn-sm btn-ghost flex-1">
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          Candidates
        </Link>
      </div>
    </div>
  );
};

export default JobSummaryCard;
