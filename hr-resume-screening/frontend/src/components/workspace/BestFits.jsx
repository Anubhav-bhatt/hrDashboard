import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, GitCompare, Upload, Users } from 'lucide-react';
import { formatExperience, getScoreMeta } from '../../utils/format';
import { Avatar, EmptyState, Skeleton, StatusBadge, cx } from '../ui';

/**
 * Best fits for the focused role.
 *
 * The point of this surface is that it answers rather than lists. A recruiter
 * arriving at a role wants "who is strongest, and why" — so the answer is
 * written in a sentence at the top, the three candidates behind it are shown as
 * nodes, and everything else about the pool stays one link away.
 *
 * Every number here is the stored match score and the server's strong-match
 * threshold. Nothing on this screen computes a second opinion about fit, and the
 * word "strong" is only used about candidates who actually clear the threshold.
 *
 * "Strongest fit" is guidance about what to look at first. It is not a hiring
 * state — that is `hrStatus`, shown separately on each node — and nothing here
 * writes one.
 */

/** Three keeps the row readable and the connector honest at every width. */
export const BEST_FIT_COUNT = 3;

const topSkills = (candidate, limit = 3) => {
  const matched = candidate.matchAnalysis?.matchedSkills || [];
  const skills = matched.length > 0 ? matched : candidate.skills || [];
  return skills.slice(0, limit);
};

/**
 * The direct answer, assembled only from data the record actually holds.
 *
 * Three tiers, in decreasing order of evidence: a scored candidate with matched
 * skills gets the full sentence plus the alignment line; a scored candidate
 * without them gets the sentence alone; an unscored pool gets a sentence that
 * says exactly that rather than implying a comparison nobody made.
 */
const buildAnswer = ({ leader, jobTitle, hasStrongMatches }) => {
  if (!leader) return null;

  const score = leader.matchAnalysis?.overallScore;
  const name = leader.name || 'This candidate';
  const alignment = topSkills(leader, 3);

  if (score === null || score === undefined) {
    return {
      headline: `${name} is the closest current candidate for ${jobTitle} based on available candidate data.`,
      alignment: []
    };
  }

  return {
    headline: hasStrongMatches
      ? `${name} is currently the strongest match for ${jobTitle} at ${Math.round(score)}%.`
      : `${name} is currently the highest match for ${jobTitle} at ${Math.round(score)}%, below the strong-match threshold.`,
    alignment
  };
};

/**
 * The connector.
 *
 * A stem, a bar and one drop per node — drawn at the column centres of the grid
 * below so the lines actually meet the cards. Deliberately hairline and low
 * contrast: it exists to say "these three came from that role", and a heavier
 * treatment would turn a relationship into a diagram.
 *
 * Desktop only. On narrow screens the vertical stack already carries the
 * hierarchy and horizontal branches would be drawn across nothing.
 */
const Connector = ({ count, animate }) => {
  if (count < 1) return null;

  // preserveAspectRatio="none" stretches x to the container, so these are
  // fractions of the width expressed in a 300-unit box: node i of n sits at the
  // centre of its column.
  const centres = Array.from({ length: count }, (_, index) => ((index + 0.5) / count) * 300);
  const first = centres[0];
  const last = centres[centres.length - 1];

  const segments = [
    `M150 0 L150 13`,
    count > 1 ? `M${first} 13 L${last} 13` : '',
    ...centres.map((x) => `M${x} 13 L${x} 30`)
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      className="hidden lg:block w-full h-8 text-slate-300"
      viewBox="0 0 300 30"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={segments}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        className={animate ? 'focus-connector-path' : undefined}
      />
    </svg>
  );
};

const BestFitSkeleton = ({ count = BEST_FIT_COUNT }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-label="Finding strongest matches">
    {Array.from({ length: count }, (_, index) => (
      <div key={index} className="card card-pad">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-pill" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
        <Skeleton className="mt-4 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-2/3" />
      </div>
    ))}
  </div>
);

/**
 * One candidate node.
 *
 * The card body opens the same quick look the candidate list opens; the
 * comparison toggle is a sibling control rather than nested inside it, so
 * choosing someone to compare can never also open a panel.
 */
const BestFitNode = ({ candidate, rank, isStrongest, isSelected, selectionDisabled, onQuickLook, onToggleSelect, revealIndex, animate }) => {
  const score = candidate.matchAnalysis?.overallScore;
  const scoreMeta = getScoreMeta(score);
  const skills = topSkills(candidate, 3);

  return (
    <div
      className={cx(
        'card card-pad flex flex-col gap-3 min-w-0 transition-colors duration-fast',
        isSelected && 'border-brand-300 bg-brand-50/40',
        animate && 'focus-reveal'
      )}
      style={animate ? { '--reveal-index': revealIndex } : undefined}
    >
      <div className="flex items-start justify-between gap-3 min-w-0">
        <button
          type="button"
          onClick={() => onQuickLook(candidate)}
          className="flex items-start gap-3 min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Avatar name={candidate.name} size="md" className="shrink-0" />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-bold text-slate-400 tabular-nums shrink-0">#{rank}</span>
              <span className="text-meta font-bold text-slate-900 truncate">{candidate.name || 'Unknown candidate'}</span>
            </span>
            <span className="block text-xs text-slate-500 truncate mt-0.5">
              {candidate.headline || candidate.currentRole || 'Role not specified'}
            </span>
          </span>
        </button>

        <div className="text-right shrink-0">
          {score === null || score === undefined ? (
            <p className="text-meta font-semibold text-slate-400">--</p>
          ) : (
            <>
              <p className={cx('text-xl font-bold leading-none tabular-nums', scoreMeta.text)}>{Math.round(score)}%</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">{scoreMeta.label}</p>
            </>
          )}
        </div>
      </div>

      {skills.length > 0 && (
        <p className="text-xs text-slate-600 truncate" title={skills.join(', ')}>
          {skills.join(' • ')}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <span className="text-xs text-slate-500 truncate">
          {formatExperience(candidate.totalExperience, 'Experience not stated')}
        </span>
        <StatusBadge status={candidate.hrStatus} />
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        {/* Presentation guidance, worded so it cannot be read as a hiring
            decision. The candidate's actual state is the badge above. */}
        {isStrongest ? (
          <span className="inline-flex items-center gap-1 rounded-pill bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            Strongest fit
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">Rank {rank} by match</span>
        )}

        <button
          type="button"
          onClick={() => onToggleSelect(candidate)}
          disabled={selectionDisabled && !isSelected}
          aria-pressed={isSelected}
          className={cx(
            'ml-auto btn btn-sm shrink-0 border',
            isSelected
              ? 'bg-brand-50 text-brand-700 border-brand-200'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          )}
        >
          {isSelected ? (
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {isSelected ? 'Added' : 'Compare'}
        </button>
      </div>
    </div>
  );
};

const BestFits = ({
  job,
  candidates,
  strongCount = 0,
  threshold = 80,
  totalCandidates = 0,
  loading = false,
  selectedIds = [],
  selectionDisabled = false,
  onQuickLook,
  onToggleSelect,
  animate = true
}) => {
  const jobTitle = job?.title || 'this role';

  const strongCandidates = useMemo(
    () => candidates.filter((candidate) => (candidate.matchAnalysis?.overallScore ?? -1) >= threshold),
    [candidates, threshold]
  );

  const hasStrongMatches = strongCandidates.length > 0;
  // When nothing clears the bar, the closest candidates are still shown — but
  // they are labelled as closest, never as strong.
  const shown = (hasStrongMatches ? strongCandidates : candidates).slice(0, BEST_FIT_COUNT);
  const leader = shown[0] || null;

  const answer = useMemo(
    () => buildAnswer({ leader, jobTitle, hasStrongMatches }),
    [hasStrongMatches, jobTitle, leader]
  );

  const remaining = hasStrongMatches ? Math.max(strongCount - shown.length, 0) : 0;

  return (
    <section className="min-w-0" aria-labelledby="best-fits-heading">
      <header className="text-center">
        <h2 id="best-fits-heading" className="text-2xl sm:text-3xl font-bold text-slate-900 text-balance">
          {jobTitle}
        </h2>
        <p className="mt-2 text-label uppercase tracking-wider text-slate-500">
          {loading ? 'Finding strongest matches…' : hasStrongMatches ? 'Best fits' : 'Closest candidates'}
        </p>
      </header>

      {/* The interface stays on screen while the pool loads — only the nodes
          become placeholders. Blanking the workspace would lose the role, the
          rail and the tools along with the results. */}
      {loading ? (
        <div className="mt-6">
          <BestFitSkeleton />
        </div>
      ) : totalCandidates === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title="No candidates yet"
            description="Upload candidates to discover the strongest matches for this job."
            action={
              job?.id ? (
                <Link to={`/jobs/${job.id}/import`} className="btn btn-sm btn-primary">
                  <Upload className="w-4 h-4" aria-hidden="true" />
                  Upload candidates
                </Link>
              ) : null
            }
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title="No scored candidates yet"
            description="Candidates for this role have not been scored against its requirements, so there is nothing to rank yet."
          />
        </div>
      ) : (
        <>
          {/* Said before the nodes are drawn, so the qualification is read
              first and the scores below are never mistaken for strong ones. */}
          {!hasStrongMatches && (
            <p className="mt-3 text-center text-meta text-slate-500">
              No strong matches yet — no candidate reaches {threshold}%. Closest current candidates:
            </p>
          )}

          <Connector count={shown.length} animate={animate} />

          <div
            className={cx(
              // Below lg the connector is not drawn, so the nodes take their own
              // breathing room under the heading instead.
              'grid gap-3 min-w-0 mt-5 lg:mt-0',
              shown.length === 1 && 'grid-cols-1 max-w-sm mx-auto',
              shown.length === 2 && 'grid-cols-1 sm:grid-cols-2',
              shown.length >= 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            )}
          >
            {shown.map((candidate, index) => (
              <BestFitNode
                key={candidate._id}
                candidate={candidate}
                rank={index + 1}
                isStrongest={index === 0 && hasStrongMatches}
                isSelected={selectedIds.includes(candidate._id)}
                selectionDisabled={selectionDisabled}
                onQuickLook={onQuickLook}
                onToggleSelect={onToggleSelect}
                revealIndex={index}
                animate={animate}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {answer && (
              <p className="text-meta text-slate-700 text-center max-w-2xl text-balance" aria-live="polite">
                {answer.headline}
                {answer.alignment.length > 0 && (
                  <>
                    {' '}
                    <span className="text-slate-500">
                      Strongest alignment: {answer.alignment.join(' • ')}.
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          {remaining > 0 && job?.id && (
            <div className="mt-4 text-center">
              {/* A real link, not a button that navigates: the rest of the pool
                  is a place, and should be middle-clickable and copyable. */}
              <Link to={`/ai/ranking?jobId=${job.id}`} className="btn btn-sm btn-ghost text-brand-700">
                +{remaining} more strong match{remaining === 1 ? '' : 'es'}
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default BestFits;
