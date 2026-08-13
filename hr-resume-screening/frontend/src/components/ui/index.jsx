import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, Copy, Inbox, Loader2, RefreshCw, WifiOff, X } from 'lucide-react';
import { getAvatarClasses, getInitials } from '../../utils/format';

/** Joins class names, dropping falsy entries. */
export const cx = (...classes) => classes.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ Button --- */

const BUTTON_VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  destructive: 'btn-destructive',
  destructiveSoft: 'btn-destructive-soft',
  successSoft: 'btn-success-soft'
};

const BUTTON_SIZES = { sm: 'btn-sm', md: 'btn-md', lg: 'btn-lg', icon: 'btn-icon', iconSm: 'btn-icon-sm' };

/**
 * Button with consistent hover/active/disabled/focus states.
 *
 * Icon-only buttons require an accessible name: pass `aria-label`. A `loading`
 * button is disabled and announces its busy state.
 */
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon: Icon, children, className, disabled, ...props },
  ref
) {
  const isIconOnly = size === 'icon' || size === 'iconSm';

  return (
    <button
      ref={ref}
      type={props.type || 'button'}
      className={cx('btn', BUTTON_SIZES[size], BUTTON_VARIANTS[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className={cx(isIconOnly ? 'w-4 h-4' : 'w-4 h-4', 'animate-spin')} aria-hidden="true" />
      ) : (
        Icon && <Icon className={cx(size === 'sm' || size === 'iconSm' ? 'w-3.5 h-3.5' : 'w-4 h-4')} aria-hidden="true" />
      )}
      {!isIconOnly && children}
    </button>
  );
});

/* -------------------------------------------------------------------- Card --- */

export const Card = ({ as: Tag = 'div', className, padding = 'card-pad', children, ...props }) => (
  <Tag className={cx('card', padding, className)} {...props}>
    {children}
  </Tag>
);

export const CardHeader = ({ title, description, actions, className }) => (
  <div className={cx('flex flex-wrap items-start justify-between gap-3', className)}>
    <div className="min-w-0">
      <h2 className="section-title">{title}</h2>
      {description && <p className="text-meta text-slate-500 mt-0.5">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

/* ------------------------------------------------------------------- Badge --- */

export const Badge = ({ variant = 'neutral', icon: Icon, children, className }) => (
  <span className={cx('badge', `badge-${variant}`, className)}>
    {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
    {children}
  </span>
);

/* ------------------------------------------------------------------ Avatar --- */

export const Avatar = ({ name, size = 'md', className }) => {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-meta',
    lg: 'w-14 h-14 text-base',
    xl: 'w-16 h-16 text-lg'
  };

  return (
    <div
      className={cx(
        'rounded-pill flex items-center justify-center font-semibold shrink-0 select-none',
        sizes[size],
        getAvatarClasses(name),
        className
      )}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
};

/* --------------------------------------------------------------- Skeletons --- */

export const Skeleton = ({ className }) => <div className={cx('skeleton', className)} aria-hidden="true" />;

/** Skeleton matching the KPI card grid. */
export const StatCardSkeleton = () => (
  <div className="card card-pad">
    <div className="flex items-start justify-between gap-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-8 rounded-control" />
    </div>
    <Skeleton className="h-8 w-16 mt-4" />
    <Skeleton className="h-3 w-28 mt-3" />
  </div>
);

/** Skeleton matching a candidate row. */
export const CandidateRowSkeleton = () => (
  <div className="card card-pad flex items-start gap-4">
    <Skeleton className="w-10 h-10 rounded-pill" />
    <div className="flex-1 min-w-0 space-y-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-56" />
      <div className="flex gap-1.5 pt-1">
        <Skeleton className="h-5 w-16 rounded-pill" />
        <Skeleton className="h-5 w-20 rounded-pill" />
        <Skeleton className="h-5 w-14 rounded-pill" />
      </div>
    </div>
    <Skeleton className="h-6 w-20 rounded-md" />
  </div>
);

export const ListSkeleton = ({ rows = 5, Item = CandidateRowSkeleton }) => (
  <div className="space-y-3" role="status" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => (
      <Item key={i} />
    ))}
    <span className="sr-only">Loading content…</span>
  </div>
);

/** Skeleton for the candidate profile screen. */
export const ProfileSkeleton = () => (
  <div className="space-y-5" role="status" aria-label="Loading candidate profile">
    <div className="card card-pad-lg">
      <div className="flex flex-col sm:flex-row gap-5">
        <Skeleton className="w-16 h-16 rounded-pill" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
          <div className="flex flex-wrap gap-2 pt-1">
            <Skeleton className="h-9 w-28 rounded-control" />
            <Skeleton className="h-9 w-24 rounded-control" />
            <Skeleton className="h-9 w-32 rounded-control" />
          </div>
        </div>
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <div className="card card-pad space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
        </div>
        <div className="card card-pad space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
      <div className="card card-pad space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
    <span className="sr-only">Loading candidate profile…</span>
  </div>
);

/* -------------------------------------------------------------- EmptyState --- */

/**
 * Empty state with an optional recovery action. `title` should describe the
 * situation and `action` should offer the way out (e.g. clear filters).
 */
export const EmptyState = ({ icon: Icon = Inbox, title, description, action, className }) => (
  <div className={cx('card border-dashed py-12 px-6 text-center', className)}>
    <div className="mx-auto w-11 h-11 rounded-pill bg-slate-100 text-slate-500 flex items-center justify-center mb-4">
      <Icon className="w-5 h-5" aria-hidden="true" />
    </div>
    <h3 className="text-card-title text-slate-900">{title}</h3>
    {description && <p className="text-meta text-slate-500 mt-1.5 max-w-md mx-auto">{description}</p>}
    {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
  </div>
);

/* -------------------------------------------------------------- ErrorState --- */

/**
 * Error state that always says what failed and offers a retry. Network failures
 * get their own copy because the fix is different from a server error.
 */
export const ErrorState = ({ title, error, onRetry, action, className }) => {
  const isNetwork = error?.code === 'NETWORK_ERROR';
  const heading = title || (isNetwork ? 'Unable to connect to the server' : 'Something needs attention');
  const message =
    error?.message ||
    (isNetwork
      ? 'Check your connection and confirm the API server is running, then try again.'
      : 'This request could not be completed.');

  return (
    <div className={cx('card card-pad-lg border-rose-200 bg-rose-50/40', className)} role="alert">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-control bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
          {isNetwork ? <WifiOff className="w-4.5 h-4.5" aria-hidden="true" /> : <AlertCircle className="w-4.5 h-4.5" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-card-title text-rose-900">{heading}</h3>
          <p className="text-meta text-rose-800/90 mt-1">{message}</p>
          {(onRetry || action) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {onRetry && (
                <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
                  Try again
                </Button>
              )}
              {action}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Compact inline alert for non-blocking messages. */
export const InlineAlert = ({ tone = 'error', title, message, onDismiss, className }) => {
  const tones = {
    error: 'border-rose-200 bg-rose-50 text-rose-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    info: 'border-sky-200 bg-sky-50 text-sky-900'
  };

  return (
    <div className={cx('rounded-card border px-4 py-3 flex items-start gap-3', tones[tone], className)} role={tone === 'error' ? 'alert' : 'status'}>
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-meta">
        {title && <p className="font-semibold">{title}</p>}
        {message && <p className={cx(title && 'mt-0.5')}>{message}</p>}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-current/60 hover:text-current text-xs font-semibold" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
};

/* -------------------------------------------------------------- CopyButton --- */

/**
 * Copy-to-clipboard control with confirmation feedback. Falls back to a hidden
 * textarea + execCommand where the async clipboard API is unavailable.
 */
export const CopyButton = ({ value, label = 'Copy', copiedLabel = 'Copied', size = 'iconSm', className, onCopied }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleCopy = async () => {
    if (!value) return;
    let ok = false;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(String(value));
        ok = true;
      } else {
        const area = document.createElement('textarea');
        area.value = String(value);
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand('copy');
        area.remove();
      }
    } catch {
      ok = false;
    }

    if (ok) {
      setCopied(true);
      onCopied?.();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const isIcon = size === 'icon' || size === 'iconSm';

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={handleCopy}
      disabled={!value}
      className={className}
      aria-label={copied ? copiedLabel : `${label}${value ? `: ${value}` : ''}`}
      title={copied ? copiedLabel : label}
      icon={copied ? Check : Copy}
    >
      {!isIcon && (copied ? copiedLabel : label)}
    </Button>
  );
};

/* -------------------------------------------------------------- Definition --- */

/**
 * Label/value pair. Renders the fallback in muted italics when there is no
 * value, so a missing field reads as "Not provided" rather than looking broken.
 */
export const DefinitionRow = ({ label, value, icon: Icon, action, fallback = 'Not provided', className }) => {
  const isEmpty = value === null || value === undefined || value === '' || value === fallback;

  return (
    <div className={cx('flex items-start justify-between gap-3 py-2.5', className)}>
      <div className="min-w-0 flex-1">
        <dt className="text-label uppercase text-slate-500 flex items-center gap-1.5">
          {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />}
          {label}
        </dt>
        <dd className={cx('mt-1 text-body break-words', isEmpty ? 'text-slate-400 italic' : 'text-slate-900 font-medium')}>
          {isEmpty ? fallback : value}
        </dd>
      </div>
      {action && !isEmpty && <div className="shrink-0 pt-4">{action}</div>}
    </div>
  );
};

/* ---------------------------------------------------------------- PageTitle --- */

export const PageHeader = ({ eyebrow, title, description, actions, backTo, backLabel = 'Back', className }) => (
  <div className={cx('flex flex-col gap-4', className)}>
    {backTo && (
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-meta font-medium text-slate-500 hover:text-slate-900 transition-colors duration-fast w-fit">
        <span aria-hidden="true">←</span>
        {backLabel}
      </Link>
    )}
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-label uppercase text-brand-700 mb-1.5">{eyebrow}</p>}
        <h1 className="text-page-title sm:text-display">{title}</h1>
        {description && <p className="text-meta text-slate-500 mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  </div>
);

/* -------------------------------------------------------------------- Meter --- */

/** Horizontal progress meter with an accessible value. */
export const Meter = ({ value, max = 100, barClass = 'bg-brand-500', label, className }) => {
  const pct = max > 0 ? Math.min(Math.max((Number(value) / max) * 100, 0), 100) : 0;

  return (
    <div
      className={cx('h-1.5 w-full rounded-pill bg-slate-200 overflow-hidden', className)}
      role="progressbar"
      aria-valuenow={Math.round(Number(value) || 0)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className={cx('h-full rounded-pill transition-all duration-slow', barClass)} style={{ width: `${pct}%` }} />
    </div>
  );
};

/* --------------------------------------------------------------------- Tabs --- */

/**
 * Tab bar following the ARIA tabs pattern: arrow keys move focus, and only the
 * selected tab is in the tab order.
 */
export const Tabs = ({ tabs, activeId, onChange, className }) => {
  const refs = useRef({});

  const handleKeyDown = (event) => {
    const ids = tabs.map((t) => t.id);
    const index = ids.indexOf(activeId);
    let next = null;

    if (event.key === 'ArrowRight') next = ids[(index + 1) % ids.length];
    else if (event.key === 'ArrowLeft') next = ids[(index - 1 + ids.length) % ids.length];
    else if (event.key === 'Home') next = ids[0];
    else if (event.key === 'End') next = ids[ids.length - 1];

    if (next) {
      event.preventDefault();
      onChange(next);
      refs.current[next]?.focus();
    }
  };

  return (
    <div className={cx('border-b border-slate-200 overflow-x-auto scroll-slim', className)}>
      <div role="tablist" aria-label="Candidate sections" className="flex items-center gap-1 min-w-max" onKeyDown={handleKeyDown}>
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[tab.id] = el;
              }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cx(
                'relative px-3.5 py-2.5 text-meta font-semibold whitespace-nowrap transition-colors duration-fast rounded-t-control',
                active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {tab.icon && <tab.icon className="w-3.5 h-3.5" aria-hidden="true" />}
                {tab.label}
                {tab.count !== undefined && tab.count !== null && (
                  <span
                    className={cx(
                      'px-1.5 py-0.5 rounded-pill text-[11px] font-semibold',
                      active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </span>
              {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand-600 rounded-t" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const TabPanel = ({ id, activeId, children, className }) => {
  if (id !== activeId) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className={cx('animate-fade-in focus-visible:outline-none', className)}>
      {children}
    </div>
  );
};

/* -------------------------------------------------------------- ProgressBar --- */

/**
 * Determinate progress bar for long operations such as bulk resume processing.
 *
 * Deliberately thin: a batch that runs for minutes should not be represented by
 * a large spinner that gives no sense of how far along it is.
 */
export const ProgressBar = ({ value = 0, max = 100, label, showValue = false, tone = 'brand', className }) => {
  const pct = max > 0 ? Math.min(Math.max((Number(value) / max) * 100, 0), 100) : 0;
  const tones = {
    brand: 'bg-brand-600',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500'
  };

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="flex items-center justify-between gap-2 mb-1.5">
          {label && <span className="text-meta text-slate-600">{label}</span>}
          {showValue && (
            <span className="text-meta font-semibold text-slate-800 tabular-nums">
              {Math.round(value)} / {max}
            </span>
          )}
        </div>
      )}
      <div
        className="h-1.5 w-full rounded-pill bg-slate-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(Number(value) || 0)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label || 'Progress'}
      >
        <div
          className={cx('h-full rounded-pill transition-all duration-slow', tones[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

/* -------------------------------------------------------------- StatusBadge --- */

/**
 * HR review status as a subdued badge. Status is conveyed by both a colour and
 * its label, never colour alone.
 */
export const StatusBadge = ({ status, className }) => {
  const META = {
    REVIEW: { label: 'Review', variant: 'neutral' },
    NEEDS_REVIEW: { label: 'Needs Review', variant: 'warning' },
    SHORTLISTED: { label: 'Shortlisted', variant: 'success' },
    NOT_SUITABLE: { label: 'Not Suitable', variant: 'neutral' }
  };
  const meta = META[status] || { label: status || 'Unknown', variant: 'neutral' };
  return (
    <Badge variant={meta.variant} className={className}>
      {meta.label}
    </Badge>
  );
};

/* ----------------------------------------------------------------- SkillChip --- */

/**
 * Skill chip. `matched` marks a skill the job asked for; `missing` marks a
 * requirement the resume did not evidence; `keyword` distinguishes free-text
 * domain terms from formal skills.
 */
export const SkillChip = ({ children, matched = false, missing = false, keyword = false, onRemove, title, className }) => (
  <span
    className={cx(
      'chip',
      matched && 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold',
      missing && 'bg-rose-50 border-rose-200 text-rose-700',
      keyword && 'bg-violet-50 border-violet-200 text-violet-800',
      className
    )}
    title={title}
  >
    {matched && <Check className="w-3 h-3 shrink-0" aria-hidden="true" />}
    {children}
    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        className="text-current/50 hover:text-rose-600 transition-colors duration-fast rounded shrink-0"
        aria-label={`Remove ${typeof children === 'string' ? children : 'item'}`}
      >
        <X className="w-3 h-3" />
      </button>
    )}
  </span>
);

/* ---------------------------------------------------------------- FilterChip --- */

/** Active-filter chip with a remove affordance. Visually lightweight. */
export const FilterChip = ({ label, onRemove }) => (
  <span className="chip">
    {label}
    <button
      type="button"
      onClick={onRemove}
      className="text-slate-400 hover:text-rose-600 transition-colors duration-fast rounded"
      aria-label={`Remove filter: ${label}`}
    >
      <X className="w-3 h-3" />
    </button>
  </span>
);

/* ------------------------------------------------------------------ Spinner --- */

export const Spinner = ({ label = 'Loading…', className }) => (
  <div className={cx('flex flex-col items-center justify-center gap-3 py-12', className)} role="status">
    <Loader2 className="w-6 h-6 text-brand-600 animate-spin" aria-hidden="true" />
    <p className="text-meta text-slate-500">{label}</p>
  </div>
);
