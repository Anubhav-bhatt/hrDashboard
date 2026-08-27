import React from 'react';
import { LayoutGrid, Rows3 } from 'lucide-react';
import { cx } from '../ui';

/** The two candidate layouts. Cards stay the default everywhere. */
export const CANDIDATE_VIEWS = Object.freeze({
  cards: 'cards',
  table: 'table'
});

export const CANDIDATE_VIEW_STORAGE_KEY = 'hr-dashboard-candidate-view';

/**
 * Reads the stored layout preference.
 *
 * Only the preference is stored — never a candidate, a score or a response. A
 * blocked or corrupted value falls back to cards rather than throwing, so a
 * private window still gets a working list.
 */
export const readStoredCandidateView = () => {
  try {
    const stored = window.localStorage.getItem(CANDIDATE_VIEW_STORAGE_KEY);
    return stored === CANDIDATE_VIEWS.table ? CANDIDATE_VIEWS.table : CANDIDATE_VIEWS.cards;
  } catch {
    return CANDIDATE_VIEWS.cards;
  }
};

export const storeCandidateView = (view) => {
  try {
    window.localStorage.setItem(CANDIDATE_VIEW_STORAGE_KEY, view);
  } catch {
    // The preference simply will not survive a reload; the session still honours it.
  }
};

const OPTIONS = [
  { value: CANDIDATE_VIEWS.cards, label: 'Card view', icon: LayoutGrid },
  { value: CANDIDATE_VIEWS.table, label: 'Table view', icon: Rows3 }
];

/**
 * Layout switcher for the candidate list.
 *
 * A segmented radio group, matching the appearance control in the account menu,
 * rather than two labelled buttons — this sits at the end of a filter row and
 * changes how the same result set is drawn, which is a smaller act than anything
 * else on that row and should not out-weigh it visually.
 *
 * The active option is marked three ways so it never depends on hue alone:
 * `aria-checked` for assistive technology, a raised surface, and a stronger icon.
 */
const CandidateViewToggle = ({ value, onChange, className }) => (
  <div
    role="radiogroup"
    aria-label="Candidate layout"
    className={cx('flex items-center gap-0.5 p-0.5 rounded-control bg-slate-100 shrink-0', className)}
  >
    {OPTIONS.map((option) => {
      const selected = value === option.value;
      const Icon = option.icon;

      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onChange(option.value)}
          title={option.label}
          className={cx(
            'inline-flex items-center justify-center h-8 w-8 rounded-[0.375rem] transition-colors duration-fast',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            selected
              ? 'bg-white text-brand-700 shadow-card'
              : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
          )}
        >
          <Icon className={cx('w-4 h-4', selected && 'stroke-[2.5]')} aria-hidden="true" />
          <span className="sr-only">{option.label}</span>
        </button>
      );
    })}
  </div>
);

export default CandidateViewToggle;
