import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { useWorkspaceMode } from '../../context/WorkspaceModeContext';
import { Button, cx } from '../ui';

/**
 * Reusable Level-2 guidance component: "What should I do next?"
 *
 * Mode-aware:
 * - Minimalist Mode: Guided, prominent hero card with one clear, dominant primary CTA,
 *   subtle secondary action, and reassuring task context.
 * - Standard Mode: Compact operational banner providing immediate contextual next step.
 */
const RecommendedNextStep = ({
  title,
  description,
  actionLabel,
  onAction = null,
  to = null,
  secondaryActionLabel = null,
  onSecondaryAction = null,
  secondaryTo = null,
  badge = null,
  icon: Icon = Sparkles,
  loading = false,
  className = ''
}) => {
  const { isMinimal } = useWorkspaceMode();

  if (!title && !actionLabel) return null;

  const renderPrimaryAction = () => {
    if (to) {
      return (
        <Link
          to={to}
          className={cx(
            'btn btn-primary inline-flex items-center gap-2 font-semibold shadow-sm transition-all',
            isMinimal ? 'btn-md px-5 py-2.5 text-sm' : 'btn-sm px-4 py-2 text-xs'
          )}
        >
          <span>{actionLabel}</span>
          <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
        </Link>
      );
    }

    return (
      <Button
        variant="primary"
        size={isMinimal ? 'md' : 'sm'}
        onClick={onAction}
        loading={loading}
        className={cx('font-semibold shadow-sm', isMinimal && 'px-5 py-2.5 text-sm')}
      >
        <span>{actionLabel}</span>
        <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
      </Button>
    );
  };

  const renderSecondaryAction = () => {
    if (!secondaryActionLabel) return null;

    if (secondaryTo) {
      return (
        <Link
          to={secondaryTo}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-4 transition-colors"
        >
          {secondaryActionLabel}
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={onSecondaryAction}
        className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-4 transition-colors"
      >
        {secondaryActionLabel}
      </button>
    );
  };

  if (isMinimal) {
    return (
      <section
        aria-label="Recommended Next Action"
        className={cx(
          'relative overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/70 via-white to-brand-50/40 p-5 sm:p-6 shadow-sm',
          className
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-700 uppercase tracking-wider bg-brand-100/80 px-2 py-0.5 rounded-full">
                <Icon className="w-3.5 h-3.5 text-brand-600" aria-hidden="true" />
                Recommended Next Step
              </span>
              {badge}
            </div>

            <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
              {title}
            </h2>

            {description && (
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {description}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:items-end gap-2.5 shrink-0 pt-2 sm:pt-0">
            {renderPrimaryAction()}
            {renderSecondaryAction()}
          </div>
        </div>
      </section>
    );
  }

  // Standard Mode Compact Operational Banner
  return (
    <section
      aria-label="Recommended Next Action"
      className={cx(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-slate-50 transition-colors',
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-7 h-7 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-900 truncate">{title}</span>
            {badge}
          </div>
          {description && (
            <p className="text-[11px] text-slate-500 truncate">{description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
        {renderSecondaryAction()}
        {renderPrimaryAction()}
      </div>
    </section>
  );
};

export default RecommendedNextStep;
