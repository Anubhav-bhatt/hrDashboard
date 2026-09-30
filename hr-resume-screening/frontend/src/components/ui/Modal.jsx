import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button, cx } from './index';

/**
 * Accessible Modal dialog for confirmations, details, and focused tasks.
 *
 * Implements WAI-ARIA dialog practices:
 * - Traps focus while open
 * - Closes on Escape and backdrop click
 * - Locks body scroll
 * - Returns focus on close
 */
export const Modal = ({
  isOpen = false,
  open,
  onClose,
  title,
  description,
  maxWidth = 'max-w-lg',
  children,
  className
}) => {
  const isShown = open !== undefined ? open : isOpen;
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!isShown) return undefined;

    previouslyFocused.current = document.activeElement;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
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

    // Focus first interactive element or panel
    const raf = window.requestAnimationFrame(() => {
      const firstInteractive = panelRef.current?.querySelector('button, input, select, textarea');
      firstInteractive?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      window.cancelAnimationFrame(raf);
      if (previouslyFocused.current && typeof previouslyFocused.current.focus === 'function') {
        previouslyFocused.current.focus();
      }
    };
  }, [isShown, onClose]);

  if (!isShown) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centering wrapper */}
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6 text-center">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          className={cx(
            'relative w-full transform overflow-hidden rounded-2xl bg-white p-6 text-left shadow-2xl transition-all border border-slate-200/80 animate-scale-in',
            maxWidth,
            className
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              {title && (
                <h3 id="modal-title" className="text-base font-bold text-slate-900 leading-snug">
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-1 text-xs text-slate-500">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
