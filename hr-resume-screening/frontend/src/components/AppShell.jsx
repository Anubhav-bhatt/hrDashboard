import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  Bot,
  Search
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAiConfig } from '../context/AiConfigContext';
import { FOCUS_ROUTE, useWorkspaceMode } from '../context/WorkspaceModeContext';
import { AGENT_MODES } from '../constants/agentModes';
import { getAgentTaskLabel } from '../constants/terminology';
import { useToast } from './ToastProvider';
import { ThemeToggleButton } from './ThemeSelector';
import WorkspaceModeToggle from './workspace/WorkspaceModeToggle';
import CommandPalette from './CommandPalette';
import { Avatar, Button, cx } from './ui';

export const SIDEBAR_STORAGE_KEY = 'hr-dashboard-sidebar-collapsed';
export const AI_GROUPS_STORAGE_KEY = 'hr-dashboard-ai-group-collapsed';
export const AI_TOOLS_STORAGE_KEY = 'hr-dashboard-ai-tools-open';

/*
 * WORKSPACE: where the recruiter is, rather than everything they can reach.
 *
 * "Dashboard", not "Focus". The page follows focus-first principles internally,
 * but a recruiter should not have to learn that word to find their home screen —
 * and `/focus` is already Minimal Mode, so one label was naming two unrelated
 * surfaces.
 *
 * The link targets the named `/dashboard` URL while `matchPaths` keeps the item
 * active on `/` too, because both routes render the same component and `/`
 * remains the app root for existing links and bookmarks.
 */
const WORKSPACE_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, matchPaths: ['/', '/dashboard'] }
];

/*
 * HIRING: the funnel itself, grouped so it reads as one job of work.
 *
 * Closed Jobs is a primary destination here, not a management setting — looking
 * up who was hired for a role is recruitment, not configuration.
 */
const HIRING_NAV_ITEMS = [
  { to: '/jobs', label: 'Jobs', icon: Briefcase, matchPrefix: '/jobs', excludePaths: ['/jobs/closed'] },
  { to: '/candidates', label: 'Candidates', icon: Users, matchPrefix: '/candidates' },
  { to: '/jobs/closed', label: 'Closed Jobs', icon: Archive, end: true }
];

const SYSTEM_NAV_ITEMS = [
  { to: '/settings', label: 'Settings', icon: Settings, matchPrefix: '/settings' }
];

/*
 * How the AI section is split.
 *
 * The Assistant and Hiring Insights answer a question on arrival, so they are
 * destinations. Screening, ranking and comparison each need a job or a candidate
 * chosen first — they are tools applied to work already in progress, and they
 * are reached from that work: the job workspace, a candidate, the command
 * palette, or the disclosure in this rail. Their routes are unchanged and
 * nothing here gates them.
 */
const AI_PRIMARY_MODE_IDS = ['assistant', 'insights'];
const AI_TOOL_MODE_IDS = ['screening', 'ranking', 'comparison'];

const AI_PRIMARY_MODES = AI_PRIMARY_MODE_IDS.map((id) => AGENT_MODES[id]);
const AI_TOOL_MODES = AI_TOOL_MODE_IDS.map((id) => AGENT_MODES[id]);
/* Presentation order for the icons-only rail, which has no disclosure. */
const AI_NAV_MODES = [...AI_PRIMARY_MODES, ...AI_TOOL_MODES];

/**
 * A navigation row for an agent mode, labelled by the task it performs.
 *
 * `getAgentTaskLabel` is presentation language only: the mode id, its route and
 * every API contract are untouched, so "Find Best Matches" and the ranking agent
 * remain the same thing to the server.
 */
const aiNavItem = (mode) => ({
  to: mode.route,
  label: getAgentTaskLabel(mode.id),
  icon: mode.icon,
  end: true
});

/* Minimalistic Mode navigation: task-first, and fewer choices. */
const MINIMAL_MAIN_NAV = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard, matchPaths: ['/', '/dashboard'] }
];

const MINIMAL_HIRING_NAV = [
  { to: '/jobs', label: 'Active Jobs', icon: Briefcase, matchPrefix: '/jobs', excludePaths: ['/jobs/closed'] },
  { to: '/candidates', label: 'Candidates', icon: Users, matchPrefix: '/candidates' },
  { to: '/jobs/closed', label: 'Closed Jobs', icon: Archive, end: true }
];

const MINIMAL_ASSISTANT_NAV = [
  { to: '/ai', label: 'Assistant', icon: Bot, end: true }
];

const MINIMAL_SYSTEM_NAV = [
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

/*
 * The specialist tools start tucked away.
 *
 * Only an explicit "true" opens them, so a recruiter who has never touched the
 * disclosure — and a fresh browser — both get the calmer rail.
 */
const readAiToolsOpen = () => {
  try {
    return window.localStorage.getItem(AI_TOOLS_STORAGE_KEY) === 'true';
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

/**
 * One destination in the rail.
 *
 * Every group renders the same row — icon, label, active tint, and a tooltip
 * when the rail is icons-only — so it is written once here rather than eight
 * times across the two navigation compositions.
 *
 * A plain Link, not a NavLink. Activeness for these items is a question about
 * the whole rail rather than about one URL: Dashboard is active on both `/` and
 * `/dashboard`, and Jobs is inactive on `/jobs/closed`. NavLink recomputes
 * `aria-current` from its own `to` match and *overrides* whatever is passed to
 * it, so an item could be styled active while silently announcing nothing.
 * Taking `active` as a prop keeps one source of truth for the class and the
 * announced state.
 */
const NavRailLink = ({ item, active, isCollapsed }) => {
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      className={cx(
        'group relative flex items-center rounded-control border-l-2 text-xs font-medium transition-colors',
        isCollapsed ? 'justify-center w-9 h-9 mx-auto' : 'gap-2.5 px-3 py-2',
        active
          ? 'border-brand-600 bg-slate-100 text-slate-900 font-semibold'
          : 'border-transparent text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
      )}
      aria-current={active ? 'page' : undefined}
      /* Only when the rail is icons-only. Expanded, the visible text already
         names the link, and a duplicate aria-label would make it
         indistinguishable from other controls named "Candidates". */
      aria-label={isCollapsed ? item.label : undefined}
    >
      <Icon
        className={cx('w-4 h-4 shrink-0', active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')}
        aria-hidden="true"
      />
      {!isCollapsed && <span className="truncate">{item.label}</span>}
      {isCollapsed && <CollapsedTooltip label={item.label} />}
    </Link>
  );
};

/**
 * A titled group of destinations.
 *
 * The heading is dropped when the rail is icons-only, where a word set over a
 * column of icons costs more room than it explains.
 */
const NavGroup = ({ title, ariaLabel, items, isCollapsed, isActive }) => (
  <nav aria-label={ariaLabel} className="space-y-1">
    {title && !isCollapsed && (
      <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
    )}
    <div className="space-y-0.5 px-2">
      {items.map((item) => (
        <NavRailLink key={item.to} item={item} active={isActive(item)} isCollapsed={isCollapsed} />
      ))}
    </div>
  </nav>
);

/**
 * An agent the feature flags have turned off.
 *
 * Shown as unavailable rather than hidden, so a recruiter who has heard of a
 * capability can see that it exists and is not yet switched on — which is a
 * different message from it not existing. Not a link, and marked as such.
 */
const DisabledAgentRow = ({ label, icon: Icon, isCollapsed = false }) => {
  if (isCollapsed) {
    return (
      <div
        aria-disabled="true"
        className="group relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-medium text-slate-400 opacity-60 cursor-not-allowed"
      >
        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
        <CollapsedTooltip label={`${label} (Soon)`} />
      </div>
    );
  }

  return (
    <div
      aria-disabled="true"
      className="flex items-center justify-between rounded-lg text-xs font-medium gap-2.5 px-3 py-2 text-slate-400 cursor-not-allowed opacity-75"
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <Icon className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-[10px] uppercase font-semibold text-slate-400 border border-slate-200 rounded px-1 py-0.2">
        Soon
      </span>
    </div>
  );
};

/** The product mark, and which composition the recruiter is in. */
const BrandHeader = ({ isCollapsed, subtitle, accentSubtitle = false }) => (
  <div
    className={cx(
      'flex items-center gap-2.5 h-14 border-b border-slate-100 shrink-0',
      isCollapsed ? 'justify-center px-0' : 'px-4'
    )}
  >
    <Link to="/" className="flex items-center gap-2.5 rounded-md min-w-0" aria-label="HR Screening OS">
      <span className="w-8 h-8 rounded-control bg-brand-600 flex items-center justify-center text-white shrink-0">
        <Sparkles className="w-4 h-4" aria-hidden="true" />
      </span>
      {!isCollapsed && (
        <span className="min-w-0">
          <span className="text-sm font-bold text-slate-900 leading-none block">HR Screening</span>
          <span
            className={cx(
              'text-[10px] block mt-0.5',
              accentSubtitle ? 'text-brand-600 font-semibold' : 'text-slate-500 font-medium'
            )}
          >
            {subtitle}
          </span>
        </span>
      )}
    </Link>
  </div>
);

/** Collapses the rail to icons. Desktop only — the mobile drawer is not a rail. */
const RailFooter = ({ collapsed, onToggle }) => (
  <div className="p-2 border-t border-slate-100 shrink-0">
    <button
      type="button"
      onClick={onToggle}
      className="hidden lg:flex w-full items-center justify-center p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors text-xs"
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {collapsed ? (
        <ChevronRight className="w-4 h-4" />
      ) : (
        <div className="flex items-center gap-2 w-full px-2">
          <ChevronLeft className="w-4 h-4" />
          <span>Collapse rail</span>
        </div>
      )}
    </button>
  </div>
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
  const [aiToolsOpen, setAiToolsOpen] = useState(readAiToolsOpen);

  const accountRef = useRef(null);
  const mobileNavRef = useRef(null);
  const mobileNavTriggerRef = useRef(null);

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

  const toggleAiTools = useCallback(() => {
    setAiToolsOpen((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(AI_TOOLS_STORAGE_KEY, String(next));
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

  /*
   * The drawer is a modal dialog, so it has to behave like one.
   *
   * It announces itself as `role="dialog" aria-modal="true"`, which tells a
   * screen-reader user they are in a dialog — and then Escape did nothing and
   * focus stayed behind on the page, so the only ways out were a mouse click on
   * the backdrop or tabbing blindly through content the dialog claims to have
   * covered. Escape now closes it, focus moves to the first destination on open,
   * and it returns to the button that opened it on close, so a keyboard user
   * ends up where they started rather than at the top of the document.
   */
  useEffect(() => {
    if (!mobileNavOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setMobileNavOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);

    // After paint: the drawer mounts in this same commit, so the node is not
    // there to focus until the browser has rendered it.
    const raf = window.requestAnimationFrame(() => {
      mobileNavRef.current?.querySelector('a, button')?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.cancelAnimationFrame(raf);
    };
  }, [mobileNavOpen]);

  /*
   * Returning focus is deliberately separate from opening.
   *
   * It must not run on the first render — there was no drawer to close then, and
   * focusing the trigger would steal focus from wherever the recruiter actually
   * was on arrival.
   */
  const drawerWasOpen = useRef(false);
  useEffect(() => {
    if (drawerWasOpen.current && !mobileNavOpen) mobileNavTriggerRef.current?.focus();
    drawerWasOpen.current = mobileNavOpen;
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
    /* The crumb names the destination the rail names: "Home" in Minimal Mode,
       "Dashboard" in Standard, matching the nav item the recruiter clicked. */
    if (path === '/' || path === '/dashboard')
      return [{ label: isMinimal ? 'Home' : 'Dashboard', to: '/dashboard' }];
    if (path.startsWith('/jobs/create') || path.startsWith('/jobs/new')) return [{ label: 'Jobs', to: '/jobs' }, { label: 'Create Job' }];
    if (path.startsWith('/jobs/closed')) return [{ label: 'Jobs', to: '/jobs' }, { label: 'Closed Jobs' }];
    if (path.startsWith('/jobs/')) return [{ label: 'Jobs', to: '/jobs' }, { label: 'Job Workspace' }];
    if (path === '/jobs') return [{ label: 'Jobs', to: '/jobs' }];
    if (path.startsWith('/candidates/')) return [{ label: 'Candidates', to: '/candidates' }, { label: 'Profile' }];
    if (path === '/candidates') return [{ label: 'Candidates', to: '/candidates' }];
    if (/^\/jobs\/[^/]+\/import$/.test(path)) {
      return [{ label: 'Jobs', to: '/jobs' }, { label: 'Add candidates' }];
    }
    /* Named by the task, matching the rail. A recruiter should not read
       "Ranking Agent" in a breadcrumb after clicking "Find Best Matches". */
    if (path === '/ai') return [{ label: 'AI', to: '/ai' }, { label: getAgentTaskLabel('assistant') }];
    if (path === '/ai/screening') return [{ label: 'AI', to: '/ai' }, { label: getAgentTaskLabel('screening') }];
    if (path === '/ai/ranking') return [{ label: 'AI', to: '/ai' }, { label: getAgentTaskLabel('ranking') }];
    if (path === '/ai/comparison') return [{ label: 'AI', to: '/ai' }, { label: getAgentTaskLabel('comparison') }];
    if (path === '/ai/insights') return [{ label: 'AI', to: '/ai' }, { label: getAgentTaskLabel('insights') }];
    if (path === '/settings') return [{ label: 'Settings', to: '/settings' }];
    return [{ label: 'Overview', to: '/' }];
  };

  const isFocusWorkspace = isMinimal && location.pathname === FOCUS_ROUTE;

  const SidebarNav = ({ isCollapsed = false }) => {
    /*
     * Whether the specialist tools are on show.
     *
     * Standing on one of their routes reveals the group without writing a
     * preference: the recruiter is looking at that page, so the item leading to
     * it must be visible and carry `aria-current` — but arriving there once is
     * not a statement that they want the group open from then on.
     */
    const onToolRoute = AI_TOOL_MODES.some((mode) => isAiModeActive(mode));
    const toolsExpanded = aiToolsOpen || onToolRoute;

    if (isMinimal && !isFocusWorkspace) {
      return (
        <div className="flex flex-col h-full">
          <BrandHeader isCollapsed={isCollapsed} subtitle="Minimal Workspace" accentSubtitle />

          {/*
            Six destinations, and four of them are the hiring funnel. Minimal
            mode names the task ("Assistant"), never the machinery, and the
            specialist tools are entered from the work itself rather than chosen
            from a menu.
          */}
          <div className="flex-1 overflow-y-auto scroll-slim py-4 space-y-4">
            <NavGroup
              ariaLabel="Main navigation"
              items={MINIMAL_MAIN_NAV}
              isCollapsed={isCollapsed}
              isActive={isSectionActive}
            />
            <NavGroup
              title="HIRING"
              ariaLabel="Hiring navigation"
              items={MINIMAL_HIRING_NAV}
              isCollapsed={isCollapsed}
              isActive={isSectionActive}
            />
            {aiEnabled && (
              <NavGroup
                title="ASSISTANT"
                ariaLabel="Assistant navigation"
                items={MINIMAL_ASSISTANT_NAV}
                isCollapsed={isCollapsed}
                isActive={isSectionActive}
              />
            )}
            <NavGroup
              title="SYSTEM"
              ariaLabel="System navigation"
              items={MINIMAL_SYSTEM_NAV}
              isCollapsed={isCollapsed}
              isActive={isSectionActive}
            />
          </div>

          <RailFooter collapsed={collapsed} onToggle={toggleCollapsed} />
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <BrandHeader isCollapsed={isCollapsed} subtitle="Enterprise OS" />

        <div className="flex-1 overflow-y-auto scroll-slim py-4 space-y-4">
          {/*
            Four groups answering four different questions: where am I, what am I
            hiring for, what can help me, and what do I configure. Jobs,
            Candidates and Closed Jobs used to sit under WORKSPACE beside the
            Dashboard, which left that heading meaning "everything".
          */}
          <NavGroup
            title="WORKSPACE"
            ariaLabel="Main navigation"
            items={WORKSPACE_NAV_ITEMS}
            isCollapsed={isCollapsed}
            isActive={isSectionActive}
          />

          <NavGroup
            title="HIRING"
            ariaLabel="Hiring navigation"
            items={HIRING_NAV_ITEMS}
            isCollapsed={isCollapsed}
            isActive={isSectionActive}
          />

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
                    <span>AI</span>
                    <ChevronDown
                      className={cx('w-3.5 h-3.5 transition-transform duration-150', aiGroupCollapsed && '-rotate-90')}
                    />
                  </button>

                  {!aiGroupCollapsed && (
                    <div id="ai-recruitment-group" className="space-y-0.5 mt-1">
                      {/*
                        Two destinations, because two are enough to start from:
                        ask a question, or read how hiring is going. The three
                        candidate-specific tools sit in the disclosure below —
                        each needs a job or a candidate chosen before it can do
                        anything, so listing them as equals to the Assistant was
                        offering four doors where three led to a picker.
                      */}
                      {AI_PRIMARY_MODES.map((mode) => {
                        const item = aiNavItem(mode);
                        return isModeEnabled(mode.id) ? (
                          <NavRailLink key={mode.id} item={item} active={isAiModeActive(mode)} isCollapsed={false} />
                        ) : (
                          <DisabledAgentRow key={mode.id} label={item.label} icon={mode.icon} />
                        );
                      })}

                      {/* Present and reachable, but no longer competing. */}
                      <button
                        type="button"
                        aria-controls="ai-tools-group"
                        aria-expanded={toolsExpanded}
                        onClick={toggleAiTools}
                        className="w-full flex items-center gap-1.5 px-3 py-2 rounded-control text-xs font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 transition-colors"
                      >
                        <ChevronRight
                          className={cx(
                            'w-3.5 h-3.5 shrink-0 transition-transform duration-150',
                            toolsExpanded && 'rotate-90'
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">More AI tools</span>
                      </button>

                      {toolsExpanded && (
                        <div id="ai-tools-group" className="space-y-0.5 pl-2">
                          {AI_TOOL_MODES.map((mode) => {
                            const item = aiNavItem(mode);
                            return isModeEnabled(mode.id) ? (
                              <NavRailLink
                                key={mode.id}
                                item={item}
                                active={isAiModeActive(mode)}
                                isCollapsed={false}
                              />
                            ) : (
                              <DisabledAgentRow key={mode.id} label={item.label} icon={mode.icon} />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /*
                 * Icons-only rail: no disclosure. Five icons in a column is not
                 * the clutter the disclosure exists to prevent, and putting three
                 * of them behind a control with no room for a label would make
                 * them unfindable rather than calmer.
                 */
                <div className="space-y-0.5 px-2">
                  {AI_NAV_MODES.map((mode) => {
                    const item = aiNavItem(mode);
                    return isModeEnabled(mode.id) ? (
                      <NavRailLink key={mode.id} item={item} active={isAiModeActive(mode)} isCollapsed />
                    ) : (
                      <DisabledAgentRow key={mode.id} label={item.label} icon={mode.icon} isCollapsed />
                    );
                  })}
                </div>
              )}
            </nav>
          )}

          <NavGroup
            title="SYSTEM"
            ariaLabel="System navigation"
            items={SYSTEM_NAV_ITEMS}
            isCollapsed={isCollapsed}
            isActive={isSectionActive}
          />
        </div>

        <RailFooter collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>
    );
  };

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
      {/* Retracted on /focus, open and streamlined in minimal mode across other pages */}
      <aside
        aria-hidden={isFocusWorkspace || undefined}
        className={cx(
          'hidden lg:flex flex-col shrink-0 bg-white select-none z-30 sticky top-0 h-screen app-rail',
          isFocusWorkspace ? 'app-rail-retracted' : cx('border-r border-slate-200/80', collapsed ? 'w-16' : 'w-56')
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
            ref={mobileNavRef}
            id="mobile-navigation-drawer"
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
            {!isFocusWorkspace && (
              <button
                type="button"
                ref={mobileNavTriggerRef}
                className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-navigation-drawer"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            {isFocusWorkspace ? (
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
              <div className="flex items-center gap-2 min-w-0">
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
                {isMinimal && (
                  <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200/60">
                    Minimal
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: Quick Search + Theme + Account */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Cmd+K Search Trigger. Hidden in focus workspace */}
            {!isFocusWorkspace && (
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

            {/* Workspace mode toggle */}
            <WorkspaceModeToggle withLabel={isMinimal || isFocusWorkspace} />

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
