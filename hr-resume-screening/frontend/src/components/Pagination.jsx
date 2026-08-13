import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, cx } from './ui';

/**
 * Builds a compact page list with ellipses: 1 … 4 5 6 … 20
 */
const buildPageList = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((p) => pages.add(p));

  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);

  const withGaps = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) withGaps.push('gap');
    withGaps.push(page);
  });

  return withGaps;
};

/**
 * Pagination control. Reports the visible range so recruiters know where they
 * are in a long result set.
 */
const Pagination = ({ pagination, onPageChange, onLimitChange, className }) => {
  if (!pagination) return null;

  const { page, limit, total, totalPages, hasNextPage, hasPreviousPage } = pagination;
  if (total === 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <nav
      className={cx('flex flex-col sm:flex-row items-center justify-between gap-3', className)}
      aria-label="Candidate list pagination"
    >
      <div className="flex items-center gap-3">
        <p className="text-meta text-slate-500" aria-live="polite">
          Showing <span className="font-semibold text-slate-800 tabular-nums">{from}</span>–
          <span className="font-semibold text-slate-800 tabular-nums">{to}</span> of{' '}
          <span className="font-semibold text-slate-800 tabular-nums">{total}</span>
        </p>

        {onLimitChange && (
          <label className="hidden sm:flex items-center gap-1.5 text-meta text-slate-500">
            <span className="sr-only">Results per page</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="select h-8 py-0 text-xs w-auto pl-2.5"
              aria-label="Results per page"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="iconSm"
            icon={ChevronLeft}
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPreviousPage}
            aria-label="Previous page"
          />

          <div className="hidden sm:flex items-center gap-1">
            {buildPageList(page, totalPages).map((item, index) =>
              item === 'gap' ? (
                <span key={`gap-${index}`} className="px-1.5 text-slate-400 text-xs" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => onPageChange(item)}
                  aria-current={item === page ? 'page' : undefined}
                  aria-label={`Page ${item}`}
                  className={cx(
                    'min-w-8 h-8 px-2 rounded-control text-xs font-semibold tabular-nums transition-colors duration-fast',
                    item === page
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  {item}
                </button>
              )
            )}
          </div>

          <span className="sm:hidden text-meta text-slate-600 px-2 tabular-nums">
            {page} / {totalPages}
          </span>

          <Button
            variant="secondary"
            size="iconSm"
            icon={ChevronRight}
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNextPage}
            aria-label="Next page"
          />
        </div>
      )}
    </nav>
  );
};

export default Pagination;
