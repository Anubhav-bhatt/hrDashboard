import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, CheckCircle2, UserPlus, Users } from 'lucide-react';
import { Avatar, JobStatusBadge, cx } from '../ui';
import { formatDate, formatExperience, formatRelativeTime } from '../../utils/format';

/**
 * Operational processing state, derived from candidate counts. Separate from the
 * persisted Active/Closed lifecycle, and superseded by it once a job is closed.
 */
const PROCESSING_META = {
  COMPLETED: { label: 'All scored', variant: 'success' },
  READY_FOR_ANALYSIS: { label: 'Ready to score', variant: 'warning' },
  IMPORTING: { label: 'Importing', variant: 'info' },
  NEW: { label: 'New', variant: 'neutral' }
};

/**
 * One recruitment figure inside a job card.
 *
 * Deliberately not a bordered tile: three or four boxed tiles per card, across a
 * grid of a dozen cards, reads as a spreadsheet. The number carries the weight
 * and the label sits quietly beneath it.
 */
const Stat = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="min-w-0">
    <p className={cx('text-card-title tabular-nums leading-none', tone)}>{value}</p>
    <p className="text-[11px] text-slate-500 mt-1 leading-tight truncate">{label}</p>
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
 * A closed job keeps the same layout — only its badge, metrics and actions
 * change — so a mixed list of active and closed roles stays easy to scan.
 *
 * @param {Object} props
 * @param {Object} props.job Job summary including aggregated candidate counts
 * @param {number} [props.strongMatchThreshold=80] Used only for the stat label
 * @param {boolean} [props.compact=false] Denser variant for the dashboard
 * @param {Function} [props.onCloseJob] Offers the Close Job action when provided
 */
const JobSummaryCard = ({ job, strongMatchThreshold = 80, compact = false, onCloseJob }) => {
  const processing = PROCESSING_META[job.processingStatus] || PROCESSING_META.NEW;
  const hasCandidates = job.candidateCount > 0;
  const isClosed = job.status === 'CLOSED';
  const hire = job.selectedCandidate || null;
  // Closing is only meaningful once somebody has been shortlisted.
  const canClose = !isClosed && job.shortlistedCount > 0;

  // The card body opens the candidate list for an active job, and the job's
  // record for a closed one, where there is nothing left to action.
  const bodyHref = isClosed ? `/jobs/${job.id}` : `/jobs/${job.id}/candidates`;

  return (
    <div className="card hover:shadow-card-hover hover:border-slate-300 transition duration-fast flex flex-col">
      <Link
        to={bodyHref}
        className={cx(
          'group flex-1 rounded-card focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset',
          compact ? 'p-4' : 'p-5'
        )}
        aria-label={isClosed ? `View closed job ${job.title}` : `View ${job.candidateCount} candidates for ${job.title}`}
      >
        {/* Status first: whether a role is live is the thing a recruiter scans
            for down a column of cards. */}
        <div className="flex items-center justify-between gap-3">
          <JobStatusBadge status={job.status} />
          {!isClosed && !compact && (
            <span className="text-[11px] text-slate-400 truncate">{processing.label}</span>
          )}
        </div>

        <h3 className="text-card-title text-slate-900 line-clamp-2 mt-2.5 group-hover:text-brand-700 transition-colors duration-fast">
          {job.title}
        </h3>

        {/* Skills as one quiet middot-separated line rather than a row of chips —
            on a card they are context for the title, not interactive filters. */}
        {job.requiredSkills?.length > 0 && (
          <p className="text-meta text-slate-500 mt-1.5 truncate" title={job.requiredSkills.join(' · ')}>
            {job.requiredSkills.slice(0, compact ? 3 : 4).join(' · ')}
            {job.requiredSkills.length > (compact ? 3 : 4)
              ? ` · +${job.requiredSkills.length - (compact ? 3 : 4)}`
              : ''}
          </p>
        )}

        {isClosed ? (
          /* Historical summary: who was hired and when, not the full analytics
             a live job needs. */
          <>
            {hire && (
              <div className="mt-3 rounded-control border border-brand-200 bg-brand-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Selected candidate
                </p>
                <div className="flex items-center gap-2.5 mt-2">
                  <Avatar name={hire.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-slate-900 truncate">{hire.name}</p>
                    <p className="text-[11px] text-slate-600 truncate">
                      {[hire.currentRole, formatExperience(hire.totalExperience)].filter(Boolean).join(' · ') ||
                        'Role not stated'}
                    </p>
                  </div>
                  {hire.overallScore !== null && hire.overallScore !== undefined && (
                    <span className="text-meta font-semibold text-brand-700 tabular-nums shrink-0">
                      {Math.round(hire.overallScore)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-meta text-slate-500">
                {job.candidateCount} candidate{job.candidateCount === 1 ? '' : 's'} reviewed
              </span>
              <span className="text-meta text-slate-500 shrink-0">Closed {formatDate(job.closedAt)}</span>
            </div>
          </>
        ) : (
          <>
            {/* Recruitment counts: the pipeline at a glance. */}
            <div className={cx('grid gap-3 mt-4', compact ? 'grid-cols-2' : 'grid-cols-3')}>
              <Stat label="Candidates" value={job.candidateCount} />
              <Stat
                label={`${strongMatchThreshold}%+ matches`}
                value={job.strongMatchCount}
                tone={job.strongMatchCount > 0 ? 'text-emerald-700' : 'text-slate-900'}
              />
              {!compact && <Stat label="Shortlisted" value={job.shortlistedCount} />}
            </div>

            {/* Best match gets its own labelled row with a slim meter — it is the
                single number that tells a recruiter whether this pipeline is
                worth opening. */}
            <div className="mt-4 pt-3.5 border-t border-slate-100">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-meta text-slate-500">Best match</span>
                <span
                  className={cx(
                    'text-card-title tabular-nums',
                    job.bestMatchScore !== null ? 'text-brand-700' : 'text-slate-400'
                  )}
                >
                  {job.bestMatchScore === null ? 'Not scored' : `${job.bestMatchScore}%`}
                </span>
              </div>
              {job.bestMatchScore !== null && (
                <div className="mt-2 h-1 w-full rounded-pill bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-pill bg-brand-500"
                    style={{ width: `${Math.min(Math.max(job.bestMatchScore, 0), 100)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="mt-3.5 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400 truncate">
                Updated {formatRelativeTime(job.updatedAt || job.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-meta font-semibold text-brand-700 shrink-0">
                {hasCandidates ? 'View job' : 'Add candidates'}
                <ArrowRight
                  className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-fast"
                  aria-hidden="true"
                />
              </span>
            </div>
          </>
        )}
      </Link>

      {/*
        One action per card, as a sibling of the card link so no anchors nest.
        A closed role leads to the person hired; an empty role leads to adding
        candidates; anything else opens the job, from where every other action for
        that job is one click away. Offering four equal buttons here was the main
        source of visual noise in a list of a dozen roles.
      */}
      <div className="border-t border-slate-100 px-3 py-2 flex items-center gap-1">
        {isClosed ? (
          <>
            {hire && (
              <Link to={`/jobs/${job.id}/candidates/${hire.id}`} className="btn btn-sm btn-ghost flex-1">
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                View candidate
              </Link>
            )}
            <Link to={`/jobs/${job.id}`} className="btn btn-sm btn-ghost flex-1">
              <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
              View job
            </Link>
          </>
        ) : !hasCandidates ? (
          <Link to={`/jobs/${job.id}/import`} className="btn btn-sm btn-secondary flex-1">
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
            Add candidates
          </Link>
        ) : canClose && onCloseJob ? (
          <>
            <Link to={`/jobs/${job.id}`} className="btn btn-sm btn-ghost flex-1">
              <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
              Open job
            </Link>
            {/* A shortlist exists, so the next real step is choosing the hire.
                Phrased as the decision, not as an administrative operation. */}
            <button type="button" onClick={() => onCloseJob(job)} className="btn btn-sm btn-secondary flex-1">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Review shortlist
            </button>
          </>
        ) : (
          <Link to={`/jobs/${job.id}`} className="btn btn-sm btn-secondary flex-1">
            <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
            Open job
          </Link>
        )}
      </div>
    </div>
  );
};

export default JobSummaryCard;
