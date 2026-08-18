import React from 'react';
import { cx } from '../ui';
import AgentProgress from './AgentProgress';
import AgentErrorState from './AgentErrorState';

/**
 * The workspace region of an agent page: where a result, a wait, a failure or an
 * empty state appears.
 *
 * Every agent renders its outcome through this one component so the four
 * conditions look and behave identically across all five modes. Left to
 * themselves, five pages would grow five slightly different loading treatments
 * and five different ways of showing a failure.
 *
 * Precedence is fixed — error, then loading, then result, then empty — because
 * that is the order a reader needs: a failure must never be hidden behind a
 * stale result, and a result must never flicker in while a newer request is
 * still running.
 *
 * @param {Object} props
 * @param {boolean} [props.loading]
 * @param {string} [props.loadingLabel] Operation-level description of the wait
 * @param {string[]} [props.loadingSteps]
 * @param {{code?: string, message?: string}} [props.error]
 * @param {string} [props.errorTitle]
 * @param {Function} [props.onRetry]
 * @param {React.ReactNode} [props.empty] Shown when there is nothing yet
 * @param {React.ReactNode} [props.children] The result
 */
const AgentResultContainer = ({
  loading = false,
  loadingLabel = 'Working…',
  loadingSteps,
  error = null,
  errorTitle,
  onRetry,
  empty = null,
  children,
  className,
  ...props
}) => {
  const body = () => {
    if (error) return <AgentErrorState title={errorTitle} error={error} onRetry={onRetry} />;
    if (loading) return <AgentProgress label={loadingLabel} steps={loadingSteps} />;
    if (children) return children;
    return empty;
  };

  return (
    <section
      className={cx('min-w-0', className)}
      aria-label="Agent results"
      // The region updates in place as an agent runs, so a screen reader is told
      // its contents can change rather than being left with the first render.
      aria-live="polite"
      {...props}
    >
      {body()}
    </section>
  );
};

export default AgentResultContainer;
