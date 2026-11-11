/** @type {import('tailwindcss').Config} */
// Balon design tokens (shared look with the admin app). `gray` and `teal`
// are overridden so existing utility classes pick up the brand palette.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Geist', 'system-ui', 'sans-serif'],
        serif: ['"Bricolage Grotesque"', 'Geist', 'system-ui', 'sans-serif'],
      },
      colors: {
        app: '#f2f4f6',
        gray: {
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
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 19, 24, 0.04), 0 1px 3px rgba(15, 19, 24, 0.05)',
        lift: '0 10px 30px -12px rgba(15, 19, 24, 0.18)',
        glow: '0 12px 28px -10px rgba(12, 148, 73, 0.55)',
        nav: '0 -1px 0 rgba(15,19,24,0.04), 0 12px 40px -8px rgba(15, 19, 24, 0.25)',
        sheet: '0 -12px 40px -12px rgba(15, 19, 24, 0.25)',
        device: '0 0 0 1px rgba(15,19,24,0.06), 0 30px 80px -30px rgba(15, 19, 24, 0.35)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        pop: {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '70%': { transform: 'scale(1.06)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'sheet-up': 'sheet-up 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'fade-in': 'fade-in 200ms ease-out',
        pop: 'pop 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
      },
    },
  },
  plugins: [],
}
