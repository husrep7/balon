import type { Config } from 'tailwindcss'

// Balon design tokens — "sportski moderan".
// Neutrals are cool slate; the primary ("teal" key kept for backwards
// compatibility across pages) is a saturated pitch green.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
        display: ['"Bricolage Grotesque"', 'Geist', 'system-ui', 'sans-serif'],
        serif: ['"Bricolage Grotesque"', 'Geist', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.9375rem', { lineHeight: '1.45rem' }],
      },
      colors: {
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#dfe3e9',
          300: '#c3c9d2',
          400: '#8f97a4',
          500: '#687180',
          600: '#4b5361',
          700: '#323945',
          800: '#1d222b',
          900: '#0f1318',
          950: '#090c10',
        },
        surface: {
          DEFAULT: '#ffffff',
          alt: '#f6f7f9',
          muted: '#eef1f4',
        },
        teal: {
          50: '#effdf4',
          100: '#d9fbe6',
          200: '#b4f4cd',
          300: '#7de8aa',
          400: '#3fd27f',
          500: '#17b45f',
          600: '#0c9449',
          700: '#0d743d',
          800: '#105c34',
          900: '#0e4b2d',
        },
        lime: {
          300: '#d9f99d',
          400: '#c6f432',
          500: '#a8d61b',
        },
        paid: { bg: '#dcfce7', fg: '#166534' },
        unpaid: { bg: '#fef3c7', fg: '#92400e' },
        noshow: { bg: '#fee2e2', fg: '#991b1b' },
        info: { bg: '#e0f2fe', fg: '#075985' },
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        focus: '0 0 0 4px rgba(23, 180, 95, 0.18)',
        card: '0 1px 2px rgba(15, 19, 24, 0.04), 0 1px 3px rgba(15, 19, 24, 0.04)',
        lift: '0 4px 12px -2px rgba(15, 19, 24, 0.08), 0 2px 4px -2px rgba(15, 19, 24, 0.04)',
        pop: '0 24px 48px -12px rgba(15, 19, 24, 0.25)',
        glow: '0 8px 24px -6px rgba(12, 148, 73, 0.45)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'pop-in': 'pop-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
