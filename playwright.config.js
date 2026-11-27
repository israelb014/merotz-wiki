import { defineConfig, devices } from '@playwright/test';

// All tests run against mocks (tests/mocks): saved Wikipedia fixtures + a fake Supabase Realtime server.
// The only test that touches the real Wikipedia API is tests/live/wiki-live.spec.js (LIVE_WIKI=1).
const live = !!process.env.LIVE_WIKI;
export default defineConfig({
  testDir: './tests',
  testMatch: live ? /live\/.*\.spec\.js/ : /^(?!.*live\/).*\.spec\.js$/,
  testIgnore: process.env.MONKEY ? [] : [/monkey\.spec\.js/],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173/merotz-wiki/',
    locale: 'he-IL',
    trace: 'off',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    // live test only: let the browser use the environment's HTTPS proxy (if any) to reach Wikipedia
    ...(live && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}),
    // local sandbox: preinstalled Chromium (CI installs the matching browser instead)
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile-only/ },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'VITE_NO_HMR=1 npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173/merotz-wiki/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
