import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

export const THEME_STORAGE_KEY = 'hr-dashboard-theme';
const VALID_THEMES = ['light', 'dark', 'system'];

/** Reads the stored preference, falling back to "system". */
export const readStoredTheme = () => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return VALID_THEMES.includes(stored) ? stored : 'system';
  } catch {
    // Private browsing or blocked storage — fall back rather than throwing.
    return 'system';
  }
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Applies the resolved theme to the document root.
 *
 * A single class on <html> is what the whole palette keys off, so no component
 * needs to know which theme is active. `color-scheme` is set too, which is what
 * makes native form controls, scrollbars and autofill render appropriately.
 */
export const applyTheme = (resolved) => {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
};

/**
 * Theme state: the user's choice (light | dark | system) and what that resolves
 * to right now (light | dark).
 *
 * Choosing "system" keeps following the operating system, including changes made
 * while the app is open.
 */
export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => (typeof window === 'undefined' ? 'system' : readStoredTheme()));
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark());

  // Track the OS preference so "system" stays live.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => setSystemDark(event.matches);

    // addEventListener is not available on MediaQueryList in older Safari.
    if (query.addEventListener) query.addEventListener('change', onChange);
    else query.addListener(onChange);

    return () => {
      if (query.removeEventListener) query.removeEventListener('change', onChange);
      else query.removeListener(onChange);
    };
  }, []);

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next) => {
    if (!VALID_THEMES.includes(next)) return;
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference simply will not persist; the session still respects it.
    }
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, isDark: resolvedTheme === 'dark' }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider.');
  return context;
};
