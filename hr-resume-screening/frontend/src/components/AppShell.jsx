import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Briefcase,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Users,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAiConfig } from '../context/AiConfigContext';
import { useToast } from './ToastProvider';
import { ThemeToggleButton } from './ThemeSelector';
import { Avatar, Button, cx } from './ui';
import { AGENT_MODE_LIST } from '../constants/agentModes';

export const SIDEBAR_STORAGE_KEY = 'hr-dashboard-sidebar-collapsed';
export const AI_GROUP_STORAGE_KEY = 'hr-dashboard-ai-group-open';

/**
 * Sidebar navigation — four destinations, one per thing a recruiter works on.
 *
 * Creating a job, closed jobs, candidate import and the Outlook connection are
 * all still available, but they live inside the workflow they belong to rather
 * than competing for space here: creating and closing happen in Jobs, importing
 * happens inside a job, and the mailbox connection lives in Settings. A section
 * stays highlighted for every route beneath it, so a recruiter always knows
 * where they are.
 */
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, matchPaths: ['/', '/dashboard'] },
  { to: '/jobs', label: 'Jobs', icon: Briefcase, matchPrefix: '/jobs' },
  { to: '/candidates', label: 'Candidates', icon: Users, matchPrefix: '/candidates' },
  { to: '/settings', label: 'Settings', icon: Settings, matchPrefix: '/settings' }
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
 * Reads the persisted AI group state, defaulting to open.
 *
 * Open by default because a collapsed group hides five destinations behind a
 * click a recruiter has no reason to suspect is there. Once they collapse it, the
 * choice sticks.
 */
const readAiGroupOpen = () => {
  try {
    return window.localStorage.getItem(AI_GROUP_STORAGE_KEY) !== 'false';
  } catch {
    return true;
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
 * drawer on mobile, and a top bar carrying the theme control and account menu.
 *
 * The mailbox connection used to be reported here on every screen. It moved to
 * Settings, which removed an integration status request from every page load and
 * a panel from a rail that a recruiter reads dozens of times a day.
 */
const AppShell = ({ children }) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const toast = useToast();

  const { enabled: aiEnabled, isModeEnabled } = useAiConfig();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [aiGroupOpen, setAiGroupOpen] = useState(readAiGroupOpen);

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

  const toggleAiGroup = useCallback(() => {
    setAiGroupOpen((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(AI_GROUP_STORAGE_KEY, String(next));
      } catch {
        // Preference simply will not persist across reloads.
      }
      return next;
    });
  }, []);

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

  const handleSignOut = async () => {
    await signOut();
    toast.info('You have been signed out.');
  };

  /** A section is active when the current path sits anywhere beneath it. */
  const isSectionActive = (item) => {
    // Explicit path list, for a section reachable at more than one exact URL.
    if (item.matchPaths) return item.matchPaths.includes(location.pathname);
    if (item.end) return location.pathname === item.to;
    if (item.matchPrefix) {
      return location.pathname === item.matchPrefix || location.pathname.startsWith(`${item.matchPrefix}/`);
    }
    return location.pathname === item.to;
  };

  /**
   * Exact matching for AI destinations.
   *
   * Every agent route lives beneath `/ai`, so the prefix rule used for `/jobs`
   * would leave the assistant highlighted while a recruiter is on the ranking
   * page. Each agent owns exactly one URL, so an exact comparison is both correct
   * and simpler.
   */
  const isAiModeActive = (mode) => location.pathname.replace(/\/+$/, '') === mode.route;

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
          {/* w-4.5 is not a Tailwind step, so this icon previously fell back to
              Lucide's 24px default and overflowed its 36px badge. */}
          <span className="w-9 h-9 rounded-control bg-brand-600 flex items-center justify-center text-white shrink-0">
            <Sparkles className="w-[18px] h-[18px]" aria-hidden="true" />
          </span>
          {!isCollapsed && (
            <span className="min-w-0">
              <span className="text-card-title text-slate-900 leading-tight truncate block">HR Screening</span>
              <span className="text-[11px] text-slate-500 block">Resume screening</span>
            </span>
          )}
        </Link>
      </div>

      <nav
        className={cx('mt-7 space-y-0.5', isCollapsed && 'flex flex-col items-center')}
        aria-label="Main navigation"
      >
        {NAV_ITEMS.map((item) => {
          const sectionActive = isSectionActive(item);

          return (
            <div key={item.to} className={cx(isCollapsed && 'w-full flex flex-col items-center')}>
              <NavLink
                to={item.to}
                end={item.end}
                className={cx(
                  'group relative flex items-center rounded-control text-body font-medium transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                  isCollapsed ? 'justify-center w-10 h-10' : 'gap-2.5 px-3 h-9',
                  // Subtle brand tint plus a stronger label — never a saturated block.
                  sectionActive
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
                aria-current={sectionActive ? 'page' : undefined}
                aria-label={isCollapsed ? item.label : undefined}
              >
                {/* Small accent indicator rather than a large filled block. */}
                {sectionActive && !isCollapsed && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-r bg-brand-600"
                    aria-hidden="true"
                  />
                )}
                <item.icon
                  className={cx('w-[18px] h-[18px] shrink-0', sectionActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')}
                  aria-hidden="true"
                />
                {!isCollapsed && item.label}
                {isCollapsed && <CollapsedTooltip label={item.label} />}
              </NavLink>

            </div>
          );
        })}
      </nav>

      {/* AI Recruitment — a separate, clearly labelled group below the four
          workspace destinations. Additive: with AI_ENABLED=false nothing here
          renders and the rail is byte-for-byte what it was before. */}
      {aiEnabled && (
        <nav
          className={cx('mt-6 pt-5 border-t border-slate-200', isCollapsed && 'flex flex-col items-center w-full')}
          aria-label="AI Recruitment"
        >
          {isCollapsed ? (
            // Collapsed rail: no room for a group header, so the items stand on
            // their own with the shared sparkle marking them as one family.
            <div className="flex flex-col items-center gap-0.5 w-full">
              {AGENT_MODE_LIST.map((mode) => {
                const modeEnabled = isModeEnabled(mode.id);
                const active = isAiModeActive(mode);

                if (!modeEnabled) return null;

                return (
                  <NavLink
                    key={mode.id}
                    to={mode.route}
                    // Exact matching. Without it NavLink treats /ai as active on
                    // every /ai/* route and marks the assistant aria-current
                    // alongside the real destination.
                    end
                    className={cx(
                      'group relative flex items-center justify-center w-10 h-10 rounded-control transition-colors duration-fast',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                      active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    )}
                    aria-current={active ? 'page' : undefined}
                    aria-label={mode.name}
                  >
                    <mode.icon
                      className={cx('w-[18px] h-[18px] shrink-0', active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')}
                      aria-hidden="true"
                    />
                    <CollapsedTooltip label={mode.name} />
                  </NavLink>
                );
              })}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleAiGroup}
                className="w-full flex items-center gap-2 px-3 h-8 rounded-control text-label uppercase text-slate-500
                           hover:text-slate-900 hover:bg-slate-100 transition-colors duration-fast
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-expanded={aiGroupOpen}
                aria-controls="ai-recruitment-group"
              >
                <Sparkles className="w-3.5 h-3.5 text-brand-500 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">AI Recruitment</span>
                <ChevronDown
                  className={cx('w-3.5 h-3.5 shrink-0 transition-transform duration-fast', !aiGroupOpen && '-rotate-90')}
                  aria-hidden="true"
                />
              </button>

              {aiGroupOpen && (
                <div id="ai-recruitment-group" className="mt-1 space-y-0.5">
                  {AGENT_MODE_LIST.map((mode) => {
                    const modeEnabled = isModeEnabled(mode.id);
                    const active = isAiModeActive(mode);

                    // A mode whose flag is off is shown but not navigable. It
                    // reads as "not yet" rather than vanishing, which is what a
                    // recruiter needs to understand the state of the section.
                    if (!modeEnabled) {
                      return (
                        <span
                          key={mode.id}
                          aria-disabled="true"
                          className="flex items-center gap-2.5 px-3 h-9 rounded-control text-body text-slate-400 cursor-not-allowed"
                        >
                          <mode.icon className="w-[18px] h-[18px] shrink-0 text-slate-300" aria-hidden="true" />
                          <span className="flex-1 min-w-0 truncate">{mode.name}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 shrink-0">
                            Soon
                          </span>
                        </span>
                      );
                    }

                    return (
                      <NavLink
                        key={mode.id}
                        to={mode.route}
                        // See the collapsed rail above: /ai would otherwise stay
                        // active across every agent route.
                        end
                        className={cx(
                          'group relative flex items-center gap-2.5 px-3 h-9 rounded-control text-body font-medium transition-colors duration-fast',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                          active
                            ? 'bg-brand-50 text-brand-700 font-semibold'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        {active && (
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-r bg-brand-600"
                            aria-hidden="true"
                          />
                        )}
                        <mode.icon
                          className={cx('w-[18px] h-[18px] shrink-0', active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')}
                          aria-hidden="true"
                        />
                        {mode.name}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </nav>
      )}
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
        <header className="sticky top-0 z-20 h-14 border-b border-slate-200 bg-white/90 backdrop-blur flex items-center gap-3 px-4 sm:px-6 lg:px-8">
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

                {/* Theme, mailbox and account details all live in Settings now.
                    The top-bar toggle remains for a quick light/dark flip. */}
                <Link
                  to="/settings"
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-meta font-medium text-slate-700 hover:bg-slate-50 transition-colors duration-fast border-b border-slate-100"
                >
                  <Settings className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  Settings
                </Link>

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

        <main id="main-content" className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1400px] mx-auto">
          {children}
        </main>

        <footer className="px-4 sm:px-6 lg:px-8 pb-8 max-w-[1400px] mx-auto">
          <p className="text-xs text-slate-400 border-t border-slate-200 pt-5">
            Relevance scores are decision-support signals only. Every hiring decision stays with your recruiters.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default AppShell;
