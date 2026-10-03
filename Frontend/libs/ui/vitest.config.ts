import { defineConfig } from 'vitest/config';

/**
 * Node-environment tests for the design tokens and the MUI bridge.
 *
 * No jsdom and no React plugin on purpose: everything under test here is plain data — hex strings,
 * numeric scales, font stacks. Adding a DOM would slow the suite down for nothing. When component
 * tests arrive they can add `environment: 'jsdom'` alongside, per file or via a second project.
 */
export default defineConfig({
  test: {
    name: 'ui',
    root: __dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
