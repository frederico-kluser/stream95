import { defineConfig } from 'vitest/config';

// One root config so `npx vitest run` (used by CI) runs every workspace.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**', 'packages/*/src/**'],
      exclude: ['**/*.d.ts', '**/main.tsx', '**/index.ts'],
    },
  },
});
