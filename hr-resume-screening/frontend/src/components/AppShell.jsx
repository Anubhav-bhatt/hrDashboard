import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Briefcase,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Plus,
  Sparkles,
  Users,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { disconnectOutlook, getOutlookConnectUrl, getOutlookStatus, toApiError } from '../services/api';
import { useToast } from './ToastProvider';
import ThemeSelector, { ThemeToggleButton } from './ThemeSelector';
import { Avatar, Button, cx } from './ui';

export const SIDEBAR_STORAGE_KEY = 'hr-dashboard-sidebar-collapsed';

/**
 * Sidebar navigation.
 *
 * "Jobs" groups the two job destinations and stays highlighted for every job
 * route — the portal, a single job, its import screen and its candidate list —
 * so a recruiter always knows which section they are in.
 */
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  {
    to: '/jobs',
    label: 'Jobs',
    icon: Briefcase,
    matchPrefix: '/jobs',
    children: [
      { to: '/jobs', label: 'All jobs', end: true },
      { to: '/jobs/new', label: 'Create job' }
    ]
  },
  { to: '/candidates', label: 'Candidates', icon: Users, matchPrefix: '/candidates' }
];

/** Reads the persisted sidebar preference. */
const readCollapsed = () => {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * Tooltip shown beside a collapsed sidebar item.
 *
 * Appears on hover and on keyboard focus — focus matters because an icon-only
 * control gives a keyboard user no other way to learn what it does.
 */
const CollapsedTooltip = ({ label }) => (
  <span
    role="tooltip"
    className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 whitespace-nowrap
               rounded-control border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800
               opacity-0 translate-x-[-4px] transition-all duration-fast
               group-hover:opacity-100 group-hover:translate-x-0
               group-focus:opacity-100 group-focus:translate-x-0"
    style={{ boxShadow: 'var(--shadow-overlay)' }}
  >
    {label}
  </span>
);

/**
 * Application chrome: sidebar navigation on desktop (collapsible), a slide-over
 * drawer on mobile, and a top bar carrying the Outlook connection state, theme
 * control and account menu.
 */
const AppShell = ({ children }) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const toast = useToast();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [outlook, setOutlook] = useState({ loading: true, connected: false, email: '' });

  const accountRef = useRef(null);

  // Close transient UI on navigation.
  useEffect(() => {
    setMobileNavOpen(false);
    setAccountOpen(false);
  }, [location.pathname, location.search]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Preference simply will not persist across reloads.
      }
      return next;
    });
  }, []);

  // Outlook status is re-read after the OAuth redirect adds ?outlook_connected.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await getOutlookStatus({ signal: controller.signal });
        if (!active) return;
        setOutlook({
          loading: false,
          connected: Boolean(response.data?.connected),
          email: response.data?.email || ''
        });
      } catch {
        if (active) setOutlook({ loading: false, connected: false, email: '' });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [location.search]);

  // Dismiss the account menu on outside click or Escape.
  useEffect(() => {
    if (!accountOpen) return undefined;

    const onPointerDown = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountOpen]);

  // Lock body scroll behind the mobile drawer.
  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  const handleDisconnect = async () => {
    try {
      await disconnectOutlook();
      setOutlook({ loading: false, connected: false, email: '' });
      toast.success('Outlook mailbox disconnected.');
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.info('You have been signed out.');
  };

  /** A section is active when the current path sits anywhere beneath it. */
  const isSectionActive = (item) => {
    if (item.end) return location.pathname === item.to;
    if (item.matchPrefix) {
      return location.pathname === item.matchPrefix || location.pathname.startsWith(`${item.matchPrefix}/`);
    }
    return location.pathname === item.to;
  };

  /**
   * @param {boolean} isCollapsed Render the icon-only variant
   */
  const SidebarContent = ({ isCollapsed = false }) => (
    <>
      <div className={cx('flex items-center gap-2.5', isCollapsed ? 'justify-center px-0' : 'px-1')}>
        <Link
          to="/"
          className="flex items-center gap-2.5 py-1 rounded-control min-w-0"
          aria-label="Resume Screening — go to dashboard"
        >
          <span className="w-9 h-9 rounded-control bg-brand-600 flex items-center justify-center text-white shrink-0">
            <Sparkles className="w-4.5 h-4.5" aria-hidden="true" />
          </span>
          {!isCollapsed && (
            <span className="min-w-0">
              <span className="text-card-title text-slate-900 leading-tight truncate block">Resume Screening</span>
              <span className="text-[11px] text-slate-500 block">Recruitment dashboard</span>
            </span>
          )}
        </Link>
      </div>

      <nav className={cx('mt-6 space-y-1', isCollapsed && 'flex flex-col items-center')} aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const sectionActive = isSectionActive(item);

          return (
            <div key={item.to} className={cx(isCollapsed && 'w-full flex flex-col items-center')}>
              <NavLink
                to={item.to}
                end={item.end}
                className={cx(
                  'group relative flex items-center rounded-control text-meta font-medium transition-colors duration-fast',
                  isCollapsed ? 'justify-center w-10 h-10' : 'gap-2.5 px-3 py-2',
                  sectionActive
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
                aria-current={sectionActive ? 'page' : undefined}
                aria-label={isCollapsed ? item.label : undefined}
              >
                {/* Active marker rather than a large filled block. */}
                {sectionActive && !isCollapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-brand-600" aria-hidden="true" />
                )}
                <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {!isCollapsed && item.label}
                {isCollapsed && <CollapsedTooltip label={item.label} />}
              </NavLink>

              {/* Sub-items only while the section is active and the rail is wide.
                  Collapsed, the parent link navigates instead of exposing an
                  unusable miniature submenu. */}
              {item.children && sectionActive && !isCollapsed && (
                <div className="mt-1 ml-4 pl-3 border-l border-slate-200 space-y-0.5">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      end={child.end}
                      className={({ isActive }) =>
                        cx(
                          'block px-2.5 py-1.5 rounded-control text-meta transition-colors duration-fast',
                          isActive
                            ? 'text-brand-700 font-semibold bg-brand-50/60'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                        )
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className={cx('mt-6 pt-6 divider', isCollapsed && 'w-full flex justify-center')}>
        {isCollapsed ? (
          <Link
            to="/jobs/new"
            className="group relative btn btn-icon btn-primary"
            aria-label="Create job"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <CollapsedTooltip label="Create job" />
          </Link>
        ) : (
          <Link to="/jobs/new" className="btn btn-md btn-primary w-full">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create job
          </Link>
        )}
      </div>

      {/* Outlook connection state */}
      <div className={cx('mt-auto pt-6', isCollapsed && 'w-full flex justify-center')}>
        {isCollapsed ? (
          <span
            className={cx(
              'group relative w-10 h-10 rounded-control border flex items-center justify-center',
              outlook.connected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                : 'border-slate-200 bg-slate-50 text-slate-400'
            )}
            tabIndex={0}
            role="status"
            aria-label={outlook.connected ? `Outlook connected: ${outlook.email}` : 'Outlook not connected'}
          >
            <Mail className="w-4 h-4" aria-hidden="true" />
            <CollapsedTooltip label={outlook.connected ? 'Outlook connected' : 'Outlook not connected'} />
          </span>
        ) : (
          <div className="rounded-card border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-label uppercase text-slate-500">
              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
              Outlook
            </div>

            {outlook.loading ? (
              <p className="text-xs text-slate-400 mt-2">Checking…</p>
            ) : outlook.connected ? (
              <>
                <p className="text-xs font-semibold text-emerald-700 mt-2 truncate" title={outlook.email}>
                  {outlook.email || 'Connected'}
                </p>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="text-[11px] font-semibold text-slate-500 hover:text-rose-700 mt-1.5 transition-colors duration-fast rounded"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500 mt-2">Not connected. Resume upload still works.</p>
                <a href={getOutlookConnectUrl()} className="btn btn-sm btn-secondary w-full mt-2.5">
                  Connect mailbox
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:bg-white focus:rounded-control focus:shadow-overlay focus:text-meta focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cx(
          'hidden lg:flex fixed inset-y-0 left-0 flex-col border-r border-slate-200 bg-white py-5 z-30',
          'transition-[width] duration-slow',
          collapsed ? 'w-sidebar-collapsed px-3' : 'w-sidebar px-4'
        )}
      >
        <SidebarContent isCollapsed={collapsed} />

        {/* Collapse control, sitting on the rail edge */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="absolute -right-3 top-16 w-6 h-6 rounded-pill border border-slate-200 bg-white
                     text-slate-400 hover:text-slate-700 hover:border-slate-300
                     flex items-center justify-center transition-colors duration-fast"
          style={{ boxShadow: 'var(--shadow-card)' }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 animate-fade-in"
            style={{ backgroundColor: 'rgb(var(--overlay-scrim) / var(--overlay-scrim-opacity))' }}
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="relative w-72 max-w-[85vw] bg-white px-4 py-5 flex flex-col shadow-overlay animate-slide-in-right"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <Button
              variant="ghost"
              size="iconSm"
              icon={X}
              onClick={() => setMobileNavOpen(false)}
              className="absolute top-4 right-3"
              aria-label="Close navigation menu"
            />
            {/* Always expanded on mobile — the drawer has room for labels. */}
            <SidebarContent isCollapsed={false} />
          </aside>
        </div>
      )}

      <div className={cx('transition-[padding] duration-slow', collapsed ? 'lg:pl-sidebar-collapsed' : 'lg:pl-sidebar')}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-14 border-b border-slate-200 bg-white/90 backdrop-blur flex items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="iconSm"
            icon={Menu}
            className="lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
          />

          <div className="lg:hidden flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-control bg-brand-600 flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            </span>
            <span className="text-card-title truncate">Resume Screening</span>
          </div>

          <div className="flex-1" />

          {!outlook.loading && (
            <span
              className={cx('hidden sm:inline-flex badge', outlook.connected ? 'badge-success' : 'badge-neutral')}
              title={outlook.connected ? `Outlook connected: ${outlook.email}` : 'Outlook not connected'}
            >
              <span
                className={cx('w-1.5 h-1.5 rounded-pill', outlook.connected ? 'bg-emerald-500' : 'bg-slate-400')}
                aria-hidden="true"
              />
              {outlook.connected ? 'Outlook connected' : 'Outlook offline'}
            </span>
          )}

          <ThemeToggleButton />

          {/* Account menu */}
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen((v) => !v)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-control hover:bg-slate-100 transition-colors duration-fast"
              aria-expanded={accountOpen}
              aria-haspopup="menu"
            >
              <Avatar name={user?.name || user?.email} size="sm" />
              <span className="hidden sm:block text-meta font-semibold text-slate-800 max-w-[10rem] truncate">
                {user?.name || user?.email}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            </button>

            {accountOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-64 card p-0 overflow-hidden animate-slide-up"
                style={{ boxShadow: 'var(--shadow-overlay)' }}
              >
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-meta font-semibold text-slate-900 truncate">{user?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  <span className="badge badge-brand mt-2">
                    {user?.role === 'ADMIN' ? 'Administrator' : 'Recruiter'}
                  </span>
                </div>

                <div className="px-4 py-3 border-b border-slate-100">
                  <ThemeSelector />
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-meta font-medium text-slate-700 hover:bg-slate-50 transition-colors duration-fast"
                >
                  <LogOut className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main id="main-content" className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
          {children}
        </main>

        <footer className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
          <p className="text-xs text-slate-400 border-t border-slate-200 pt-5">
            Relevance scores are decision-support signals only. Every hiring decision stays with your recruiters.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default AppShell;
