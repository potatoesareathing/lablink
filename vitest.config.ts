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
      // Bootstrap entry points and the WebGL-only scene cannot run under jsdom; the scene
      // is verified visually and by Lighthouse, entry points by the deployment health check.
      exclude: [
        'server/src/index.ts',
        'client/src/main.tsx',
        'client/src/components/CampusScene.tsx',
      ],
      reporter: ['text-summary'],
    },
  },
});
