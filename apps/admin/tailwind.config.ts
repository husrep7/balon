import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
      },
      fontSize: {
        // Slightly tighter than default for dense data UIs
        xs: ['0.75rem', { lineHeight: '1.1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.2rem' }],
        base: ['0.9375rem', { lineHeight: '1.4rem' }],
      },
      colors: {
        // Warm neutrals
        ink: {
          50:  '#f7f5ef',
          100: '#ece9df',
          200: '#dad6c8',
          300: '#bdb8a8',
          400: '#8e8a7f',
          500: '#6b6862',
          600: '#4a4843',
          700: '#2d2c28',
          800: '#1c1a16',
          900: '#0e0d0b',
        },
        surface: {
          DEFAULT: '#ffffff',
          alt: '#fafaf6',
          muted: '#f4f1e9',
        },
        // Teal accent (single primary color)
        teal: {
          50:  '#e9f4f0',
          100: '#c5e3d9',
          300: '#69b8a0',
          500: '#1d9e75',
          600: '#0b6e56',
          700: '#0a5a47',
          800: '#06402f',
        },
        // Status colors (booking states)
        paid:    { bg: '#e1f5ee', fg: '#085041' },
        unpaid:  { bg: '#faeeda', fg: '#633806' },
        noshow:  { bg: '#fcebeb', fg: '#791f1f' },
        info:    { bg: '#e6f1fb', fg: '#0c447c' },
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
      },
      boxShadow: {
        focus: '0 0 0 3px rgba(11, 110, 86, 0.18)',
      },
    },
  },
  plugins: [],
} satisfies Config
