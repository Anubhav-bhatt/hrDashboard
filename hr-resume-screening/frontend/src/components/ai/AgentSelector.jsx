import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { cx } from '../ui';
import { AGENT_MODE_LIST } from '../../constants/agentModes';
import { useAiConfig } from '../../context/AiConfigContext';

/**
 * Moves between agents without a trip back to the sidebar.
 *
 * Switching agent is the most common thing a recruiter does inside this section —
 * screen a candidate, then rank the rest of the pool, then compare the top few —
 * so the control sits in the page header where the work is, not in the navigation
 * rail.
 *
 * Follows the menu-button pattern the account menu already uses (aria-haspopup,
 * aria-expanded, outside-click and Escape to dismiss), plus roving arrow-key
 * movement between items. Keyboard matters here beyond compliance: this is a
 * menu a heavy user will open dozens of times a day.
 *
 * A mode whose flag is off is listed but not selectable, and says so. Hiding it
 * would leave a recruiter who has seen it elsewhere wondering where it went;
 * showing it disabled explains the state.
 *
 * Context does not travel between agents yet — a later phase carries the selected
 * job across. Switching navigates, nothing more.
 */
const AgentSelector = ({ currentModeId, className }) => {
  const navigate = useNavigate();
  const { isModeEnabled } = useAiConfig();

  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);

  const current = AGENT_MODE_LIST.find((mode) => mode.id === currentModeId) || AGENT_MODE_LIST[0];

  const close = useCallback(({ restoreFocus = true } = {}) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  // Dismiss on outside click. Escape is handled on the menu itself so it can
  // also return focus to the trigger.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Move focus into the menu when it opens, so a keyboard user is not left on
  // the trigger with an open menu they cannot reach.
  useEffect(() => {
    if (!open) return;
    const index = AGENT_MODE_LIST.findIndex((mode) => mode.id === current.id);
    itemRefs.current[index >= 0 ? index : 0]?.focus();
  }, [open, current.id]);

  const select = (mode) => {
    if (!isModeEnabled(mode.id)) return;
    setOpen(false);
    navigate(mode.route);
  };

  const onMenuKeyDown = (event) => {
    const count = AGENT_MODE_LIST.length;
    const activeIndex = itemRefs.current.findIndex((node) => node === document.activeElement);

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      // A menu should not leak focus into the page behind it.
      event.preventDefault();
      close();
      return;
    }

    let next = null;
    if (event.key === 'ArrowDown') next = (activeIndex + 1) % count;
    else if (event.key === 'ArrowUp') next = (activeIndex - 1 + count) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;

    if (next !== null) {
      event.preventDefault();
      itemRefs.current[next]?.focus();
    }
  };

  return (
    <div className={cx('relative', className)} ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-sm btn-secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current agent: ${current.name}. Change agent`}
      >
        Change agent
        <ChevronDown className={cx('w-3.5 h-3.5 transition-transform duration-fast', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Choose an agent"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] card p-1.5 z-40 animate-slide-up"
          style={{ boxShadow: 'var(--shadow-overlay)' }}
        >
          {AGENT_MODE_LIST.map((mode, index) => {
            const enabled = isModeEnabled(mode.id);
            const active = mode.id === current.id;

            return (
              <button
                key={mode.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitem"
                disabled={!enabled}
                aria-disabled={!enabled}
                aria-current={active ? 'page' : undefined}
                onClick={() => select(mode)}
                className={cx(
                  'w-full flex items-start gap-2.5 px-2.5 py-2 rounded-control text-left transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  enabled ? 'hover:bg-slate-100' : 'opacity-60 cursor-not-allowed',
                  active && enabled && 'bg-brand-50'
                )}
              >
                <mode.icon
                  className={cx('w-4 h-4 mt-0.5 shrink-0', active ? 'text-brand-600' : 'text-slate-400')}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-meta font-semibold', active ? 'text-brand-700' : 'text-slate-800')}>
                    {mode.name}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">{mode.shortDescription}</span>
                  {!enabled && (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-slate-500">
                      <Lock className="w-3 h-3" aria-hidden="true" />
                      Coming soon
                    </span>
                  )}
                </span>
                {/* The tick marks the current agent for readers who cannot rely
                    on the tinted background. */}
                {active && <Check className="w-3.5 h-3.5 text-brand-600 mt-0.5 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AgentSelector;
