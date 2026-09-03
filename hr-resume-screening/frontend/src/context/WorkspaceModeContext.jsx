import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

/**
 * Workspace mode: how much of the application is on screen.
 *
 * This is NOT a theme. Appearance (light / dark / system) answers "what colour
 * is the surface"; workspace mode answers "how much chrome is around the work".
 * They are stored separately, toggled separately and compose freely — dark
 * minimal and light minimal are both reachable, and switching one never moves
 * the other. Merging them would have been less code and would have made "dark"
 * silently mean "and also hide the sidebar".
 *
 * Only the mode name is persisted. No job, candidate, score or response ever
 * enters storage from here.
 */

const WorkspaceModeContext = createContext(null);

export const WORKSPACE_MODE_STORAGE_KEY = 'hr-dashboard-workspace-mode';

export const WORKSPACE_MODES = Object.freeze({
  normal: 'normal',
  minimal: 'minimal'
});

/** Where the minimalist workspace lives. A real route, so it survives a refresh. */
export const FOCUS_ROUTE = '/focus';

/**
 * How long the shell takes to reorganise. Inside the 350-500ms band the design
 * calls for: long enough to read as the sidebar retracting rather than the page
 * snapping, short enough not to be a wait.
 */
export const WORKSPACE_TRANSITION_MS = 420;

const VALID_MODES = Object.values(WORKSPACE_MODES);

export const readStoredWorkspaceMode = () => {
  try {
    const stored = window.localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY);
    return VALID_MODES.includes(stored) ? stored : WORKSPACE_MODES.normal;
  } catch {
    // Blocked storage — the session still works, the preference just will not last.
    return WORKSPACE_MODES.normal;
  }
};

export const WorkspaceModeProvider = ({ children }) => {
  const [mode, setModeState] = useState(() =>
    typeof window === 'undefined' ? WORKSPACE_MODES.normal : readStoredWorkspaceMode()
  );

  /*
   * True while the shell is mid-reorganisation.
   *
   * Consumers use it to run the entry animation once, rather than every time
   * they happen to re-render in minimal mode.
   */
  const [transitioning, setTransitioning] = useState(false);

  /*
   * Where the recruiter was when they entered focus, so Exit returns them there
   * instead of to a default page. Held in a ref: it is not rendered, and writing
   * it should never cost a render.
   */
  const returnPathRef = useRef(null);

  const prefersReducedMotion = usePrefersReducedMotion();
  const timerRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  const setMode = useCallback(
    (next) => {
      if (!VALID_MODES.includes(next)) return;

      setModeState((current) => {
        if (current === next) return current;

        try {
          window.localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, next);
        } catch {
          // Preference will not persist; the change still applies to this session.
        }

        // A reduced-motion user gets the resolved layout immediately — there is
        // no transition for them to be in the middle of.
        if (!prefersReducedMotion) {
          setTransitioning(true);
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => setTransitioning(false), WORKSPACE_TRANSITION_MS);
        }

        return next;
      });
    },
    [prefersReducedMotion]
  );

  const RETURN_PATH_STORAGE_KEY = 'hr-dashboard-workspace-return-path';

  const enterMinimal = useCallback(
    (returnPath) => {
      if (returnPath) {
        returnPathRef.current = returnPath;
        try {
          window.sessionStorage.setItem(RETURN_PATH_STORAGE_KEY, returnPath);
        } catch {}
      }
      setMode(WORKSPACE_MODES.minimal);
    },
    [setMode]
  );

  const exitMinimal = useCallback(() => {
    setMode(WORKSPACE_MODES.normal);
    let target = returnPathRef.current;
    if (!target) {
      try {
        target = window.sessionStorage.getItem(RETURN_PATH_STORAGE_KEY);
      } catch {}
    }
    returnPathRef.current = null;
    try {
      window.sessionStorage.removeItem(RETURN_PATH_STORAGE_KEY);
    } catch {}
    return target;
  }, [setMode]);

  const toggleMode = useCallback(() => {
    setMode(mode === WORKSPACE_MODES.minimal ? WORKSPACE_MODES.normal : WORKSPACE_MODES.minimal);
  }, [mode, setMode]);

  const value = useMemo(
    () => ({
      mode,
      isMinimal: mode === WORKSPACE_MODES.minimal,
      transitioning,
      prefersReducedMotion,
      setMode,
      toggleMode,
      enterMinimal,
      exitMinimal
    }),
    [enterMinimal, exitMinimal, mode, prefersReducedMotion, setMode, toggleMode, transitioning]
  );

  return <WorkspaceModeContext.Provider value={value}>{children}</WorkspaceModeContext.Provider>;
};

/**
 * Reads the workspace mode.
 *
 * Degrades to "normal, and nothing happens when you toggle" without a provider,
 * matching how `useRecruitmentContext` behaves, so a component can be rendered
 * in isolation without standing up the whole provider tree.
 */
export const useWorkspaceMode = () => {
  const value = useContext(WorkspaceModeContext);
  if (value) return value;
  return {
    mode: WORKSPACE_MODES.normal,
    isMinimal: false,
    transitioning: false,
    prefersReducedMotion: false,
    setMode: () => {},
    toggleMode: () => {},
    enterMinimal: () => {},
    exitMinimal: () => null
  };
};

export default WorkspaceModeContext;
