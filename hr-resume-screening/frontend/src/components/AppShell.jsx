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
import { AGENT_MODES } from '../constants/agentModes';
import { useToast } from './ToastProvider';
import { ThemeToggleButton } from './ThemeSelector';
import CommandPalette from './CommandPalette';
import { Avatar, Button, cx } from './ui';

export const SIDEBAR_STORAGE_KEY = 'hr-dashboard-sidebar-collapsed';
export const AI_GROUPS_STORAGE_KEY = 'hr-dashboard-ai-group-collapsed';

const MAIN_NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, matchPaths: ['/', '/dashboard'] },
  { to: '/jobs', label: 'Jobs', icon: Briefcase, matchPrefix: '/jobs' },
  { to: '/candidates', label: 'Candidates', icon: Users, matchPrefix: '/candidates' },
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
    className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 whitespace-nowrap rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-md opacity-0 translate-x-[-4px] transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-focus:opacity-100 group-focus:translate-x-0"
  >
    {label}
  </span>
);

const AppShell = ({ children }) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { enabled: aiEnabled, isModeEnabled } = useAiConfig();
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
    if (path === '/' || path === '/dashboard') return [{ label: 'Dashboard', to: '/' }];
    if (path.startsWith('/jobs/create') || path.startsWith('/jobs/new')) return [{ label: 'Jobs', to: '/jobs' }, { label: 'Create Job' }];
    if (path.startsWith('/jobs/closed')) return [{ label: 'Jobs', to: '/jobs' }, { label: 'Closed Jobs' }];
    if (path.startsWith('/jobs/')) return [{ label: 'Jobs', to: '/jobs' }, { label: 'Job Workspace' }];
    if (path === '/jobs') return [{ label: 'Jobs', to: '/jobs' }];
    if (path.startsWith('/candidates/')) return [{ label: 'Candidates', to: '/candidates' }, { label: 'Profile' }];
    if (path === '/candidates') return [{ label: 'Candidates', to: '/candidates' }];
    if (path.startsWith('/import')) return [{ label: 'Import', to: '/import' }];
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
      <div className={cx('flex items-center gap-2.5 h-14 border-b border-slate-100 dark:border-slate-800/80 shrink-0', isCollapsed ? 'justify-center px-0' : 'px-4')}>
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-md min-w-0"
          aria-label="HR Screening OS"
        >
          <span className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white shrink-0 shadow-xs">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
          </span>
          {!isCollapsed && (
            <span className="min-w-0">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-none block">HR Screening</span>
              <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Enterprise OS</span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigation Content */}
      <div className="flex-1 overflow-y-auto scroll-slim py-4 space-y-4">
        {/* Main Workspace Navigation */}
        <nav aria-label="Main navigation" className="space-y-1">
          {!isCollapsed && (
            <p className="px-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              WORKSPACE
            </p>
          )}
          <div className="space-y-0.5 px-2">
            {MAIN_NAV_ITEMS.map((item) => {
              const active = isSectionActive(item);
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cx(
                    'group relative flex items-center rounded-lg text-xs font-medium transition-colors',
                    isCollapsed ? 'justify-center w-9 h-9 mx-auto' : 'gap-2.5 px-3 py-2',
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                  )}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                >
                  <Icon
                    className={cx(
                      'w-4 h-4 shrink-0',
                      active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
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
                  className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
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
                            className="flex items-center justify-between rounded-lg text-xs font-medium gap-2.5 px-3 py-2 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-75"
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <Icon className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-600" aria-hidden="true" />
                              <span className="truncate">{mode.name}</span>
                            </span>
                            <span className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800 rounded px-1 py-0.2">
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
                            'group relative flex items-center rounded-lg text-xs font-medium transition-colors gap-2.5 px-3 py-2',
                            active
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                          )}
                          aria-current={active ? 'page' : undefined}
                          aria-label={mode.name}
                        >
                          <Icon
                            className={cx(
                              'w-4 h-4 shrink-0',
                              active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
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
                        className="group relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-medium text-slate-400 dark:text-slate-600 opacity-60 cursor-not-allowed"
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
                        'group relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-medium transition-colors',
                        active
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                      )}
                      aria-current={active ? 'page' : undefined}
                      aria-label={mode.name}
                    >
                      <Icon
                        className={cx(
                          'w-4 h-4 shrink-0',
                          active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
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
      </div>

      {/* Sidebar Footer */}
      <div className="p-2 border-t border-slate-100 dark:border-slate-800/80 shrink-0">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden lg:flex w-full items-center justify-center p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-xs"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <div className="flex items-center gap-2 w-full px-2"><ChevronLeft className="w-4 h-4" /><span>Collapse rail</span></div>}
        </button>
      </div>
    </div>
  );

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside
        className={cx(
          'hidden lg:flex flex-col shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800/80 transition-all duration-200 select-none z-30 sticky top-0 h-screen',
          collapsed ? 'w-16' : 'w-56'
        )}
      >
        <SidebarNav isCollapsed={collapsed} />
      </aside>

      {/* Mobile Drawer Backdrop & Drawer */}
      {mobileNavOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs lg:hidden animate-fade-in"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation drawer"
            className="fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col lg:hidden animate-fade-in"
          >
            <SidebarNav isCollapsed={false} />
          </aside>
        </>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Contextual Top Header */}
        <header className="h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 gap-3">
          {/* Left: Mobile trigger & Breadcrumbs */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb path */}
            <nav className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium truncate" aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={crumb.label}>
                    {idx > 0 && <span className="text-slate-300 dark:text-slate-600">/</span>}
                    {isLast ? (
                      <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{crumb.label}</span>
                    ) : (
                      <Link to={crumb.to} className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
                        {crumb.label}
                      </Link>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          {/* Right: Quick Search + Theme + Account */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Cmd+K Search Trigger */}
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700/70 text-slate-500 dark:text-slate-400 text-xs transition-colors"
              aria-label="Search and quick commands (Cmd+K)"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search...</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-slate-400 bg-white dark:bg-slate-900 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                ⌘K
              </kbd>
            </button>

            {/* Theme Toggle */}
            <ThemeToggleButton />

            {/* Account Menu */}
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((prev) => !prev)}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                aria-label="User account menu"
              >
                <Avatar name={user?.name || 'Recruiter'} size="sm" />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 text-xs animate-fade-in"
                >
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{user?.name || 'Recruiter'}</p>
                    <p className="text-[11px] text-slate-400 truncate">{user?.email || 'user@company.com'}</p>
                    <span className="inline-block mt-1 px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase">
                      {user?.role || 'RECRUITER'}
                    </span>
                  </div>

                  <Link
                    to="/settings"
                    role="menuitem"
                    className="flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => setAccountOpen(false)}
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-400" />
                    <span>Settings & Sourcing</span>
                  </Link>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-left border-t border-slate-100 dark:border-slate-800 mt-1"
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
