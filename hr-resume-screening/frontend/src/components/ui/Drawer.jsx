import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button, cx } from './index';

/**
 * Side drawer for secondary controls — additional filters, contextual actions.
 *
 * Handles the accessibility work a drawer needs: focus moves in on open, Tab is
 * trapped inside, Escape closes, body scroll is locked, and focus returns to
 * whatever opened it. Slides in from the right on desktop and up from the bottom
 * on narrow screens, where a bottom sheet is easier to reach.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {React.ReactNode} [props.footer] Pinned action row
 */
const Drawer = ({ open, onClose, title, description, footer, children, className }) => {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-slate-900/30 animate-fade-in" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={cx(
          'relative w-full sm:w-[26rem] max-h-[88vh] sm:max-h-none sm:h-full bg-white',
          'rounded-t-card sm:rounded-none shadow-overlay flex flex-col',
          'animate-slide-up sm:animate-slide-in-right',
          className
        )}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 id="drawer-title" className="text-section">
              {title}
            </h2>
            {description && <p className="text-meta text-slate-500 mt-0.5">{description}</p>}
          </div>
          <Button ref={closeRef} variant="ghost" size="iconSm" icon={X} onClick={onClose} aria-label={`Close ${title}`} />
        </div>

        <div className="flex-1 overflow-y-auto scroll-slim px-5 py-4">{children}</div>

        {footer && (
          <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Drawer;
