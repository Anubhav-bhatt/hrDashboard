/**
 * Theme strategy
 * --------------
 * Colours resolve through CSS custom properties rather than fixed hex values,
 * and `src/index.css` redefines those properties under `.dark`. That means a
 * class like `bg-white` or `text-slate-700` is already theme-aware: the token it
 * points at changes, so no component carries a parallel set of `dark:` classes.
 *
 * In dark mode the neutral ramp is inverted — `slate-50` becomes the darkest
 * surface and `slate-900` the lightest text — which is why the app's existing
 * "light surface, dark text" markup reads correctly in both themes.
 *
 * `<alpha-value>` is required for opacity modifiers (`bg-white/60`) to keep
 * working against a variable-based colour.
 */
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

/** Builds a ramp whose every step reads from a CSS variable. */
const ramp = (name, steps) =>
  steps.reduce((acc, step) => {
    acc[step] = withAlpha(`--c-${name}-${step}`);
    return acc;
  }, {});

const NEUTRAL_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces and neutrals. `white` is a surface token, not literal white,
        // so cards become an elevated dark surface rather than glowing.
        white: withAlpha('--c-white'),
        slate: ramp('slate', NEUTRAL_STEPS),

        // Brand and semantic accents, tuned per theme so a -50 tint becomes a
        // dark wash instead of a bright block.
        brand: ramp('brand', ACCENT_STEPS),
        emerald: ramp('emerald', ACCENT_STEPS),
        amber: ramp('amber', ACCENT_STEPS),
        rose: ramp('rose', ACCENT_STEPS),
        violet: ramp('violet', ACCENT_STEPS),
        sky: ramp('sky', ACCENT_STEPS),
        teal: ramp('teal', ACCENT_STEPS),

        // Fixed colours for surfaces that must stay dark in both themes, such as
        // the sign-in brand panel. These deliberately do NOT invert, so they also
        // carry their own foreground steps for text placed on them.
        ink: {
          900: '#0b1220', // panel background
          800: '#131c2b',
          700: '#1c2537',
          400: '#7c8798', // muted text on ink
          300: '#aab4c4', // secondary text on ink
          100: '#e6eaf1' // primary text on ink
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      fontSize: {
        // Typography scale — every screen picks from these instead of ad-hoc sizes.
        display: ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        'page-title': ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em', fontWeight: '700' }],
        section: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em', fontWeight: '600' }],
        'card-title': ['0.9375rem', { lineHeight: '1.375rem', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.375rem' }],
        meta: ['0.8125rem', { lineHeight: '1.25rem' }],
        label: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.02em', fontWeight: '600' }],
        metric: ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.025em', fontWeight: '700' }]
      },
      spacing: {
        // 4px-based scale used throughout the app.
        1: '0.25rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
        15: '3.75rem',
        18: '4.5rem',
        // Sidebar rail widths live on the spacing scale, not `width`, so both
        // `w-sidebar` and `pl-sidebar` are generated — the content wrapper needs
        // the padding variant to clear the fixed rail.
        sidebar: '15rem',
        'sidebar-collapsed': '4.25rem'
      },
      borderRadius: {
        card: '0.75rem',
        control: '0.5rem',
        pill: '9999px'
      },
      boxShadow: {
        // Restrained elevation set: resting, hover, and overlay.
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 4px 8px -2px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.06)',
        overlay: '0 12px 32px -8px rgb(15 23 42 / 0.18), 0 4px 12px -4px rgb(15 23 42 / 0.10)',
        focus: '0 0 0 3px rgb(2 112 196 / 0.20)',
        // Dark theme needs deeper, more diffuse shadows to read at all.
        'card-dark': '0 1px 2px 0 rgb(0 0 0 / 0.5), 0 1px 3px 0 rgb(0 0 0 / 0.4)',
        'card-hover-dark': '0 6px 14px -4px rgb(0 0 0 / 0.6), 0 2px 6px -2px rgb(0 0 0 / 0.5)',
        'overlay-dark': '0 16px 40px -10px rgb(0 0 0 / 0.7), 0 6px 16px -6px rgb(0 0 0 / 0.5)'
      },
      transitionDuration: {
        // Micro-interactions stay in the 150-250ms band.
        fast: '150ms',
        DEFAULT: '180ms',
        slow: '250ms'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 150ms cubic-bezier(0.16, 1, 0.3, 1)'
      }
    }
  },
  plugins: []
};
