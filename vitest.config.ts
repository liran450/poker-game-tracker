import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const alias = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': alias('./src'),
      '@app': alias('./src/app'),
      '@core': alias('./src/core'),
      '@data': alias('./src/data'),
      '@features': alias('./src/features'),
      '@components': alias('./src/components'),
      '@i18n': alias('./src/i18n'),
      '@styles': alias('./src/styles'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
