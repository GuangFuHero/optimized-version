import { defineConfig } from 'vitest/config';

/**
 * Node-environment tests for the modules lib's pure logic (first use: the guest location cells in
 * `src/map/location-cells.ts`). Same shape as `libs/ui/vitest.config.ts`: no jsdom and no React
 * plugin until a component test actually needs them.
 */
export default defineConfig({
  test: {
    name: 'modules',
    root: __dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
