import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Progress indicator for email analysis and attachment discovery.
 */
export const ExtractorProgress = ({ current = 0, total = 0, currentEmailName = '' }) => {
  const percentage = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full max-w-xl mx-auto p-6 sm:p-8 rounded-card border border-slate-200 bg-white shadow-soft text-center space-y-4 animate-fade-in"
    >
      <div className="flex items-center justify-center">
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="text-base font-bold text-slate-900">
          Checking your emails...
        </h3>
        <p className="text-sm font-semibold text-brand-700">
          {total > 0 ? `Checking email ${current} of ${total}` : 'Scanning emails...'}
        </p>
        {currentEmailName && (
          <p className="text-xs text-slate-500 truncate max-w-sm mx-auto font-mono">
            {currentEmailName}
          </p>
        )}
      </div>

      {/* Progress Track */}
      <div className="space-y-1.5 pt-1">
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
          <div
            className="h-full bg-brand-600 rounded-full transition-all duration-150 ease-out"
            style={{ width: `${percentage}%` }}
            role="progressbar"
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Email extraction progress"
          />
        </div>
        <div className="flex justify-between text-[11px] font-medium text-slate-500">
          <span>{percentage}% complete</span>
          <span>{current} / {total} emails checked</span>
        </div>
      </div>
    </div>
  );
};

export default ExtractorProgress;
