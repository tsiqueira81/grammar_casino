import { defineConfig } from 'vitest/config';

// Unit tests live in tests/. The browser tests in e2e/ run with Playwright (npm run test:e2e).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
