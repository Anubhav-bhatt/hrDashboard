import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Lock, X } from 'lucide-react';
import { Button, Avatar } from '../ui';
import { formatExperience } from '../../utils/format';

/**
 * Close-job confirmation.
 *
 * The recruiter picks the person hired for the role from the job's shortlist and
 * confirms. Two deliberate choices:
 *
 *   - nothing is preselected, not even the top scorer. Presenting a default
 *     would nudge the hiring decision, and the decision is the recruiter's.
 *   - the consequences are listed in full before confirming, because closing is
 *     not reversible in this product.
 *
 * The list is ordered by score purely so it is easy to scan; ordering carries no
 * recommendation. The server re-validates everything asserted here.
 */
const CloseJobDialog = ({ jobTitle, candidates, submitting, error, onConfirm, onClose }) => {
  const [selectedId, setSelectedId] = useState(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const previouslyFocused = useRef(null);

  // Focus management: remember what was focused, move focus into the dialog,
  // trap Tab inside it, and restore focus on close.
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  const submit = (event) => {
    event.preventDefault();
    if (!selectedId || submitting) return;
    onConfirm(selectedId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ backgroundColor: 'rgb(var(--overlay-scrim) / var(--overlay-scrim-opacity))' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-job-title"
        aria-describedby="close-job-description"
        className="relative w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-white rounded-t-card sm:rounded-card shadow-overlay animate-slide-up"
      >
        <div className="shrink-0 border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="close-job-title" className="text-section inline-flex items-center gap-2">
              <Lock className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" />
              <span className="truncate">Close {jobTitle}</span>
            </h2>
            <p id="close-job-description" className="text-meta text-slate-500 mt-0.5">
              Select the candidate hired for this position.
            </p>
          </div>
          <Button
            ref={closeRef}
            variant="ghost"
            size="iconSm"
            icon={X}
            onClick={onClose}
            aria-label="Cancel closing this job"
          />
        </div>

        <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto scroll-slim px-5 py-4">
            <div role="radiogroup" aria-labelledby="close-job-title" className="space-y-2">
              {candidates.map((candidate) => {
                const checked = selectedId === candidate.id;
                return (
                  <label
                    key={candidate.id}
                    className={[
                      'flex items-center gap-3 rounded-control border p-3 cursor-pointer transition-colors duration-fast',
                      'focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-1',
                      checked
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="selectedCandidate"
                      value={candidate.id}
                      checked={checked}
                      onChange={() => setSelectedId(candidate.id)}
                      className="w-4 h-4 shrink-0 accent-brand-600"
                    />
                    <Avatar name={candidate.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-medium text-slate-900 truncate">
                        {candidate.name || 'Unnamed candidate'}
                      </span>
                      <span className="block text-meta text-slate-500 truncate">
                        {[candidate.currentRole, formatExperience(candidate.totalExperience)]
                          .filter(Boolean)
                          .join(' · ') || 'Role not stated'}
                      </span>
                    </span>
                    <span className="text-meta font-semibold text-slate-700 shrink-0 tabular-nums">
                      {candidate.overallScore === null || candidate.overallScore === undefined
                        ? 'Not scored'
                        : `${Math.round(candidate.overallScore)}% match`}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 rounded-control bg-slate-50 border border-slate-200 p-3">
              <p className="text-meta font-medium text-slate-700">Closing this job will:</p>
              <ul className="mt-2 space-y-1 text-meta text-slate-600 list-disc pl-4">
                <li>Mark the selected candidate as Selected</li>
                <li>Mark the job as Closed</li>
                <li>Disable new candidate imports</li>
                <li>Preserve all candidate and recruitment history</li>
              </ul>
            </div>

            {error && (
              <p role="alert" className="mt-3 text-meta text-rose-700 bg-rose-50 border border-rose-200 rounded-control p-3">
                {error}
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 px-5 py-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!selectedId} loading={submitting} icon={CheckCircle2}>
              {submitting ? 'Closing…' : 'Confirm & Close Job'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CloseJobDialog;
