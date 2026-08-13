import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { cx } from './ui';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor }
];

/**
 * Appearance control.
 *
 * A radio group rather than a toggle, because "System" is a distinct third state
 * — a two-way switch cannot express "follow the operating system". Rendered as a
 * segmented control inside the account menu.
 */
const ThemeSelector = ({ className }) => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div className={className}>
      <p className="text-label uppercase text-slate-500 px-1 mb-2">Appearance</p>

      <div
        role="radiogroup"
        aria-label="Colour theme"
        className="flex items-center gap-1 p-0.5 rounded-control bg-slate-100"
      >
        {OPTIONS.map((option) => {
          const selected = theme === option.value;
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(option.value)}
              className={cx(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-[0.375rem]',
                'text-xs font-semibold transition-colors duration-fast',
                selected
                  ? 'bg-white text-slate-900 shadow-card'
                  : 'text-slate-500 hover:text-slate-800'
              )}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>

      {theme === 'system' && (
        <p className="text-[11px] text-slate-500 mt-1.5 px-1">
          Following your device — currently {resolvedTheme}.
        </p>
      )}
    </div>
  );
};

/**
 * Compact icon-only theme cycle for the top bar. Shows the theme that clicking
 * will switch to, and names it for screen readers.
 */
export const ThemeToggleButton = ({ className }) => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  // light -> dark -> system -> light
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const Icon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={cx('btn btn-icon-sm btn-ghost', className)}
      aria-label={`Theme: ${theme}. Switch to ${next}.`}
      title={`Theme: ${theme} — switch to ${next}`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </button>
  );
};

export default ThemeSelector;
