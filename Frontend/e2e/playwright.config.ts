import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://localhost:3000';

function inheritedEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  return env;
}

export default defineConfig({
  testDir: './tests',
  outputDir: '../.playwright-artifacts',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../.playwright-report' }],
  ],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'zh-TW',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],
  webServer: {
    command: 'pnpm dev:demo',
    cwd: '..',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...inheritedEnv(),
      NEXTAUTH_URL: 'http://localhost:3000',
      NEXTAUTH_SECRET: 'e2e-not-a-secret',
      AUTH_SECRET: 'e2e-not-a-secret',
      NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:9',
      API_BASE_URL: 'http://127.0.0.1:9',
      GRAPHQL_URL: 'http://127.0.0.1:9/graphql',
      NEXT_PUBLIC_GRAPHQL_URL: 'http://127.0.0.1:9/graphql',
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'e2e-fake',
      GOOGLE_MAPS_API_KEY: 'e2e-fake',
    },
  },
});
