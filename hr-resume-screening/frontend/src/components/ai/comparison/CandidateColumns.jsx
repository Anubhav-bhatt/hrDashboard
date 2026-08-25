import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ChevronDown, ExternalLink, Loader2, Search, X } from 'lucide-react';
import { Avatar, cx } from '../../ui';
import { HR_STATUS_META, formatExperience } from '../../../utils/format';

/**
 * Candidate identity across the top of the comparison, and their strengths and
 * gaps underneath it.
 *
 * The header is identity only — who is this, how well do they match, where are
 * they in the process. Everything comparative lives in the matrix. Repeating
 * skills and evidence here, as the previous layout did, meant the same match
 * score appeared three times on one screen and the recruiter had to work out
 * which copy to trust.
 */

/**
 * A very quiet per-column accent, so a value in the matrix can be traced back to
 * a person without reading the header again. Deliberately five near-neutral
 * tints: candidate identity should not become a colour code, and the accent
 * carries no meaning beyond "same column".
 */
const COLUMN_ACCENTS = [
  'border-t-sky-300',
  'border-t-violet-300',
  'border-t-teal-300',
  'border-t-amber-300',
  'border-t-rose-300'
];

/** Only render a status we actually have copy for, never a raw enum. */
const statusLabel = (status) => HR_STATUS_META[status]?.label || null;

const CandidateHeaderCard = ({
  candidate,
  index,
  jobId,
  onScreen,
  onShortlist,
  onRemove,
  shortlisting = false,
  canRemove = false
}) => {
  const label = statusLabel(candidate.status);
  const hasMandatoryGaps = Array.isArray(candidate.mandatoryGaps) && candidate.mandatoryGaps.length > 0;
  const alreadyShortlisted = candidate.status === 'SHORTLISTED' || candidate.isShortlisted;

  return (
    <li
      className={cx(
        'relative flex flex-col rounded-card border border-slate-200 border-t-2 bg-white p-4',
        COLUMN_ACCENTS[index % COLUMN_ACCENTS.length]
      )}
    >
      {/* Removal is available but quiet: it is a correction, not a decision, and
          a prominent red control under every candidate would read as "reject". */}
      {canRemove && (
        <button
          type="button"
          onClick={() => onRemove?.(candidate.candidateId)}
          className="absolute top-2 right-2 p-1 rounded text-slate-400 hover:text-slate-700
                     hover:bg-slate-100 transition-colors duration-fast
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label={`Remove ${candidate.candidateName} from this comparison`}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}

      <div className="flex items-start gap-3 pr-6">
        <Avatar name={candidate.candidateName} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="text-card-title text-slate-900 break-words">{candidate.candidateName}</h3>
          {candidate.currentRole && (
            <p className="text-meta text-slate-500 mt-0.5 line-clamp-2">{candidate.currentRole}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {typeof candidate.matchScore === 'number' ? (
            <p className="text-metric text-slate-900 tabular-nums leading-none">{candidate.matchScore}%</p>
          ) : (
            <p className="text-body text-slate-500">Unscored</p>
          )}
          <p className="text-label uppercase text-slate-500 mt-1">Match</p>
        </div>

        <div className="text-right min-w-0">
          {candidate.statedYears !== null && candidate.statedYears !== undefined && (
            <p className="text-meta text-slate-600 tabular-nums">
              {formatExperience(candidate.statedYears, '')}
            </p>
          )}
          {label && <p className="text-meta text-slate-500 truncate">{label}</p>}
        </div>
      </div>

      {hasMandatoryGaps && (
        <p className="mt-3 flex items-start gap-1.5 text-meta text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span className="min-w-0">Missing {candidate.mandatoryGaps.join(', ')}</span>
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onScreen?.(jobId, candidate.candidateId)}
          className="btn btn-sm btn-secondary"
          aria-label={`Screen ${candidate.candidateName}`}
        >
          <Search className="w-3.5 h-3.5" aria-hidden="true" />
          Screen
        </button>

        <button
          type="button"
          onClick={() => onShortlist?.(candidate)}
          disabled={shortlisting || alreadyShortlisted}
          className="btn btn-sm btn-ghost"
          aria-label={
            alreadyShortlisted
              ? `${candidate.candidateName} is already shortlisted`
              : `Shortlist ${candidate.candidateName}`
          }
        >
          {shortlisting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {alreadyShortlisted ? 'Shortlisted' : shortlisting ? 'Saving…' : 'Shortlist'}
        </button>

        <Link
          to={`/candidates/${candidate.candidateId}`}
          className="btn btn-sm btn-ghost ml-auto"
          aria-label={`Open full profile for ${candidate.candidateName}`}
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Profile</span>
        </Link>
      </div>
    </li>
  );
};

/**
 * The identity strip. Columns match the matrix order exactly, because the two are
 * read together — a mismatch between them would be worse than no strip at all.
 */
export const CandidateHeaderStrip = ({
  candidates = [],
  jobId,
  onScreen,
  onShortlist,
  onRemove,
  shortlistingId = null,
  canRemove = false,
  className
}) => {
  if (candidates.length === 0) return null;

  return (
    <section aria-labelledby="comparison-candidates-heading" className={cx('min-w-0', className)}>
      <h3 id="comparison-candidates-heading" className="sr-only">
        Candidates being compared
      </h3>
      <ul
        className={cx(
          'grid gap-4',
          candidates.length === 2
            ? 'grid-cols-1 sm:grid-cols-2'
            : candidates.length === 3
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              : candidates.length === 4
                ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
        )}
      >
        {candidates.map((candidate, index) => (
          <CandidateHeaderCard
            key={candidate.candidateId}
            candidate={candidate}
            index={index}
            jobId={jobId}
            onScreen={onScreen}
            onShortlist={onShortlist}
            onRemove={onRemove}
            shortlisting={shortlistingId === candidate.candidateId}
            canRemove={canRemove}
          />
        ))}
      </ul>
    </section>
  );
};

/**
 * Strengths and gaps per candidate, collapsed.
 *
 * The matrix already answers "who meets what". This is the evidence behind those
 * answers, which matters when a recruiter is writing up a decision but is noise
 * while they are still making one — so it opens on request.
 */
export const StrengthsAndGaps = ({ candidates = [], className }) => {
  const [open, setOpen] = useState(false);

  const withDetail = candidates.filter(
    (c) => (c.strengths?.length || 0) > 0 || (c.gaps?.length || 0) > 0
  );
  if (withDetail.length === 0) return null;

  return (
    <section className={cx('min-w-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="comparison-strengths-gaps"
        className="w-full card card-pad-sm flex items-center justify-between gap-3 text-left
                   hover:border-slate-300 transition-colors duration-fast
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <span className="min-w-0">
          <span className="section-title">Strengths and gaps per candidate</span>
          <span className="block text-meta text-slate-500 mt-0.5">
            The matched and missing requirements behind each column.
          </span>
        </span>
        <ChevronDown
          className={cx('w-4 h-4 text-slate-500 shrink-0 transition-transform duration-fast', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {/*
        The display class is applied only when open.
        `hidden` is just `display: none` from the user-agent stylesheet, so any
        author `display` declaration — `grid` here — outranks it and the panel
        renders expanded with the attribute still set. Withholding the class
        keeps `hidden` effective while leaving the element in the DOM for
        `aria-controls` to point at.
      */}
      <div
        id="comparison-strengths-gaps"
        hidden={!open}
        className={cx('mt-4', open && 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4')}
      >
        {withDetail.map((candidate) => (
          <div key={candidate.candidateId} className="card card-pad-sm">
            <h4 className="text-card-title text-slate-900 truncate">{candidate.candidateName}</h4>

            {candidate.strengths?.length > 0 && (
              <div className="mt-3">
                <p className="text-label uppercase text-slate-500">Strengths</p>
                <ul className="mt-1.5 space-y-1">
                  {candidate.strengths.map((item, i) => (
                    <li key={i} className="text-meta text-slate-700">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {candidate.gaps?.length > 0 && (
              <div className="mt-3">
                <p className="text-label uppercase text-slate-500">Gaps</p>
                <ul className="mt-1.5 space-y-1">
                  {candidate.gaps.map((item, i) => (
                    <li key={i} className="text-meta text-slate-600">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default CandidateHeaderStrip;
