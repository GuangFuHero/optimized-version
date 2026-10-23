import { defineConfig } from 'vitest/config';

/**
 * Node-environment tests for the data-access lib's pure helpers (first use: the page collector in
 * `src/admin/collect-pages.ts`). Same shape as `libs/ui/vitest.config.ts`.
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
