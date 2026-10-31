/** Tailwind is built at build time (Vite runs PostCSS), not in the browser.
 *  Same Tailwind version as the old browser script (3.4.17) and the same
 *  class-based dark mode, so existing class names render the same way.
 *  Class names must appear in full in these files: Tailwind cannot see a
 *  class assembled from pieces at runtime, such as `bg-${colour}-500`. */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './constants.ts',
    './types.ts',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Design tokens: the values live in index.css (one set per theme), so a
      // class such as bg-gc-card follows the light/dark switch by itself.
      colors: {
        gc: {
          bg: 'rgb(var(--gc-bg) / <alpha-value>)',
          card: 'rgb(var(--gc-card) / <alpha-value>)',
          raised: 'rgb(var(--gc-raised) / <alpha-value>)',
          ink: 'rgb(var(--gc-ink) / <alpha-value>)',
          quiet: 'rgb(var(--gc-quiet) / <alpha-value>)',
          line: 'rgb(var(--gc-line) / <alpha-value>)',
          gold: 'rgb(var(--gc-gold) / <alpha-value>)',
          'on-gold': 'rgb(var(--gc-on-gold) / <alpha-value>)',
          money: 'rgb(var(--gc-money) / <alpha-value>)',
          win: 'rgb(var(--gc-win) / <alpha-value>)',
          loss: 'rgb(var(--gc-loss) / <alpha-value>)',
          info: 'rgb(var(--gc-info) / <alpha-value>)',
          turn: 'rgb(var(--gc-turn) / <alpha-value>)',
          danger: 'rgb(var(--gc-danger) / <alpha-value>)',
        },
      },
      backgroundImage: {
        'gc-felt': 'var(--gc-felt)',
      },
      borderRadius: {
        'gc-sm': 'var(--gc-radius-sm)',
        gc: 'var(--gc-radius)',
        'gc-lg': 'var(--gc-radius-lg)',
      },
      boxShadow: {
        'gc-1': 'var(--gc-shadow-1)',
        'gc-2': 'var(--gc-shadow-2)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Noto Color Emoji"'],
        sentence: ['"Playfair Display Variable"', '"Playfair Display"', 'Georgia', 'serif'],
        logo: ['"Cinzel Variable"', 'Cinzel', 'Georgia', 'serif'],
      },
      // Motion for the table (style A). Each one is short; devices that ask for
      // less motion skip them (see the prefers-reduced-motion rule in index.css).
      keyframes: {
        'gc-deal': {
          from: { opacity: '0', transform: 'translateY(-18px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
        'gc-slide-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'gc-fade': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'gc-pop': {
          '0%': { transform: 'scale(0.7)' },
          '60%': { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)' },
        },
        'gc-pulse': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)' },
        },
        'gc-breathe': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.035)' },
        },
        'gc-stamp': {
          '0%': { opacity: '0', transform: 'scale(2.2) rotate(-16deg)' },
          '65%': { opacity: '1', transform: 'scale(0.94) rotate(-8deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(-8deg)' },
        },
        'gc-blink': {
          '0%, 100%': { opacity: '0.25' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'gc-deal': 'gc-deal 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'gc-slide-up': 'gc-slide-up 0.4s ease both',
        'gc-fade': 'gc-fade 0.5s ease both',
        'gc-pop': 'gc-pop 0.4s ease both',
        'gc-pulse': 'gc-pulse 0.3s ease-out',
        'gc-breathe': 'gc-breathe 2.2s ease-in-out infinite',
        'gc-stamp': 'gc-stamp 0.55s 0.15s cubic-bezier(0.2, 0.9, 0.3, 1.3) both',
        'gc-blink': 'gc-blink 1.2s ease-in-out infinite both',
      },
      // Seven text steps. Nothing smaller than 12 px on the projector or 14 px on phones.
      fontSize: {
        'gc-cap': ['12px', { lineHeight: '16px' }],
        'gc-small': ['14px', { lineHeight: '20px' }],
        'gc-body': ['16px', { lineHeight: '24px' }],
        'gc-lead': ['20px', { lineHeight: '28px' }],
        'gc-title': ['24px', { lineHeight: '32px' }],
        'gc-display': ['32px', { lineHeight: '40px' }],
        'gc-sentence': ['clamp(2.875rem, 2.1rem + 1.6vw, 4rem)', { lineHeight: '1.18' }],
      },
    },
  },
  plugins: [],
};
