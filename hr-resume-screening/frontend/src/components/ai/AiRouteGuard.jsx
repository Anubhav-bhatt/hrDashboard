import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import { EmptyState, Spinner } from '../ui';
import { useAiConfig } from '../../context/AiConfigContext';

/**
 * Feature-flag gate for an AI route.
 *
 * Authentication is already handled: every AI route is registered inside the same
 * `RequireAuth` wrapper as the dashboard, so an anonymous visitor is redirected to
 * sign-in before this component renders. What is decided here is the second
 * question — whether the feature is switched on for a recruiter who *is* signed
 * in.
 *
 * Three outcomes, and none of them is a blank page:
 *
 *   still checking  a spinner, matching the session check elsewhere
 *   AI off entirely an explanation that the section is not enabled
 *   this mode off   an explanation naming the agent, with a way back
 *
 * A disabled route is deliberately not redirected away. Silently bouncing a
 * recruiter to the dashboard leaves them to guess whether they mistyped a URL or
 * lack access; a stated reason with a link out is the difference between a
 * feature being off and the application appearing broken.
 *
 * This is a UX guard, not the security boundary. The server refuses a disabled
 * mode independently in the orchestrator, so a client that skipped this check
 * would still get nothing.
 */
const AiRouteGuard = ({ modeId, children }) => {
  const { enabled, loading, isModeEnabled } = useAiConfig();

  if (loading) return <Spinner label="Checking availability…" />;

  if (!enabled) {
    return (
      <EmptyState
        icon={Sparkles}
        title="AI Recruitment is not enabled"
        description="This workspace does not currently have the AI recruitment features switched on. Your dashboard, jobs and candidates are unaffected."
        action={
          <Link to="/" className="btn btn-sm btn-secondary">
            Go to dashboard
          </Link>
        }
      />
    );
  }

  if (modeId && !isModeEnabled(modeId)) {
    return (
      <EmptyState
        icon={Lock}
        title="This agent is not available yet"
        description="It has not been switched on for this workspace. The other AI agents remain available."
        action={
          <Link to="/ai" className="btn btn-sm btn-secondary">
            Return to AI Assistant
          </Link>
        }
      />
    );
  }

  return children;
};

export default AiRouteGuard;
