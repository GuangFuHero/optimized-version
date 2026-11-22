import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'leaflet',
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['test/**/*.spec.ts'],
    environment: 'jsdom',
  },
});
