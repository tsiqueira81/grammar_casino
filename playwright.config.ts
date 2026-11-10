import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests (package F3). They run against the dev server with `?e2e=1`,
 * which serves six fixed sentences and skips every AI call.
 * Rooms use the dev server's local relay; Firestore points at an emulator
 * address that is not running, so tests never touch the real database.
 */
const PORT = 3000;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'host',
      testMatch: /local-game\.spec\.ts|room-game\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
  ],
  webServer: {
    command: 'npx tsx server.ts',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_FIREBASE_EMULATORS: '1',
    },
  },
});
