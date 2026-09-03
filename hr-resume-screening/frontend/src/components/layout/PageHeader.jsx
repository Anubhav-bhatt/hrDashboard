import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useWorkspaceMode } from '../../context/WorkspaceModeContext';
import { cx } from '../ui';

/**
 * Standardized, non-viewport-hogging PageHeader component.
 *
 * Implements Level 1 of the Global Visibility Model:
 * "What is happening right now on this screen?"
 *
 * Mode-aware:
 * - Standard Mode: Information-rich, operational title with status badge,
 *   subtle metadata line, and clear primary and secondary action buttons.
 * - Minimalist Mode: Focused, task-first headline with primary CTA prioritized
 *   and secondary clutter reduced.
 */
const PageHeader = ({
  eyebrow = null,
  title,
  badge = null,
  description = null,
  actions = null,
  primaryAction = null,
  secondaryActions = null,
  backTo = null,
  backLabel = 'Back',
  className = ''
}) => {
  const { isMinimal } = useWorkspaceMode();

  return (
    <header
      className={cx(
        'flex flex-col gap-3 pb-4 border-b border-slate-200/80',
        isMinimal ? 'mb-4' : 'mb-6',
        className
      )}
    >
      {backTo && (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{backLabel}</span>
        </Link>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {eyebrow && !isMinimal && (
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">
              {eyebrow}
            </p>
          )}

          <div className="flex items-center gap-2.5 flex-wrap">
            <h1
              className={cx(
                'font-bold text-slate-900 tracking-tight leading-tight truncate',
                isMinimal ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
              )}
            >
              {title}
            </h1>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>

          {description && (
            <div
              className={cx(
                'text-slate-500 font-normal leading-relaxed max-w-3xl',
                isMinimal ? 'text-xs sm:text-sm' : 'text-sm'
              )}
            >
              {description}
            </div>
          )}
        </div>

        {/* Actions Block */}
        {(primaryAction || secondaryActions || actions) && (
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            {actions}
            {secondaryActions && (
              <div className={cx('flex items-center gap-2', isMinimal && 'order-2 sm:order-1')}>
                {secondaryActions}
              </div>
            )}
            {primaryAction && (
              <div className={cx('shrink-0', isMinimal && 'order-1 sm:order-2')}>
                {primaryAction}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default PageHeader;
