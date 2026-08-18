import React from 'react';
import { cx } from '../ui';
import AgentSelector from './AgentSelector';
import AiBadge from './AiBadge';

/**
 * The identity strip at the top of every agent page.
 *
 * Carries the section name, the current agent with its icon and one-line purpose,
 * and the control for switching. Keeping this identical across all five modes is
 * what stops the section reading as five separate small applications — a
 * recruiter should recognise the frame and only notice the workspace changing
 * beneath it.
 *
 * The eyebrow ("AI Recruitment") and the AI badge together are the single
 * acknowledgement per page that this is assistive output. No further AI branding
 * appears below.
 */
const AgentHeader = ({ mode, actions, className }) => {
  if (!mode) return null;
  const Icon = mode.icon;

  return (
    <header className={cx('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-2">
        <p className="text-label uppercase text-brand-700">AI Recruitment</p>
        <AiBadge />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="w-10 h-10 rounded-control bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-page-title sm:text-display">{mode.name}</h1>
            <p className="text-meta text-slate-500 mt-1 max-w-2xl">{mode.shortDescription}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <AgentSelector currentModeId={mode.id} />
        </div>
      </div>
    </header>
  );
};

export default AgentHeader;
