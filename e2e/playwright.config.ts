import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright config for PropFlow E2E tests.
 * Prerequisites: backend on :4000, frontend on :3000, DB seeded (npm run db:seed in backend/).
 *
 * When CI env var is absent, webServer auto-starts both servers.
 * Auth sessions are cached per role in e2e/.auth/{role}.json (gitignored).
 */

const BASE_URL = 'http://localhost:3000';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // ── Setup: create one auth session per role ──────────────────────
    { name: 'setup-manager', testMatch: /setup\/manager\.setup\.ts/ },
    { name: 'setup-tenant',  testMatch: /setup\/tenant\.setup\.ts/ },
    { name: 'setup-owner',   testMatch: /setup\/owner\.setup\.ts/ },
    { name: 'setup-vendor',  testMatch: /setup\/vendor\.setup\.ts/ },

    // ── Test runs (each depends on its setup) ────────────────────────
    {
      name: 'manager',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, '.auth', 'manager.json'),
      },
      dependencies: ['setup-manager'],
      testMatch: /tests\/manager\.spec\.ts/,
    },
    {
      name: 'tenant',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, '.auth', 'tenant.json'),
      },
      dependencies: ['setup-tenant'],
      testMatch: /tests\/tenant\.spec\.ts/,
    },
    {
      name: 'owner',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, '.auth', 'owner.json'),
      },
      dependencies: ['setup-owner'],
      testMatch: /tests\/owner\.spec\.ts/,
    },
    {
      name: 'vendor',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, '.auth', 'vendor.json'),
      },
      dependencies: ['setup-vendor'],
      testMatch: /tests\/vendor\.spec\.ts/,
    },
  ],

  // Auto-start servers when not in CI
  ...(process.env.CI
    ? {}
    : {
        webServer: [
          {
            command: 'cd ../backend && npm run dev',
            url: 'http://localhost:4000/api/v1/auth/me',
            reuseExistingServer: true,
            timeout: 30_000,
          },
          {
            command:
              'cd ../frontend && "C:\\Program Files\\nodejs\\node.exe" node_modules/vite/bin/vite.js --port 3000 --host',
            url: BASE_URL,
            reuseExistingServer: true,
            timeout: 30_000,
          },
        ],
      }),
});