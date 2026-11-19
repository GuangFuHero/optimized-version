import { defineConfig, devices } from '@playwright/test';

const SITE_URL = process.env.SITE_APP_URL ?? 'http://localhost:3000';
const ADMIN_URL = process.env.ADMIN_APP_URL ?? 'http://localhost:3001';
const IS_TUTORIAL_MODE = process.env.RECORD_TUTORIAL === '1';

export default defineConfig({
  testDir: '.',
  globalSetup: require.resolve('./global-setup'),
  timeout: IS_TUTORIAL_MODE ? 120_000 : 60_000,
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
    video: IS_TUTORIAL_MODE
      ? {
          mode: 'on',
          size: { width: 1280, height: 720 },
        }
      : 'retain-on-failure',
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
