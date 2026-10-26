import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'data-access',
    root: __dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
