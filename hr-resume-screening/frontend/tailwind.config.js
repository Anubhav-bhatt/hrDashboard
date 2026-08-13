/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Complete brand ramp. The previous config defined only 50/100/500-900,
        // so utilities such as border-brand-200 and text-brand-400 were used in
        // markup but generated no CSS.
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7dc8fb',
          400: '#38aaf5',
          500: '#0e8ce6',
          600: '#0270c4',
          700: '#02599e',
          800: '#064b82',
          900: '#0b3f6c',
          950: '#072847'
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
        'display': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        'page-title': ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em', fontWeight: '700' }],
        'section': ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em', fontWeight: '600' }],
        'card-title': ['0.9375rem', { lineHeight: '1.375rem', fontWeight: '600' }],
        'body': ['0.875rem', { lineHeight: '1.375rem' }],
        'meta': ['0.8125rem', { lineHeight: '1.25rem' }],
        'label': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.02em', fontWeight: '600' }],
        'metric': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.025em', fontWeight: '700' }]
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
        18: '4.5rem'
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
        focus: '0 0 0 3px rgb(2 112 196 / 0.20)'
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
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.16, 1, 0.3, 1)'
      }
    }
  },
  plugins: []
};
