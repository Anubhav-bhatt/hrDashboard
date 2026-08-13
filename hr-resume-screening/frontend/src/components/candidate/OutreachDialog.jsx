import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Send, X } from 'lucide-react';
import { Button, CopyButton } from '../ui';
import { useToast } from '../ToastProvider';

/**
 * Builds a professional first-contact draft from data the system actually holds.
 * Skills are only named when the resume listed them, so the message never claims
 * experience the candidate did not state.
 */
const buildDraft = ({ candidate, jobTitle, recruiterName }) => {
  const firstName = String(candidate.name || '').trim().split(/\s+/)[0] || 'there';
  const skills = (candidate.matchAnalysis?.matchedSkills?.length
    ? candidate.matchAnalysis.matchedSkills
    : candidate.skills || []
  ).slice(0, 3);

  const role = jobTitle || 'an open role on our team';

  const skillSentence = skills.length
    ? `Your experience with ${skills.length > 1 ? `${skills.slice(0, -1).join(', ')} and ${skills[skills.length - 1]}` : skills[0]} looks relevant to what the role needs, and I'd like to tell you more about it.`
    : `Your background looks relevant to what the role needs, and I'd like to tell you more about it.`;

  const subject = `${role} — exploring a fit with your profile`;

  const body = [
    `Hi ${firstName},`,
    '',
    `I came across your profile while reviewing candidates for ${role}.`,
    '',
    skillSentence,
    '',
    `Would you be open to a short conversation this week? If so, let me know a couple of times that suit you and I'll send an invite.`,
    '',
    'Best regards,',
    recruiterName || 'Recruitment Team'
  ].join('\n');

  return { subject, body };
};

/**
 * Outreach composer.
 *
 * Nothing is transmitted from here: the recruiter reviews the draft, then either
 * copies it or hands it to their own mail client via a mailto link. The
 * application has no mail-sending capability, so it does not pretend to.
 */
const OutreachDialog = ({ candidate, jobTitle, recruiterName, onClose }) => {
  const toast = useToast();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const previouslyFocused = useRef(null);

  const initial = useMemo(() => buildDraft({ candidate, jobTitle, recruiterName }), [candidate, jobTitle, recruiterName]);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);

  const email = candidate.personal?.email || candidate.email;

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
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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

  const mailtoHref = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="outreach-title"
        className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto scroll-slim bg-white rounded-t-card sm:rounded-card shadow-overlay animate-slide-up"
      >
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="outreach-title" className="text-section inline-flex items-center gap-2">
              <Mail className="w-4 h-4 text-brand-600" aria-hidden="true" />
              Draft outreach
            </h2>
            <p className="text-meta text-slate-500 mt-0.5 truncate">
              To {candidate.name}
              {email ? ` · ${email}` : ''}
            </p>
          </div>
          <Button ref={closeRef} variant="ghost" size="iconSm" icon={X} onClick={onClose} aria-label="Close outreach draft" />
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor="outreach-subject" className="field-label">Subject</label>
            <input
              id="outreach-subject"
              type="text"
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="outreach-body" className="field-label">Message</label>
            <textarea
              id="outreach-body"
              rows={14}
              className="textarea font-sans"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Review the draft before sending. This dashboard does not send email — use your mail client.
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-5 py-4 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <CopyButton
            value={`Subject: ${subject}\n\n${body}`}
            label="Copy draft"
            copiedLabel="Draft copied"
            size="md"
            onCopied={() => toast.success('Draft copied to your clipboard.')}
          />
          {mailtoHref ? (
            <a href={mailtoHref} className="btn btn-md btn-primary" onClick={() => toast.info('Opening your mail client…')}>
              <Send className="w-4 h-4" aria-hidden="true" />
              Open in mail client
            </a>
          ) : (
            <Button variant="primary" size="md" icon={Send} disabled title="No email address available for this candidate">
              Open in mail client
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OutreachDialog;
