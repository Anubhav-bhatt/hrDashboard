import React from 'react';
import { Link } from 'react-router-dom';
import { ErrorState } from '../ui';

/**
 * A failed AI operation, expressed the way the rest of the application expresses
 * failure.
 *
 * Two recovery routes are offered where they make sense: try the same thing
 * again, or step back to the assistant and choose something else. An agent that
 * fails should never strand a recruiter on a dead page — that is the difference
 * between a feature being unavailable and the product feeling broken.
 *
 * Messages stay in recruitment language. The layer underneath has codes like
 * TOOL_FORBIDDEN and AI_MODE_DISABLED, and those are useful in a log; a recruiter
 * needs to read what happened and what to do about it.
 *
 * @param {Object} props
 * @param {string} [props.title] What failed, in plain language
 * @param {{code?: string, message?: string}} [props.error] Normalized API error
 * @param {Function} [props.onRetry] Offer a retry when the operation is repeatable
 * @param {boolean} [props.showAssistantLink] Offer a way back to /ai
 */
const AgentErrorState = ({ title = 'Agent request failed', error, onRetry, showAssistantLink = true, className }) => (
  <ErrorState
    title={title}
    error={error}
    onRetry={onRetry}
    className={className}
    action={
      showAssistantLink ? (
        <Link to="/ai" className="btn btn-sm btn-secondary">
          Return to AI Assistant
        </Link>
      ) : null
    }
  />
);

export default AgentErrorState;
