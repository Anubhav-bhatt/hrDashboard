import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

/**
 * Lightweight toast notifications used to confirm recruiter actions
 * (status changes, copies, saved notes) without blocking the UI.
 */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast) => {
      counter.current += 1;
      const id = counter.current;
      const duration = toast.duration ?? (toast.tone === 'error' ? 6000 : 3500);

      setToasts((prev) => [...prev, { id, tone: 'info', ...toast }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), duration)
      );
      return id;
    },
    [dismiss]
  );

  // Clear pending timers if the provider unmounts mid-countdown.
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current.clear();
    },
    []
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (message, options = {}) => push({ tone: 'success', message, ...options }),
      error: (message, options = {}) => push({ tone: 'error', message, ...options }),
      info: (message, options = {}) => push({ tone: 'info', message, ...options }),
      dismiss
    }),
    [push, dismiss]
  );

  const TONES = {
    success: { icon: CheckCircle2, classes: 'border-emerald-200 bg-white text-emerald-900', iconClass: 'text-emerald-600' },
    error: { icon: AlertCircle, classes: 'border-rose-200 bg-white text-rose-900', iconClass: 'text-rose-600' },
    info: { icon: Info, classes: 'border-slate-200 bg-white text-slate-900', iconClass: 'text-brand-600' }
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Polite live region: screen readers announce toasts without stealing focus. */}
      <div
        className="fixed z-[100] bottom-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const tone = TONES[toast.tone] || TONES.info;
          const Icon = tone.icon;

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-card border shadow-overlay px-4 py-3 animate-slide-in-right ${tone.classes}`}
              role={toast.tone === 'error' ? 'alert' : 'status'}
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone.iconClass}`} aria-hidden="true" />
              <div className="min-w-0 flex-1 text-meta">
                {toast.title && <p className="font-semibold">{toast.title}</p>}
                <p className={toast.title ? 'mt-0.5 text-slate-600' : 'font-medium'}>{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors duration-fast rounded"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider.');
  return context;
};
