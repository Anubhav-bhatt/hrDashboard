import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Archive,
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
  Upload,
  Mail,
  Bot,
  Search,
  Command,
  HelpCircle,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAiConfig } from '../context/AiConfigContext';
import { useWorkspaceMode } from '../context/WorkspaceModeContext';
import { AGENT_MODES } from '../constants/agentModes';
import { useToast } from './ToastProvider';
import { ThemeToggleButton } from './ThemeSelector';
import WorkspaceModeToggle from './workspace/WorkspaceModeToggle';
import CommandPalette from './CommandPalette';
import { Avatar, Button, cx } from './ui';

export const SIDEBAR_STORAGE_KEY = 'hr-dashboard-sidebar-collapsed';
export const AI_GROUPS_STORAGE_KEY = 'hr-dashboard-ai-group-collapsed';

const MAIN_NAV_ITEMS = [
  /*
   * "Dashboard", not "Focus".
   *
   * The page follows focus-first principles internally, but a recruiter should
   * not have to learn that word to find their home screen — and `/focus` is
   * already Minimal Mode, so one label was naming two unrelated surfaces.
   *
   * The link targets the named `/dashboard` URL while `matchPaths` keeps the
   * item active on `/` too, because both routes render the same component and
   * `/` remains the app root for existing links and bookmarks.
   */
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, matchPaths: ['/', '/dashboard'] },
  { to: '/jobs', label: 'Jobs', icon: Briefcase, matchPrefix: '/jobs', excludePaths: ['/jobs/closed'] },
  { to: '/candidates', label: 'Candidates', icon: Users, matchPrefix: '/candidates' },
  /*
   * Closed Jobs is a primary destination, not a management setting.
   *
   * It was previously nested under Management alongside Settings, which grouped
   * a high-frequency recruiter destination — hiring history — with configuration
   * a recruiter touches a few times a year. `end: true` keeps it active only on
   * the exact path, and the Jobs item above already excludes `/jobs/closed`, so
   * the two never light up together.
   */
  { to: '/jobs/closed', label: 'Closed Jobs', icon: Archive, end: true }
];

const MANAGEMENT_NAV_ITEMS = [
  { to: '/settings', label: 'Settings', icon: Settings, matchPrefix: '/settings' }
];

const readCollapsed = () => {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const readAiGroupCollapsed = () => {
  try {
    return window.localStorage.getItem(AI_GROUPS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const CollapsedTooltip = ({ label }) => (
  <span
    role="tooltip"
    className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-normal text-slate-800 shadow-md opacity-0 translate-x-[-4px] transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-focus:opacity-100 group-focus:translate-x-0"
  >
    {label}
  </span>
);

const AppShell = ({ children }) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { enabled: aiEnabled, isModeEnabled } = useAiConfig();
  const { isMinimal } = useWorkspaceMode();
  const toast = useToast();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [aiGroupCollapsed, setAiGroupCollapsed] = useState(readAiGroupCollapsed);

  const accountRef = useRef(null);

  // Close menus on navigation
  useEffect(() => {
    setMobileNavOpen(false);
    setAccountOpen(false);
  }, [location.pathname, location.search]);

  // Keyboard shortcut for Command Palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const toggleAiGroup = useCallback(() => {
    setAiGroupCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(AI_GROUPS_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  // Account dropdown click outside
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

  // Lock body scroll on mobile nav
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

  const isSectionActive = (item) => {
    if (item.excludePaths?.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))) {
      return false;
    }
    if (item.matchPaths) {
      if (item.matchPaths.includes(location.pathname)) return true;
      if (location.search && item.matchPaths.includes(`${location.pathname}${location.search}`)) return true;
    }
    if (item.end) return location.pathname === item.to;
    if (item.matchPrefix) {
      return location.pathname === item.matchPrefix || location.pathname.startsWith(`${item.matchPrefix}/`);
    }
    return location.pathname === item.to;
  };

  const isAiModeActive = (mode) => location.pathname.replace(/\/+$/, '') === mode.route;

  // Build breadcrumb segments
  const getBreadcrumbs = () => {
    const path = location.pathname;
    if (path === '/' || path === '/dashboard') return [{ label: 'Dashboard', to: '/dashboard' }];
    if (path.startsWith('/jobs/create') || path.startsWith('/jobs/new')) return [{ label: 'Jobs', to: '/jobs' }, { label: 'Create Job' }];
    if (path.startsWith('/jobs/closed')) return [{ label: 'Jobs', to: '/jobs' }, { label: 'Closed Jobs' }];
    if (path.startsWith('/jobs/')) return [{ label: 'Jobs', to: '/jobs' }, { label: 'Job Workspace' }];
    if (path === '/jobs') return [{ label: 'Jobs', to: '/jobs' }];
    if (path.startsWith('/candidates/')) return [{ label: 'Candidates', to: '/candidates' }, { label: 'Profile' }];
    if (path === '/candidates') return [{ label: 'Candidates', to: '/candidates' }];
    if (/^\/jobs\/[^/]+\/import$/.test(path)) {
      return [{ label: 'Jobs', to: '/jobs' }, { label: 'Add candidates' }];
    }
    if (path === '/ai') return [{ label: 'AI Tools', to: '/ai' }, { label: 'Workspace' }];
    if (path === '/ai/screening') return [{ label: 'AI Tools', to: '/ai' }, { label: 'Screening Agent' }];
    if (path === '/ai/ranking') return [{ label: 'AI Tools', to: '/ai' }, { label: 'Ranking Agent' }];
    if (path === '/ai/comparison') return [{ label: 'AI Tools', to: '/ai' }, { label: 'Comparison Agent' }];
    if (path === '/ai/insights') return [{ label: 'AI Tools', to: '/ai' }, { label: 'Insights Agent' }];
    if (path === '/settings') return [{ label: 'Settings', to: '/settings' }];
    return [{ label: 'Overview', to: '/' }];
  };

  const allAiModes = Object.values(AGENT_MODES);

  const SidebarNav = ({ isCollapsed = false }) => (
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div className={cx('flex items-center gap-2.5 h-14 border-b border-slate-100 shrink-0', isCollapsed ? 'justify-center px-0' : 'px-4')}>
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-md min-w-0"
          aria-label="HR Screening OS"
        >
          <span className="w-8 h-8 rounded-control bg-brand-600 flex items-center justify-center text-white shrink-0">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
          </span>
          {!isCollapsed && (
            <span className="min-w-0">
              <span className="text-sm font-bold text-slate-900 leading-none block">HR Screening</span>
              <span className="text-[10px] text-slate-500 font-medium block mt-0.5">Enterprise OS</span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigation Content */}
      <div className="flex-1 overflow-y-auto scroll-slim py-4 space-y-4">
        {/* Main Workspace Navigation */}
        <nav aria-label="Main navigation" className="space-y-1">
          {!isCollapsed && (
            <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              WORKSPACE
            </p>
          )}
          <div className="space-y-0.5 px-2">
            {MAIN_NAV_ITEMS.map((item) => {
              const active = isSectionActive(item);
              const Icon = item.icon;

              return (
                /*
                 * A plain Link, not a NavLink.
                 *
                 * `isSectionActive` already decides activeness for these items,
                 * including the cases NavLink cannot express — Dashboard is
                 * active on both `/` and `/dashboard`, and Jobs is inactive on
                 * `/jobs/closed`. NavLink additionally *overrides* the
                 * `aria-current` passed to it, recomputing it from its own `to`
                 * match, so with `to="/dashboard"` the item silently lost
                 * `aria-current` while visiting `/` even though it was styled
                 * active. Using Link keeps one source of truth for both the
                 * class and the announced state.
                 */
                <Link
                  key={item.to}
                  to={item.to}
                  className={cx(
                    'group relative flex items-center rounded-control border-l-2 text-xs font-medium transition-colors',
                    isCollapsed ? 'justify-center w-9 h-9 mx-auto' : 'gap-2.5 px-3 py-2',
                    active
                      ? 'border-brand-600 bg-slate-100 text-slate-900 font-semibold'
                      : 'border-transparent text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                  )}
                  aria-current={active ? 'page' : undefined}
                  // Only when the rail is collapsed to icons. Expanded, the
                  // visible text already names the link, and an aria-label
                  // duplicating it adds nothing while making the link
                  // indistinguishable from other controls named "Candidates".
                  aria-label={isCollapsed ? item.label : undefined}
                >
                  <Icon
                    className={cx(
                      'w-4 h-4 shrink-0',
                      active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'
                    )}
                    aria-hidden="true"
                  />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                  {isCollapsed && <CollapsedTooltip label={item.label} />}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* AI Recruitment Section */}
        {aiEnabled && (
          <nav aria-label="AI Recruitment" className="space-y-1">
            {!isCollapsed ? (
              <div className="px-2">
                <button
                  type="button"
                  aria-controls="ai-recruitment-group"
                  aria-expanded={!aiGroupCollapsed}
                  onClick={toggleAiGroup}
                  className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-600 transition-colors"
                >
                  <span>AI Recruitment</span>
                  <ChevronDown
                    className={cx('w-3.5 h-3.5 transition-transform duration-150', aiGroupCollapsed && '-rotate-90')}
                  />
                </button>

                {!aiGroupCollapsed && (
                  <div id="ai-recruitment-group" className="space-y-0.5 mt-1">
                    {allAiModes.map((mode) => {
                      const enabled = isModeEnabled(mode.id);
                      const active = enabled && isAiModeActive(mode);
                      const Icon = mode.icon;

                      if (!enabled) {
                        return (
                          <div
                            key={mode.id}
                            aria-disabled="true"
                            className="flex items-center justify-between rounded-lg text-xs font-medium gap-2.5 px-3 py-2 text-slate-400 cursor-not-allowed opacity-75"
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <Icon className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
                              <span className="truncate">{mode.name}</span>
                            </span>
                            <span className="text-[10px] uppercase font-semibold text-slate-400 border border-slate-200 rounded px-1 py-0.2">
                              Soon
                            </span>
                          </div>
                        );
                      }

                      return (
                        <NavLink
                          key={mode.id}
                          to={mode.route}
                          end
                          className={cx(
                            'group relative flex items-center rounded-control border-l-2 text-xs font-medium transition-colors gap-2.5 px-3 py-2',
                            active
                              ? 'border-brand-600 bg-slate-100 text-slate-900 font-semibold'
                              : 'border-transparent text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                          )}
                          aria-current={active ? 'page' : undefined}
                          // The agent name is rendered as visible text below, so
                          // no aria-label is needed here. The collapsed rail
                          // variant further down does set one, because there the
                          // link is an icon with no text.
                        >
                          <Icon
                            className={cx(
                              'w-4 h-4 shrink-0',
                              active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'
                            )}
                            aria-hidden="true"
                          />
                          <span className="truncate">{mode.name}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-0.5 px-2">
                {allAiModes.map((mode) => {
                  const enabled = isModeEnabled(mode.id);
                  const active = enabled && isAiModeActive(mode);
                  const Icon = mode.icon;

                  if (!enabled) {
                    return (
                      <div
                        key={mode.id}
                        aria-disabled="true"
                        className="group relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-medium text-slate-400 opacity-60 cursor-not-allowed"
                      >
                        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <CollapsedTooltip label={`${mode.name} (Soon)`} />
                      </div>
                    );
                  }

                  return (
                    <NavLink
                      key={mode.id}
                      to={mode.route}
                      end
                      className={cx(
                        'group relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-normal transition-colors',
                        active
                          ? 'bg-slate-100 text-slate-900 font-semibold'
                          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                      )}
                      aria-current={active ? 'page' : undefined}
                      aria-label={mode.name}
                    >
                      <Icon
                        className={cx(
                          'w-4 h-4 shrink-0',
                          active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'
                        )}
                        aria-hidden="true"
                      />
                      <CollapsedTooltip label={mode.name} />
                    </NavLink>
                  );
                })}
              </div>
            )}
          </nav>
        )}

        <nav aria-label="Management" className="space-y-1">
          {!isCollapsed && (
            <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              MANAGEMENT
            </p>
          )}
          <div className="space-y-0.5 px-2">
            {MANAGEMENT_NAV_ITEMS.map((item) => {
              const active = isSectionActive(item);
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={cx(
                    'group relative flex items-center rounded-control border-l-2 text-xs font-medium transition-colors',
                    isCollapsed ? 'justify-center w-9 h-9 mx-auto' : 'gap-2.5 px-3 py-2',
                    active
                      ? 'border-brand-600 bg-slate-100 text-slate-900 font-semibold'
                      : 'border-transparent text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                  )}
                  aria-current={active ? 'page' : undefined}
                  aria-label={isCollapsed ? item.label : undefined}
                >
                  <Icon
                    className={cx(
                      'w-4 h-4 shrink-0',
                      active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'
                    )}
                    aria-hidden="true"
                  />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                  {isCollapsed && <CollapsedTooltip label={item.label} />}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Sidebar Footer */}
      <div className="p-2 border-t border-slate-100 shrink-0">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden lg:flex w-full items-center justify-center p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors text-xs"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <div className="flex items-center gap-2 w-full px-2"><ChevronLeft className="w-4 h-4" /><span>Collapse rail</span></div>}
        </button>
      </div>
    </div>
  );

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Keyboard users land here first and can jump the whole navigation rail
          rather than tabbing through every destination on every page. Visually
          hidden until focused. The #main-content target is on <main> below. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-3 focus:left-3
                   focus:px-4 focus:py-2 focus:bg-white focus:rounded-control focus:shadow-overlay
                   focus:text-meta focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      {/* Kept mounted in minimal mode so the rail can be seen to retract, and so
          leaving minimal mode reopens it rather than popping it into place. The
          retracted class takes it out of the tab order once it has closed. */}
      <aside
        aria-hidden={isMinimal || undefined}
        className={cx(
          'hidden lg:flex flex-col shrink-0 bg-white select-none z-30 sticky top-0 h-screen app-rail',
          // The border is applied only when the rail is open. Declaring it here
          // and zeroing it in CSS did not work: `border-r` is a utility and wins
          // the cascade against the components layer, leaving a 1px hairline
          // where the retracted rail used to be.
          isMinimal ? 'app-rail-retracted' : cx('border-r border-slate-200/80', collapsed ? 'w-16' : 'w-56')
        )}
      >
        <SidebarNav isCollapsed={collapsed} />
      </aside>

      {/* Mobile Drawer Backdrop & Drawer */}
      {mobileNavOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden animate-fade-in"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation drawer"
            className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col lg:hidden animate-fade-in"
          >
            <SidebarNav isCollapsed={false} />
          </aside>
        </>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Contextual Top Header */}
        <header className="h-14 bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 gap-3">
          {/* Left: Mobile trigger & Breadcrumbs */}
          <div className="flex items-center gap-3 min-w-0">
            {/* The drawer opens the navigation minimal mode exists to remove, so
                its trigger goes with it. Leaving is handled on the right. */}
            {!isMinimal && (
              <button
                type="button"
                className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            {isMinimal ? (
              // Breadcrumbs describe a position within a navigation that is not
              // on screen. In its place, a plain statement of the mode.
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white shrink-0"
                  aria-hidden="true"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-bold text-slate-900 truncate">Minimal mode</span>
              </div>
            ) : (
              /* Breadcrumb path */
              <nav className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate" aria-label="Breadcrumb">
                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <React.Fragment key={crumb.label}>
                      {idx > 0 && <span className="text-slate-300">/</span>}
                      {isLast ? (
                        <span className="font-bold text-slate-900 truncate">{crumb.label}</span>
                      ) : (
                        <Link to={crumb.to} className="hover:text-slate-900 transition-colors">
                          {crumb.label}
                        </Link>
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>
            )}
          </div>

          {/* Right: Quick Search + Theme + Account */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Cmd+K Search Trigger. Hidden in minimal mode — the shortcut still
                works, but the affordance is chrome. */}
            {!isMinimal && (
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-control bg-slate-100 hover:bg-slate-200/70 text-slate-500 text-xs transition-colors"
                aria-label="Search and quick commands (Cmd+K)"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Search...</span>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-slate-400 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                  ⌘K
                </kbd>
              </button>
            )}

            {/*
              Workspace mode sits next to appearance because that is where a user
              looks for how the app presents itself — but the two are separate
              controls over separate state, so dark and minimal compose freely.

              In minimal mode it carries its label rather than an icon alone: the
              way out must be readable, not discoverable.
            */}
            <WorkspaceModeToggle withLabel={isMinimal} />

            {/* Theme Toggle */}
            <ThemeToggleButton />

            {/* Account Menu */}
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((prev) => !prev)}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                aria-label="User account menu"
              >
                <Avatar name={user?.name || 'Recruiter'} size="sm" />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-card bg-white border border-slate-200 shadow-overlay py-1.5 z-50 text-xs animate-fade-in"
                >
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="font-bold text-slate-900 truncate">{user?.name || 'Recruiter'}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user?.email || 'user@company.com'}</p>
                    <span className="inline-block mt-1 px-1.5 py-0.2 rounded bg-brand-50 text-brand-700 text-[10px] font-bold uppercase">
                      {user?.role || 'RECRUITER'}
                    </span>
                  </div>

                  <Link
                    to="/settings"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                    onClick={() => setAccountOpen(false)}
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-400" />
                    <span>Settings & Sourcing</span>
                  </Link>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 text-left border-t border-slate-100 mt-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Container */}
        <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
};

export default AppShell;
