import { defineConfig } from 'vitest/config';

/**
 * Node-environment tests for the data-access lib (first use: the admin query client's error
 * reporting). Same shape as `libs/ui/vitest.config.ts`.
 */
export default defineConfig({
  test: {
    name: 'data-access',
    root: __dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
