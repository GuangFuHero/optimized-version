import { defineConfig, devices } from '@playwright/test';

const SITE_URL = process.env.SITE_APP_URL ?? 'http://localhost:3000';
const ADMIN_URL = process.env.ADMIN_APP_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: '.',
  globalSetup: require.resolve('./global-setup'),
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 720 },
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    video: {
      mode: 'on',
      size: { width: 1280, height: 720 },
    },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'site',
      testDir: './site',
      use: {
        baseURL: SITE_URL,
      },
    },
    {
      name: 'admin',
      testDir: './admin',
      use: {
        baseURL: ADMIN_URL,
      },
    },
  ],
});
