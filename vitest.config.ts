import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['server/test/**/*.test.ts', 'client/test/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['server/src/**', 'client/src/**', 'shared/**'],
      reporter: ['text-summary'],
    },
  },
});
