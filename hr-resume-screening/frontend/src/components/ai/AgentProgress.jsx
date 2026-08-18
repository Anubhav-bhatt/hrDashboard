import React from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '../ui';

/**
 * Operation-level progress for a running agent.
 *
 * "Loading candidates…", "Ranking candidates…" — what the system is doing, at the
 * granularity a recruiter can act on. Deliberately *not* a running commentary of
 * the model's reasoning: intermediate deliberation is not a status, it is
 * unreviewed text that would read as findings. Only named operations appear here.
 *
 * The live region is polite and the busy state is marked, so a screen reader
 * announces the step change without interrupting whatever is being read. The
 * spinner is decorative — the label carries the meaning.
 *
 * @param {Object} props
 * @param {string} props.label The current operation, e.g. "Ranking candidates…"
 * @param {string[]} [props.steps] Optional named steps, for multi-stage work
 * @param {number} [props.activeStep] Index of the step in progress
 */
const AgentProgress = ({ label = 'Working…', steps, activeStep = 0, className }) => (
  <div
    className={cx('card card-pad flex flex-col gap-3', className)}
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="flex items-center gap-2.5">
      <Loader2 className="w-4 h-4 text-brand-600 animate-spin shrink-0" aria-hidden="true" />
      <p className="text-meta font-medium text-slate-700">{label}</p>
    </div>

    {Array.isArray(steps) && steps.length > 0 && (
      <ol className="space-y-1.5 pl-6">
        {steps.map((step, index) => {
          const done = index < activeStep;
          const active = index === activeStep;
          return (
            <li
              key={step}
              className={cx(
                'text-meta flex items-center gap-2',
                done && 'text-slate-500',
                active && 'text-slate-800 font-medium',
                !done && !active && 'text-slate-400'
              )}
            >
              {/* State is carried by the label prefix as well as by colour, so it
                  is never communicated by colour alone. */}
              <span aria-hidden="true" className="w-3 shrink-0">
                {done ? '✓' : active ? '›' : '·'}
              </span>
              {step}
              {done && <span className="sr-only">(completed)</span>}
              {active && <span className="sr-only">(in progress)</span>}
            </li>
          );
        })}
      </ol>
    )}
  </div>
);

export default AgentProgress;
