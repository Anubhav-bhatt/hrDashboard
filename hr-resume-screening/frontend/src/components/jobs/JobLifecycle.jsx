import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cx } from '../ui';

/**
 * Where this vacancy has got to, derived entirely from state that already exists.
 *
 * No new backend status was introduced for this. Each stage is a question the
 * existing counts already answer — are there candidates, has anything been
 * scored, has anything been shortlisted, has someone been selected, is the job
 * closed — so the indicator cannot drift from the data it describes, and there is
 * nothing extra to keep in sync.
 *
 * "Current" is the first stage that is not yet done, which means a job with a
 * shortlist but no selection reads as sitting on Select rather than on Review.
 */

const STAGES = [
  { id: 'created', label: 'Created', shortLabel: 'Created' },
  { id: 'candidates', label: 'Candidates added', shortLabel: 'Candidates' },
  { id: 'review', label: 'Review matches', shortLabel: 'Review' },
  { id: 'shortlist', label: 'Shortlist', shortLabel: 'Shortlist' },
  { id: 'select', label: 'Select', shortLabel: 'Select' },
  { id: 'close', label: 'Close', shortLabel: 'Close' }
];

/**
 * @param {Object} params
 * @param {Object} params.stats Candidate statistics for the job
 * @param {Object} params.job The job record
 * @returns {{ stages: Array, currentIndex: number }}
 */
export const deriveLifecycle = ({ stats = {}, job = {} }) => {
  const candidateCount = stats.candidateCount ?? 0;
  const analyzedCount = stats.analyzedCount ?? 0;
  const shortlistedCount = stats.shortlistedCount ?? 0;
  const selected = (stats.selectedCount ?? 0) > 0 || Boolean(job.selectedCandidateId);
  const closed = job.status === 'CLOSED';

  const done = {
    created: true,
    candidates: candidateCount > 0,
    review: analyzedCount > 0,
    shortlist: shortlistedCount > 0,
    select: selected,
    close: closed
  };

  const stages = STAGES.map((stage) => ({ ...stage, done: done[stage.id] }));
  const firstPending = stages.findIndex((stage) => !stage.done);

  return {
    stages,
    // Every stage done means the job is finished, not that it is on the last one.
    currentIndex: firstPending === -1 ? stages.length : firstPending
  };
};

const StageDot = ({ state }) => (
  <span
    className={cx(
      'w-5 h-5 rounded-pill border flex items-center justify-center shrink-0',
      state === 'done'
        ? 'bg-brand-600 border-brand-600 text-white'
        : state === 'current'
          ? 'bg-white border-brand-500 ring-2 ring-brand-500/25'
          : 'bg-white border-slate-300'
    )}
    aria-hidden="true"
  >
    {state === 'done' ? (
      <Check className="w-3 h-3" strokeWidth={3} />
    ) : state === 'current' ? (
      <span className="w-1.5 h-1.5 rounded-pill bg-brand-600" />
    ) : null}
  </span>
);

const JobLifecycle = ({ stats, job, className }) => {
  const { stages, currentIndex } = deriveLifecycle({ stats, job });
  const [expanded, setExpanded] = useState(false);

  const current = stages[currentIndex] || null;
  const completed = stages.filter((s) => s.done).length;

  const stateOf = (index) => (stages[index].done ? 'done' : index === currentIndex ? 'current' : 'todo');

  /** Words, not just a dot — the state must survive greyscale and a screen reader. */
  const stateWord = { done: 'Done', current: 'Current step', todo: 'Not started' };

  return (
    <section aria-label="Hiring progress" className={cx('min-w-0', className)}>
      {/* -------------------------------------------------- desktop: one row */}
      <ol className="hidden md:flex items-center gap-0">
        {stages.map((stage, index) => {
          const state = stateOf(index);
          return (
            <li
              key={stage.id}
              className={cx('flex items-center min-w-0', index < stages.length - 1 && 'flex-1')}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="flex items-center gap-2 min-w-0">
                <StageDot state={state} />
                <span
                  className={cx(
                    'text-meta truncate',
                    state === 'done'
                      ? 'text-slate-600'
                      : state === 'current'
                        ? 'font-bold text-slate-900'
                        : 'text-slate-400'
                  )}
                >
                  {stage.shortLabel}
                  <span className="sr-only"> — {stateWord[state]}</span>
                </span>
              </span>

              {index < stages.length - 1 && (
                <span
                  className={cx(
                    'mx-2 h-px flex-1 min-w-[0.75rem]',
                    stages[index + 1].done || index + 1 === currentIndex ? 'bg-brand-300' : 'bg-slate-200'
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* ------------------------- narrow: the current step, expandable to all */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls="job-lifecycle-stages"
          className="w-full flex items-center gap-2.5 text-left rounded-control
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <StageDot state={current ? 'current' : 'done'} />
          <span className="min-w-0 flex-1">
            <span className="block text-meta font-bold text-slate-900 truncate">
              {current ? current.label : 'Hiring complete'}
            </span>
            <span className="block text-meta text-slate-500">
              {current ? `Step ${currentIndex + 1} of ${stages.length}` : `All ${stages.length} steps done`}
            </span>
          </span>
          <ChevronDown
            className={cx('w-4 h-4 text-slate-400 shrink-0 transition-transform duration-fast', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </button>

        {/* No display utility on this element — a `grid`/`flex` class would
            outrank the `hidden` attribute and the list would never collapse. */}
        <ol id="job-lifecycle-stages" hidden={!expanded} className="mt-3 space-y-2 pl-0.5">
          {stages.map((stage, index) => {
            const state = stateOf(index);
            return (
              <li
                key={stage.id}
                className="flex items-center gap-2.5"
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <StageDot state={state} />
                <span
                  className={cx(
                    'text-meta',
                    state === 'done' ? 'text-slate-600' : state === 'current' ? 'font-bold text-slate-900' : 'text-slate-400'
                  )}
                >
                  {stage.label}
                  <span className="sr-only"> — {stateWord[state]}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="sr-only">
        {completed} of {stages.length} hiring steps complete.
      </p>
    </section>
  );
};

export default JobLifecycle;
