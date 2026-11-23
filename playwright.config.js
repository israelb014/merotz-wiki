import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  globalSetup: './tests/global-setup.js',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173/merotz-wiki/',
    locale: 'he-IL',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173/merotz-wiki/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
