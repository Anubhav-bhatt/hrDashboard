import React from 'react';
import { AlertOctagon } from 'lucide-react';

/**
 * Catches render-time exceptions so a component fault shows a recoverable
 * screen instead of a blank white page. Stack details are only offered in
 * development, where they help; in production they would leak internals.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[UI] Unhandled render error:', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="card card-pad-lg max-w-lg w-full text-center">
          <div className="mx-auto w-11 h-11 rounded-pill bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
            <AlertOctagon className="w-5 h-5" aria-hidden="true" />
          </div>
          <h1 className="text-section">This screen ran into a problem</h1>
          <p className="text-meta text-slate-500 mt-2">
            The page could not finish rendering. Reloading usually clears it. If it keeps happening, report the
            steps that led here.
          </p>

          <div className="mt-5 flex items-center justify-center gap-2">
            <button type="button" onClick={this.handleReload} className="btn btn-md btn-primary">
              Reload page
            </button>
            <a href="/" className="btn btn-md btn-secondary">
              Go to dashboard
            </a>
          </div>

          {import.meta.env.DEV && (
            <details className="mt-5 text-left">
              <summary className="text-xs font-semibold text-slate-500 cursor-pointer">Error detail (development only)</summary>
              <pre className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-control p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                {error.message}
                {'\n\n'}
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
