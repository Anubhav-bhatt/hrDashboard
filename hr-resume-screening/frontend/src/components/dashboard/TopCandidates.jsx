import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, Trophy } from 'lucide-react';
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton, cx } from '../ui';
import { formatExperience, getScoreMeta } from '../../utils/format';

/**
 * Highest-scoring candidates, ranked. One row is one link to the profile.
 *
 * Only scored candidates appear — an unscored candidate has no position in a
 * ranking, and showing it as 0% would misrepresent it as a poor match.
 *
 * `onSelectCandidate` is optional. When a caller supplies it, each row also
 * offers a preview control that opens the quick view instead of navigating, so
 * a recruiter can skim several candidates without losing the page they are on.
 * The row itself stays a link to the full profile either way — the preview is
 * an addition, never a replacement. It is a sibling of the link rather than a
 * child because a button nested inside an anchor is invalid HTML.
 */
const TopCandidates = ({
  candidates = [],
  loading = false,
  jobTitle = null,
  viewAllTo = '/candidates?sort=score_desc',
  onSelectCandidate = null
}) => (
  <Card padding="p-0">
    <div className="p-5 pb-3">
      <CardHeader
        title={jobTitle ? `Top candidates for ${jobTitle}` : 'Top candidates'}
        description="Ranked by relevance score, highest first."
        actions={
          <Link to={viewAllTo} className="btn btn-sm btn-ghost">
            View all
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        }
      />
    </div>

    <div className="divide-y divide-slate-100 border-t border-slate-100">
      {loading ? (
        Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="w-6 h-6 rounded" />
            <Skeleton className="w-8 h-8 rounded-pill" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-2.5 w-56" />
            </div>
            <Skeleton className="h-4 w-10" />
          </div>
        ))
      ) : candidates.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={Trophy}
            title="No scored candidates yet"
            description={
              jobTitle
                ? `No candidates on ${jobTitle} have been scored, so there is nothing to rank yet.`
                : 'Run scoring on a job to see its strongest candidates ranked here.'
            }
            className="border-0 shadow-none py-6"
          />
        </div>
      ) : (
        candidates.map((candidate, index) => {
          const score = candidate.matchAnalysis?.overallScore;
          const meta = getScoreMeta(score);
          const skills = candidate.matchAnalysis?.matchedSkills?.length
            ? candidate.matchAnalysis.matchedSkills
            : candidate.skills || [];

          return (
            <div key={candidate._id} className="group flex items-stretch hover:bg-slate-50 transition-colors duration-fast">
            <Link
              to={`/candidates/${candidate._id}`}
              className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
              aria-label={`Rank ${index + 1}: ${candidate.name}, ${score}% match`}
            >
              <span
                className={cx(
                  'w-6 h-6 rounded flex items-center justify-center text-xs font-bold tabular-nums shrink-0',
                  index === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                )}
                aria-hidden="true"
              >
                {index + 1}
              </span>

              <Avatar name={candidate.name} size="sm" />

              <div className="min-w-0 flex-1">
                <p className="text-meta font-semibold text-slate-900 truncate group-hover:text-brand-700 transition-colors duration-fast">
                  {candidate.name}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {[
                    candidate.headline || candidate.currentRole,
                    formatExperience(candidate.totalExperience, null),
                    candidate.currentLocation
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Details not provided'}
                </p>
                {skills.length > 0 && (
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{skills.slice(0, 3).join(' · ')}</p>
                )}
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant={meta.badge.replace('badge-', '')}>{score}%</Badge>
                {!jobTitle && candidate.jobTitle && (
                  <span className="text-[11px] text-slate-400 truncate max-w-[9rem]">{candidate.jobTitle}</span>
                )}
              </div>

              <ArrowRight
                className="w-4 h-4 text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all duration-fast shrink-0"
                aria-hidden="true"
              />
            </Link>

            {onSelectCandidate && (
              <button
                type="button"
                onClick={() => onSelectCandidate(candidate)}
                className="px-3 shrink-0 text-slate-400 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset transition-colors duration-fast"
                aria-label={`Preview ${candidate.name} without leaving this page`}
                title="Quick preview"
              >
                <Eye className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            </div>
          );
        })
      )}
    </div>
  </Card>
);

export default TopCandidates;
