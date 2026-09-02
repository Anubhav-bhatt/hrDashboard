import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '../ui';

/**
 * Permanent-deletion confirmation for a closed job.
 *
 * This is the only screen in the application that destroys data, and it is
 * written to be impossible to get through by accident:
 *
 *   - it states what will be destroyed, counted, before asking anything;
 *   - the confirm button does nothing until the recruiter has typed the job's
 *     own title, so muscle memory and a mis-click cannot combine into a
 *     deletion;
 *   - it never says "remove", "clear" or "archive". Those words belong to
 *     closing a job, which preserves everything. This does not.
 *
 * The typed phrase is re-checked on the server. Nothing here is the control —
 * it is the explanation of a control that lives in jobDeletionService.
 */
const DeleteJobDialog = ({ job, counts, submitting, error, onConfirm, onClose }) => {
  const [typed, setTyped] = useState('');
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const previouslyFocused = useRef(null);
  const inputId = useId();

  // Same focus contract as the close dialog: remember what was focused, move
  // focus in, trap Tab, restore on the way out.
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

  /*
   * Case and stray spacing are forgiven, the words are not — matching the
   * server's rule exactly, so the button is never enabled for a phrase the API
   * would then reject.
   */
  const normalise = (value) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const confirmed = normalise(typed) === normalise(job.title || '');

  const submit = (event) => {
    event.preventDefault();
    if (!confirmed || submitting) return;
    onConfirm(typed);
  };

  // Only what this job actually has. A line reading "0 notes" is noise, and a
  // list padded with things that do not exist makes the real figures harder to
  // weigh.
  const lines = [
    counts.candidates > 0 && `${counts.candidates.toLocaleString('en-IN')} candidate record${counts.candidates === 1 ? '' : 's'}`,
    counts.storedResumes > 0 &&
      `${counts.storedResumes.toLocaleString('en-IN')} stored resume${counts.storedResumes === 1 ? '' : 's'}`,
    counts.notes > 0 && `${counts.notes.toLocaleString('en-IN')} recruiter note${counts.notes === 1 ? '' : 's'}`,
    counts.activities > 0 &&
      `${counts.activities.toLocaleString('en-IN')} activity record${counts.activities === 1 ? '' : 's'}`,
    'all candidate scoring and analysis for this role',
    'the job description and its requirements',
    'the job record itself'
  ].filter(Boolean);

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
        aria-labelledby="delete-job-title"
        aria-describedby="delete-job-description"
        className="relative w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-white rounded-t-card sm:rounded-card shadow-overlay animate-slide-up"
      >
        <div className="shrink-0 border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="delete-job-title" className="text-section inline-flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
              <span className="truncate">Permanently delete {job.title}?</span>
            </h2>
            <p id="delete-job-description" className="text-meta text-slate-500 mt-0.5">
              This deletes the role and its candidate data for good. It cannot be undone.
            </p>
          </div>
          <Button
            ref={closeRef}
            variant="ghost"
            size="iconSm"
            icon={X}
            onClick={onClose}
            aria-label="Cancel deleting this job"
          />
        </div>

        <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto scroll-slim px-5 py-4">
            <div className="rounded-control bg-rose-50 border border-rose-200 p-3">
              <p className="text-meta font-semibold text-rose-800">This will permanently delete:</p>
              <ul className="mt-2 space-y-1 text-meta text-rose-800 list-disc pl-4">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            {/*
              Named so nobody has to wonder. A recruiter who imported from a
              mailbox should not be left guessing whether this reaches into it.
            */}
            <p className="text-meta text-slate-600 mt-3">
              Original emails in your Outlook mailbox are not touched — only the copies and records held here.
            </p>

            <div className="mt-4">
              <label htmlFor={inputId} className="field-label">
                Type <span className="font-semibold text-slate-900">{job.title}</span> to confirm
              </label>
              <input
                id={inputId}
                type="text"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                spellCheck="false"
                className="input mt-1"
                aria-describedby={`${inputId}-hint`}
                disabled={submitting}
              />
              <p id={`${inputId}-hint`} className="text-xs text-slate-500 mt-1.5">
                {confirmed ? 'Job title matched. Deletion is now enabled.' : 'Deletion stays disabled until this matches.'}
              </p>
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
            <Button
              type="submit"
              variant="destructive"
              disabled={!confirmed}
              loading={submitting}
              icon={AlertTriangle}
            >
              {submitting ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeleteJobDialog;
