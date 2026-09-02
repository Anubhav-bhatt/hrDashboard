import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, MoreHorizontal, RotateCcw } from 'lucide-react';
import { formatExperience, formatRelativeTime, getScoreMeta, getStatusMeta } from '../utils/format';
import { Avatar, Badge, StatusBadge, cx } from './ui';
import { CandidateActionButtons, getCandidateActions } from './candidate/CandidateActions';

const STATUS_SURFACES = {
  REVIEW: 'candidate-card-review',
  NEEDS_REVIEW: 'candidate-card-needs-review',
  SHORTLISTED: 'candidate-card-shortlisted',
  SELECTED: 'candidate-card-selected',
  NOT_SUITABLE: 'candidate-card-not-suitable'
};

/**
 * Primary candidate browsing card. The body and contextual controls are
 * siblings, which prevents an action from also opening the candidate.
 */
const CandidateCard = ({
  candidate,
  isCompared = false,
  comparisonDisabled = false,
  isShortlisting = false,
  error = null,
  onView,
  onScreen,
  onCompare,
  onShortlist,
  onOpenMobileActions,
  onRetry,
  className
}) => {
  const score = candidate.matchAnalysis?.overallScore;
  const scoreMeta = getScoreMeta(score);
  const skills = candidate.matchAnalysis?.matchedSkills?.length
    ? candidate.matchAnalysis.matchedSkills
    : candidate.skills || [];
  const isSelected = candidate.hrStatus === 'SELECTED';
  const isProcessing = isShortlisting || candidate.extractionStatus === 'PROCESSING';
  const state = error
    ? 'ERROR'
    : isProcessing
      ? 'PROCESSING'
      : isCompared
        ? 'SELECTED_FOR_COMPARISON'
        : isSelected
          ? 'SELECTED_CANDIDATE'
          : candidate.hrStatus === 'SHORTLISTED'
            ? 'SHORTLISTED'
            : 'DEFAULT';

  /*
   * The card body is already a full-size button that opens Quick Look and
   * carries that accessible name, so the strip's eye icon is a pointer
   * convenience rather than a second control. Marking it redundant keeps it
   * visible and clickable while leaving exactly one "Quick look at <name>"
   * in the accessibility tree.
   */
  const actions = getCandidateActions({
    candidate,
    isCompared,
    comparisonDisabled,
    isShortlisting,
    onView,
    onScreen,
    onCompare,
    onShortlist
  }).map((action) => (action.id === 'view' ? { ...action, redundant: true } : action));

  return (
    <div className={cx('candidate-card-wrapper group', className)}>
      <article
        className={cx(
          'candidate-card',
          STATUS_SURFACES[candidate.hrStatus] || STATUS_SURFACES.REVIEW,
          isCompared && 'candidate-card-compared',
          error && 'candidate-card-error'
        )}
        data-state={state}
        aria-busy={isProcessing || undefined}
      >
        {isCompared && (
          <span className="candidate-card-selection" aria-label="Selected for comparison">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            Compare
          </span>
        )}

        <button
          type="button"
          className="candidate-card-body"
          onClick={() => onView(candidate)}
          aria-label={`Quick look at ${candidate.name}`}
        >
          <div className="flex items-start justify-between gap-3">
            <Avatar name={candidate.name} size="md" className="!h-11 !w-11 !text-sm" />
            <div className="candidate-match-score">
              {score !== undefined && score !== null ? (
                <>
                  <p className={cx('text-xl font-semibold leading-none tabular-nums', scoreMeta.text)}>{Math.round(score)}%</p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Match</p>
                </>
              ) : (
                <>
                  <p className="text-meta font-normal text-slate-500">--</p>
                  <p className="mt-1 text-[10px] font-normal uppercase tracking-wide text-slate-500">Not scored</p>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 min-w-0 text-left">
            <h3 className="text-base font-semibold leading-6 text-slate-900 break-words line-clamp-2 group-hover:text-brand-700 transition-colors">
              {candidate.name || 'Unknown candidate'}
            </h3>
            <p className="mt-1.5 text-meta leading-5 text-slate-600 line-clamp-2 min-h-[2.5rem]" title={candidate.headline || candidate.currentRole || undefined}>
              {candidate.headline || candidate.currentRole || 'Role not specified in resume'}
            </p>
          </div>

          <div className="mt-4 min-h-[2.75rem] text-left">
            {skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {skills.slice(0, 3).map((skill, index) => (
                  <span key={`${skill}-${index}`} className="chip max-w-full py-0.5 text-[11px]">
                    <span className="truncate">{skill}</span>
                  </span>
                ))}
                {skills.length > 3 && <span className="text-xs font-normal text-slate-500 self-center">+{skills.length - 3}</span>}
              </div>
            ) : (
              <span className="text-xs text-slate-400">No skills parsed</span>
            )}
          </div>
        </button>

        <div className="candidate-card-footer">
          <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
            {formatExperience(candidate.totalExperience, 'Experience not stated')}
          </span>
          <span className="shrink-0">
            <StatusBadge status={candidate.hrStatus} />
          </span>

          {/*
            The same action definitions the quick-look panel and the touch
            action sheet render, so a shortlist fired from a card is the same
            write — and the same disabled rules — as one fired anywhere else.
            Which of the two affordances below is shown is decided by pointer
            capability in CSS, never by viewport width.
          */}
          <CandidateActionButtons actions={actions} layout="dock" />

          <button
            type="button"
            className="candidate-mobile-actions-trigger btn btn-icon-sm btn-ghost shrink-0"
            onClick={() => onOpenMobileActions(candidate)}
            aria-label={`Actions for ${candidate.name}`}
          >
            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div className="candidate-card-error-row" role="alert">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">Unable to shortlist candidate</span>
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => onRetry(candidate)}>
              <RotateCcw className="inline w-3 h-3 mr-1" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}
      </article>

    </div>
  );
};

/** Condensed candidate row for the dashboard. */
export const CandidateRow = ({ candidate }) => {
  const score = candidate.matchAnalysis?.overallScore;
  const scoreMeta = getScoreMeta(score);
  const statusMeta = getStatusMeta(candidate.hrStatus);

  return (
    <Link
      to={`/candidates/${candidate._id}`}
      className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
      aria-label={`Open profile for ${candidate.name}`}
    >
      <Avatar name={candidate.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-meta font-bold text-slate-900 truncate group-hover:text-brand-700 transition-colors duration-fast">
            {candidate.name}
          </p>
          {score !== undefined && score !== null && (
            <span className={cx('text-xs font-bold tabular-nums shrink-0', scoreMeta.text)}>{score}%</span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">
          {candidate.headline || candidate.currentRole || 'Role not specified'}
          {candidate.currentLocation ? ` · ${candidate.currentLocation}` : ''}
        </p>
      </div>
      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
        <Badge variant={statusMeta.badge.replace('badge-', '')}>{statusMeta.label}</Badge>
        <span className="text-[11px] text-slate-400">{formatRelativeTime(candidate.createdAt, '')}</span>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all duration-fast shrink-0" aria-hidden="true" />
    </Link>
  );
};

export default memo(CandidateCard);
