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
    extend: {},
  },
  plugins: [],
};
