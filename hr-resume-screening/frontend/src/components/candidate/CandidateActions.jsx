import React from 'react';
import { Check, Eye, GitCompare, Loader2, ScanSearch, UserPlus } from 'lucide-react';
import { cx } from '../ui';

const ACTION_TONE_CLASSES = {
  view: 'candidate-action-view',
  screen: 'candidate-action-screen',
  compare: 'candidate-action-compare',
  shortlist: 'candidate-action-shortlist'
};

/**
 * One action definition powers the desktop dock and the touch action sheet.
 * Keeping the callbacks here prevents the two presentations from drifting.
 */
export const getCandidateActions = ({
  candidate,
  isCompared = false,
  comparisonDisabled = false,
  isShortlisting = false,
  onView,
  onScreen,
  onCompare,
  onShortlist
}) => {
  const isShortlisted = candidate.hrStatus === 'SHORTLISTED';
  const isSelected = candidate.hrStatus === 'SELECTED';

  return [
    {
      id: 'view',
      label: 'Quick Look',
      ariaLabel: `Quick look at ${candidate.name}`,
      icon: Eye,
      onClick: () => onView(candidate)
    },
    {
      id: 'screen',
      label: 'Screen candidate',
      tooltip: 'Screen',
      ariaLabel: `Screen ${candidate.name}`,
      icon: ScanSearch,
      onClick: () => onScreen(candidate),
      disabled: !candidate.jobId
    },
    {
      id: 'compare',
      label: isCompared ? 'Remove from comparison' : 'Add to comparison',
      // Stateful, because the icon-only dock has nothing else to say what the
      // control will do next.
      tooltip: isCompared ? 'Remove from comparison' : 'Compare',
      ariaLabel: `${isCompared ? 'Remove' : 'Compare'} ${candidate.name}${isCompared ? ' from comparison' : ''}`,
      icon: isCompared ? Check : GitCompare,
      onClick: () => onCompare(candidate),
      active: isCompared,
      disabled: comparisonDisabled && !isCompared
    },
    {
      id: 'shortlist',
      label: isSelected ? 'Candidate selected' : isShortlisted ? 'Shortlisted' : 'Shortlist candidate',
      tooltip: isSelected ? 'Selected for this role' : isShortlisted ? 'Shortlisted' : 'Shortlist',
      ariaLabel: `Shortlist ${candidate.name}`,
      icon: isShortlisting ? Loader2 : isShortlisted || isSelected ? Check : UserPlus,
      onClick: () => onShortlist(candidate),
      active: isShortlisted || isSelected,
      loading: isShortlisting,
      disabled: isShortlisted || isSelected || isShortlisting
    }
  ];
};

export const CandidateActionButtons = ({ actions, layout = 'dock', onAction }) => {
  if (layout === 'quickLook') {
    const screen = actions.find((action) => action.id === 'screen');
    const secondary = actions.filter((action) => action.id === 'compare' || action.id === 'shortlist');
    const ScreenIcon = screen?.icon;

    return (
      <div className="space-y-3" role="group" aria-label="Candidate actions">
        {screen && (
          <button
            type="button"
            className="btn btn-md btn-primary w-full"
            onClick={screen.onClick}
            disabled={screen.disabled}
          >
            <ScreenIcon className="w-4 h-4" aria-hidden="true" />
            {screen.label}
          </button>
        )}
        <div className="grid grid-cols-2 gap-3">
          {secondary.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                className={cx(
                  'btn btn-md border min-w-0',
                  action.active
                    ? 'bg-brand-50 text-brand-700 border-brand-200'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                )}
                onClick={action.onClick}
                disabled={action.disabled}
                aria-pressed={action.id === 'compare' ? action.active : undefined}
                aria-busy={action.loading || undefined}
              >
                <Icon className={cx('w-4 h-4 shrink-0', action.loading && 'animate-spin')} aria-hidden="true" />
                <span className="truncate">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (layout === 'list') {
    return (
      <div className="grid gap-2" role="group" aria-label="Candidate actions">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              className={cx(
                'btn btn-md w-full justify-start border',
                action.active
                  ? 'bg-brand-50 text-brand-700 border-brand-200'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
                action.disabled && 'opacity-50'
              )}
              onClick={() => {
                action.onClick();
                onAction?.(action);
              }}
              disabled={action.disabled}
              aria-pressed={action.id === 'compare' ? action.active : undefined}
              aria-busy={action.loading || undefined}
            >
              <Icon className={cx('w-4 h-4', action.loading && 'animate-spin')} aria-hidden="true" />
              {action.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="candidate-action-dock" role="group" aria-label="Candidate quick actions">
      {actions.map((action, index) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            className={cx(
              'candidate-action-button',
              ACTION_TONE_CLASSES[action.id],
              action.active && 'is-active'
            )}
            style={{ '--action-index': index }}
            data-tooltip={action.tooltip || action.label}
            aria-label={action.ariaLabel || action.label}
            aria-pressed={action.id === 'compare' ? action.active : undefined}
            aria-busy={action.loading || undefined}
            /*
             * `redundant` marks a control that duplicates a larger, already
             * labelled control in the same component — the candidate card's
             * body is itself a full-size Quick Look button with this exact
             * name. Two buttons sharing one accessible name is a real defect:
             * a screen reader announces the candidate twice and offers no way
             * to tell the two apart. Hiding the smaller copy keeps the pointer
             * affordance without duplicating the semantics, and loses nothing,
             * because keyboard and assistive-tech users reach the same action
             * through the card body.
             */
            aria-hidden={action.redundant || undefined}
            tabIndex={action.redundant ? -1 : undefined}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            <Icon className={cx('w-4 h-4', action.loading && 'animate-spin')} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
};
