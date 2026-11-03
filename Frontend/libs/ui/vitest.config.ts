import { defineConfig } from 'vitest/config';

/**
 * Node-environment tests for the design tokens, the MUI bridge and the components' markup.
 *
 * No jsdom and no React plugin on purpose: the tokens are plain data, and a component spec renders
 * to static HTML (`react-dom/server`) to check what it says to a screen reader. Anything that needs a
 * click or focus would need a DOM: add `environment: 'jsdom'` for that file when one does.
 */
export default defineConfig({
  test: {
    name: 'ui',
    root: __dirname,
    include: ['src/**/*.spec.{ts,tsx}'],
    environment: 'node',
    reporters: ['default'],
  },
});
