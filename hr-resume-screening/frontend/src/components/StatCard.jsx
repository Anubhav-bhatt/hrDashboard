import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cx } from './ui';

/**
 * Icon tint per tone.
 *
 * A bare glyph rather than a filled block: on a row of four cards, four
 * saturated squares compete with the very numbers the cards exist to show. The
 * tone survives as a quiet hue on the icon and nothing else.
 */
const TONES = {
  brand: 'text-brand-500',
  emerald: 'text-emerald-500',
  amber: 'text-amber-500',
  rose: 'text-rose-500',
  violet: 'text-violet-500',
  slate: 'text-slate-400'
};

/**
 * Dashboard KPI card.
 *
 * When `to` is supplied the *entire card* is a single router link, so the whole
 * surface is the click target and one Tab stop — no nested interactive elements
 * to trap keyboard users, and Enter activates it natively because it is a real
 * anchor. Without `to` it renders as a plain, non-interactive card.
 */
const StatCard = ({
  label,
  value,
  icon: Icon,
  tone = 'brand',
  to,
  subtitle,
  trend,
  trendLabel,
  loading = false,
  emptyValue = '0',
  variant = 'default'
}) => {
  const iconTone = TONES[tone] || TONES.brand;

  // NaN / undefined must never reach the screen.
  const displayValue =
    value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))
      ? emptyValue
      : typeof value === 'number'
        ? value.toLocaleString('en-IN')
        : value;

  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendTone = trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-rose-600' : 'text-slate-400';

  /*
   * The compact variant: what is being counted, the count, then what it means.
   *
   * The label leads because the row sits at the top of the dashboard and is read
   * before anything else on the page — a column of bare figures asks the reader
   * to look twice, once for the number and again for what it counts. The figure
   * still dominates by size (30px against 14px), so scanning across the row for
   * the numbers alone still works.
   *
   * The icon and the arrow stay dropped. Repeated four times across a summary
   * row they only compete with the figures the cards exist to show; the link,
   * its accessible name and the NaN guard are shared with the default variant,
   * so nothing that depends on those changes behaviour.
   */
  const compactBody = (
    <>
      <p className="text-body font-medium text-slate-600">{label}</p>
      <p className="text-metric text-slate-900 tabular-nums leading-none mt-3">{loading ? '—' : displayValue}</p>
      {(trendLabel || subtitle) && (
        <p className="text-xs text-slate-500 mt-1.5 truncate">{trendLabel || subtitle}</p>
      )}
    </>
  );

  const body = (
    <>
      {/* Label first, small and quiet; the figure is the thing being read. */}
      <div className="flex items-center gap-2">
        {Icon && <Icon className={cx('w-4 h-4 shrink-0', iconTone)} aria-hidden="true" />}
        <p className="text-label uppercase text-slate-500 truncate">{label}</p>
      </div>

      <p className="text-metric text-slate-900 mt-2.5 tabular-nums">{loading ? '—' : displayValue}</p>

      <div className="mt-1.5 flex items-center justify-between gap-2 min-h-[1.25rem]">
        <div className="flex items-center gap-1.5 min-w-0">
          {trend !== undefined && trend !== null && (
            <span className={cx('inline-flex items-center gap-1 text-xs font-semibold shrink-0', trendTone)}>
              <TrendIcon className="w-3.5 h-3.5" aria-hidden="true" />
              {trend > 0 ? `+${trend}` : trend}
            </span>
          )}
          {(trendLabel || subtitle) && (
            <span className="text-xs text-slate-500 truncate">{trendLabel || subtitle}</span>
          )}
        </div>

        {to && (
          <ArrowRight
            className="w-4 h-4 text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all duration-fast shrink-0"
            aria-hidden="true"
          />
        )}
      </div>
    </>
  );

  const content = variant === 'compact' ? compactBody : body;

  if (!to) {
    return <div className="card card-pad">{content}</div>;
  }

  return (
    <Link
      to={to}
      className="card-interactive card-pad group block"
      aria-label={`${label}: ${displayValue}${subtitle ? `. ${subtitle}` : ''}`}
    >
      {content}
    </Link>
  );
};

/**
 * Pipeline stage row. The whole row navigates to the matching filtered list.
 */
export const PipelineStage = ({ label, description, count, percentage, to, barClass = 'bg-brand-500' }) => (
  <Link
    to={to}
    className="group flex items-center gap-4 px-4 py-3 rounded-control hover:bg-slate-50 transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
    aria-label={`${label}: ${count} candidates`}
  >
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-3">
        <p className="text-meta font-semibold text-slate-800 truncate">{label}</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-meta font-bold text-slate-900 tabular-nums">{count}</span>
          <span className="text-xs text-slate-400 tabular-nums w-9 text-right">{percentage}%</span>
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full rounded-pill bg-slate-100 overflow-hidden">
        <div
          className={cx('h-full rounded-pill transition-all duration-slow', barClass)}
          style={{ width: `${Math.min(Math.max(percentage, 0), 100)}%` }}
        />
      </div>

      {description && <p className="text-xs text-slate-500 mt-1.5 truncate">{description}</p>}
    </div>

    <ArrowUpRight
      className="w-4 h-4 text-slate-300 group-hover:text-brand-600 transition-colors duration-fast shrink-0"
      aria-hidden="true"
    />
  </Link>
);

export default StatCard;
