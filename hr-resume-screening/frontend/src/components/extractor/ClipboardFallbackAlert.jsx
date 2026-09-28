import React from 'react';
import { AlertCircle, ArrowRight, X } from 'lucide-react';

/**
 * Notice displayed when recruiter copies emails in Outlook but the browser/OS clipboard
 * only exposes text/html rather than raw email files and attachments.
 */
export const ClipboardFallbackAlert = ({ message, suggestion, onDismiss }) => {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="rounded-card border border-amber-300 bg-amber-50/90 p-4 text-amber-900 shadow-sm animate-fade-in relative"
    >
      <div className="flex items-start gap-3">
        <div className="p-1 rounded-full bg-amber-200/80 text-amber-800 shrink-0 mt-0.5">
          <AlertCircle className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">
            Attachments not accessible from clipboard
          </h4>
          <p className="text-sm font-semibold mt-0.5 text-amber-950">
            {message}
          </p>
          {suggestion && (
            <p className="text-xs text-amber-800/90 mt-1 flex items-center gap-1.5 font-medium">
              <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{suggestion}</span>
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notice"
            className="absolute top-3 right-3 p-1 rounded-lg text-amber-700 hover:bg-amber-200/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ClipboardFallbackAlert;
