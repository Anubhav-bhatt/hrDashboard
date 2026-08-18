import React from 'react';
import { AlertOctagon } from 'lucide-react';

/**
 * Containment for render-time faults inside the AI section.
 *
 * The application already has a top-level ErrorBoundary, but it replaces the
 * entire screen. That is right for a fault in the candidate profile and wrong for
 * a fault in an agent: AI is a supplementary section, so a broken agent should
 * cost a recruiter that panel, not their dashboard, their navigation and their
 * session context.
 *
 * Catching here means the surrounding AppShell — sidebar, top bar, account menu —
 * survives, and the recruiter can walk to another screen without reloading.
 *
 * Recovery is offered in place: "Try again" clears the error and re-renders,
 * which is enough for a transient fault. Stack detail appears only in
 * development, matching the top-level boundary.
 */
class AgentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AI UI] Agent render error:', error, info?.componentStack);
  }

  handleRetry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="card card-pad-lg border-rose-200 bg-rose-50/40" role="alert">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-control bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <AlertOctagon className="w-[18px] h-[18px]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-card-title text-rose-900">This agent ran into a problem</h2>
            <p className="text-meta text-rose-800/90 mt-1">
              The rest of your dashboard is unaffected. Try again, or return to the AI Assistant and pick another
              agent.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={this.handleRetry} className="btn btn-sm btn-secondary">
                Try again
              </button>
              <a href="/ai" className="btn btn-sm btn-ghost">
                Return to AI Assistant
              </a>
            </div>

            {import.meta.env.DEV && (
              <details className="mt-4">
                <summary className="text-xs font-semibold text-rose-700 cursor-pointer">
                  Error detail (development only)
                </summary>
                <pre className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-control p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                  {error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default AgentErrorBoundary;
