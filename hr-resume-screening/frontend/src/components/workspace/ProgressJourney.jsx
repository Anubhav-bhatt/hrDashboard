import React from 'react';
import { Check, Circle } from 'lucide-react';
import { cx } from '../ui';

/**
 * Reusable visual hiring journey tracker for Minimalist Mode.
 *
 * Tracks the 6 core recruitment lifecycle milestones:
 * 1. Job Created
 * 2. Candidates Added
 * 3. Review Matches
 * 4. Shortlist
 * 5. Select
 * 6. Close Job
 *
 * Purely derived state — zero duplicate or synthetic workflow persistence.
 */
const STAGES = [
  { id: 'created', label: 'Job Created' },
  { id: 'candidates', label: 'Candidates Added' },
  { id: 'review', label: 'Review Matches' },
  { id: 'shortlist', label: 'Shortlist' },
  { id: 'select', label: 'Select' },
  { id: 'close', label: 'Close Job' }
];

/**
 * Computes stage statuses from authoritative job metrics.
 *
 * @param {Object} job
 * @param {string} job.status
 * @param {boolean} job.isClosed
 * @param {number} job.candidateCount
 * @param {number} job.analyzedCount
 * @param {number} job.shortlistedCount
 * @param {number} job.selectedCount
 */
export const deriveJourneyStageStatus = (job = {}) => {
  const isClosed = job.status === 'CLOSED' || job.isClosed;
  const candidateCount = job.candidateCount ?? job.stats?.candidateCount ?? 0;
  const analyzedCount = job.analyzedCount ?? job.stats?.analyzedCount ?? 0;
  const shortlistedCount = job.shortlistedCount ?? job.stats?.shortlistedCount ?? 0;
  const selectedCount = job.selectedCount ?? job.stats?.selectedCount ?? 0;

  if (isClosed) {
    return {
      activeStageIndex: 5,
      stages: STAGES.map((s, idx) => ({ ...s, state: 'completed' }))
    };
  }

  // Active Open Job Journey
  // Stage 0: Created is always completed for an existing job
  let activeIndex = 1;

  if (candidateCount === 0) {
    activeIndex = 1; // Waiting for candidates
  } else if (analyzedCount === 0 || shortlistedCount === 0) {
    activeIndex = 2; // Review matches
  } else if (shortlistedCount > 0 && selectedCount === 0) {
    activeIndex = 3; // Shortlisted, ready for comparison / selection
  } else if (selectedCount > 0) {
    activeIndex = 4; // Candidate selected, ready to close job
  }

  const stages = STAGES.map((s, idx) => {
    if (idx < activeIndex) return { ...s, state: 'completed' };
    if (idx === activeIndex) return { ...s, state: 'active' };
    return { ...s, state: 'pending' };
  });

  return { activeStageIndex: activeIndex, stages };
};

const ProgressJourney = ({ job = null, className = '' }) => {
  if (!job) return null;

  const { activeStageIndex, stages } = deriveJourneyStageStatus(job);

  return (
    <nav
      aria-label="Hiring Progress Journey"
      className={cx(
        'rounded-xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-sm overflow-x-auto scroll-slim',
        className
      )}
    >
      <div className="flex items-center justify-between min-w-[540px] gap-2">
        {stages.map((stage, idx) => {
          const isCompleted = stage.state === 'completed';
          const isActive = stage.state === 'active';
          const isLast = idx === stages.length - 1;

          return (
            <React.Fragment key={stage.id}>
              {/* Stage Node */}
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                    isCompleted && 'bg-emerald-100 text-emerald-700 border border-emerald-300',
                    isActive && 'bg-brand-600 text-white shadow-sm ring-4 ring-brand-100',
                    !isCompleted && !isActive && 'bg-slate-100 text-slate-400 border border-slate-200'
                  )}
                  aria-hidden="true"
                >
                  {isCompleted ? (
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  ) : isActive ? (
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </span>

                <span
                  className={cx(
                    'text-xs whitespace-nowrap',
                    isActive ? 'font-bold text-slate-900' : isCompleted ? 'font-medium text-slate-700' : 'text-slate-400'
                  )}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connecting Bar */}
              {!isLast && (
                <div
                  className={cx(
                    'flex-1 h-0.5 min-w-[20px] rounded-full mx-1',
                    idx < activeStageIndex ? 'bg-emerald-400' : 'bg-slate-200'
                  )}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};

export default ProgressJourney;
