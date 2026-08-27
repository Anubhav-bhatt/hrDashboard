import React, { memo } from 'react';
import { AlertCircle, Eye, MoreHorizontal, RotateCcw } from 'lucide-react';
import { formatExperience, getScoreMeta } from '../../utils/format';
import { Avatar, Skeleton, StatusBadge, cx } from '../ui';

/**
 * Candidate table.
 *
 * The same result set the card grid draws, in the layout a recruiter wants when
 * they are scanning forty people for one attribute rather than reading each in
 * turn. It owns no data and no candidate logic: rows come from the browser's
 * existing response, actions come from the same handlers the cards call, and the
 * comparison state it writes to is the browser's — so switching layout mid-task
 * changes nothing but the drawing.
 *
 * Deliberately not a spreadsheet. Rows are tall enough to give the candidate's
 * identity room, separators are single hairlines, and there are no vertical
 * rules or filled header blocks: the density comes from removing chrome, not
 * from shrinking type.
 */

const HEAD_CELL = 'text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 px-4 py-2.5';

/** Skills shown before the overflow count. Three fits the narrowest column. */
const VISIBLE_SKILLS = 3;

const skillsFor = (candidate) =>
  candidate.matchAnalysis?.matchedSkills?.length
    ? candidate.matchAnalysis.matchedSkills
    : candidate.skills || [];

/**
 * Match cell. Reads the stored score and its band — the table never computes a
 * second opinion about how well someone fits.
 */
const MatchValue = ({ score, meta, className }) => {
  if (score === null || score === undefined) {
    return (
      <div className={className}>
        <p className="text-meta font-semibold text-slate-400">--</p>
        <p className="text-[11px] text-slate-400">Not scored</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className={cx('text-base font-bold leading-none tabular-nums', meta.text)}>{Math.round(score)}%</p>
      <p className="mt-1 text-[11px] font-medium text-slate-500">{meta.label}</p>
    </div>
  );
};

const SkillList = ({ skills }) => {
  if (skills.length === 0) {
    return <span className="text-xs text-slate-400">No skills parsed</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {skills.slice(0, VISIBLE_SKILLS).map((skill, index) => (
        <span key={`${skill}-${index}`} className="chip max-w-[9rem] py-0.5 text-[11px]">
          <span className="truncate">{skill}</span>
        </span>
      ))}
      {skills.length > VISIBLE_SKILLS && (
        <span className="text-xs text-slate-500">+{skills.length - VISIBLE_SKILLS}</span>
      )}
    </div>
  );
};

/** Shortlist failure, inline, with the same retry the cards offer. */
const RowError = ({ message, onRetry }) => (
  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-rose-700" role="alert">
    <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
    <span className="min-w-0 truncate">{message || 'Unable to shortlist candidate'}</span>
    <button type="button" className="font-semibold underline underline-offset-2 shrink-0" onClick={onRetry}>
      <RotateCcw className="inline w-3 h-3 mr-0.5" aria-hidden="true" />
      Retry
    </button>
  </p>
);

/**
 * Compact actions. Quick Look is the one action worth a permanent target; the
 * rest open the same action sheet the cards use, so there is exactly one place
 * where "what can I do with this candidate" is defined.
 */
const RowActions = ({ candidate, onView, onOpenActions }) => (
  <div className="flex items-center justify-end gap-0.5">
    <button
      type="button"
      onClick={() => onView(candidate)}
      className="btn btn-icon-sm btn-ghost"
      aria-label={`Quick look at ${candidate.name}`}
      title="Quick Look"
    >
      <Eye className="w-4 h-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      onClick={() => onOpenActions(candidate)}
      className="btn btn-icon-sm btn-ghost"
      aria-label={`More actions for ${candidate.name}`}
      title="More actions"
    >
      <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
    </button>
  </div>
);

const CompareCheckbox = ({ candidate, checked, disabled, onCompare }) => (
  <input
    type="checkbox"
    checked={checked}
    disabled={disabled}
    onChange={() => onCompare(candidate)}
    aria-label={`${checked ? 'Remove' : 'Add'} ${candidate.name} ${checked ? 'from' : 'to'} comparison`}
    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
  />
);

/** Loading placeholder shaped like the rows it replaces, not a centred spinner. */
export const CandidateTableSkeleton = ({ rows = 8 }) => (
  <div className="card overflow-hidden" aria-label="Loading candidates">
    <div className="hidden md:block px-4 py-2.5 border-b border-slate-100">
      <Skeleton className="h-3 w-40" />
    </div>
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 h-[76px]">
          <Skeleton className="h-4 w-4 rounded hidden md:block" />
          <Skeleton className="h-10 w-10 rounded-pill shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-6 w-12 shrink-0" />
          <Skeleton className="h-6 w-24 rounded-pill shrink-0 hidden lg:block" />
          <Skeleton className="h-8 w-16 shrink-0 hidden md:block" />
        </div>
      ))}
    </div>
  </div>
);

const CandidateTable = ({
  candidates,
  getComparisonState,
  statusUpdatingId = null,
  statusErrors = {},
  onView,
  onCompare,
  onShortlist,
  onOpenActions,
  busy = false
}) => {
  const rows = candidates.map((candidate) => {
    const score = candidate.matchAnalysis?.overallScore;
    const { isCompared, comparisonDisabled } = getComparisonState(candidate);

    return {
      candidate,
      score,
      scoreMeta: getScoreMeta(score),
      skills: skillsFor(candidate),
      isCompared,
      // The browser reports the constraint; a row already in the comparison must
      // stay removable, which is the one case the constraint does not cover.
      comparisonDisabled: comparisonDisabled && !isCompared,
      error: statusErrors[candidate._id],
      isUpdating: statusUpdatingId === candidate._id
    };
  });

  return (
    <div
      className={cx('card overflow-hidden transition-opacity duration-fast', busy && 'opacity-60')}
      aria-busy={busy || undefined}
    >
      {/* ------------------------------------------------- desktop: real table */}
      {/* Horizontal scroll is confined to this container, so the page itself
          never gains a horizontal scrollbar at any width. */}
      <div className="hidden md:block overflow-x-auto scroll-slim">
        <table className="w-full min-w-[44rem] border-collapse">
          <caption className="sr-only">
            Candidates in the current result set, with match score, experience, skills and review status.
          </caption>
          <thead>
            <tr className="border-b border-slate-200">
              <th scope="col" className={cx(HEAD_CELL, 'w-10 pr-0')}>
                <span className="sr-only">Select for comparison</span>
              </th>
              <th scope="col" className={HEAD_CELL}>
                Candidate
              </th>
              <th scope="col" className={cx(HEAD_CELL, 'w-28')}>
                Match
              </th>
              <th scope="col" className={cx(HEAD_CELL, 'w-28 hidden lg:table-cell')}>
                Experience
              </th>
              <th scope="col" className={cx(HEAD_CELL, 'hidden xl:table-cell')}>
                Top skills
              </th>
              <th scope="col" className={cx(HEAD_CELL, 'w-36')}>
                Status
              </th>
              <th scope="col" className={cx(HEAD_CELL, 'w-24 text-right')}>
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {rows.map(({ candidate, score, scoreMeta, skills, isCompared, comparisonDisabled, error, isUpdating }) => (
              <tr
                key={candidate._id}
                className={cx(
                  'h-[76px] transition-colors duration-fast',
                  isCompared ? 'bg-brand-50/60' : 'hover:bg-slate-50'
                )}
                aria-busy={isUpdating || undefined}
              >
                <td className="px-4 pr-0 align-middle">
                  <CompareCheckbox
                    candidate={candidate}
                    checked={isCompared}
                    disabled={comparisonDisabled}
                    onCompare={onCompare}
                  />
                </td>

                <th scope="row" className="px-4 py-3 align-middle font-normal text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={candidate.name} size="md" className="shrink-0" />
                    <div className="min-w-0">
                      {/* A button, not a row click: the row also holds a
                          checkbox and two action targets, and nesting those
                          inside one clickable region is how a recruiter ends up
                          opening a panel they meant to tick a box in. */}
                      <button
                        type="button"
                        onClick={() => onView(candidate)}
                        className="text-meta font-bold text-slate-900 truncate max-w-[18rem] block text-left hover:text-brand-700 transition-colors duration-fast rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {candidate.name || 'Unknown candidate'}
                      </button>
                      <p className="text-xs text-slate-500 truncate max-w-[18rem]">
                        {candidate.headline || candidate.currentRole || 'Role not specified'}
                      </p>
                      {error && <RowError message={error} onRetry={() => onShortlist(candidate)} />}
                    </div>
                  </div>
                </th>

                <td className="px-4 py-3 align-middle">
                  <MatchValue score={score} meta={scoreMeta} />
                </td>

                <td className="px-4 py-3 align-middle hidden lg:table-cell">
                  <span className="text-meta text-slate-700 whitespace-nowrap">
                    {formatExperience(candidate.totalExperience, 'Not stated')}
                  </span>
                </td>

                <td className="px-4 py-3 align-middle hidden xl:table-cell">
                  <SkillList skills={skills} />
                </td>

                <td className="px-4 py-3 align-middle">
                  <StatusBadge status={candidate.hrStatus} />
                </td>

                <td className="px-4 py-3 align-middle">
                  <RowActions candidate={candidate} onView={onView} onOpenActions={onOpenActions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --------------------------------------------- mobile: compact list */}
      {/* Not the desktop columns crushed into 375px — the same rows re-laid as
          a list, still carrying identity, score, skills and status. */}
      <ul className="md:hidden divide-y divide-slate-100">
        {rows.map(({ candidate, score, scoreMeta, skills, isCompared, comparisonDisabled, error, isUpdating }) => (
          <li
            key={candidate._id}
            className={cx('px-4 py-3.5', isCompared && 'bg-brand-50/60')}
            aria-busy={isUpdating || undefined}
          >
            <div className="flex items-start gap-3">
              <CompareCheckbox
                candidate={candidate}
                checked={isCompared}
                disabled={comparisonDisabled}
                onCompare={onCompare}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onView(candidate)}
                    className="min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span className="block text-meta font-bold text-slate-900 truncate">
                      {candidate.name || 'Unknown candidate'}
                    </span>
                    <span className="block text-xs text-slate-500 truncate">
                      {candidate.headline || candidate.currentRole || 'Role not specified'}
                    </span>
                  </button>

                  <MatchValue score={score} meta={scoreMeta} className="text-right shrink-0" />
                </div>

                {skills.length > 0 && (
                  <p className="mt-2 text-xs text-slate-600 truncate">
                    {skills.slice(0, VISIBLE_SKILLS).join(' • ')}
                    {skills.length > VISIBLE_SKILLS ? ` +${skills.length - VISIBLE_SKILLS}` : ''}
                  </p>
                )}

                {error && <RowError message={error} onRetry={() => onShortlist(candidate)} />}

                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {formatExperience(candidate.totalExperience, 'Not stated')}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge status={candidate.hrStatus} />
                    <button
                      type="button"
                      onClick={() => onOpenActions(candidate)}
                      className="btn btn-icon-sm btn-ghost shrink-0"
                      aria-label={`More actions for ${candidate.name}`}
                    >
                      <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default memo(CandidateTable);
