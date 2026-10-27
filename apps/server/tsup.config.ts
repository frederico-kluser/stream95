import { defineConfig } from 'tsup';

// One ESM bundle for production (`npm start`). The workspace package
// @stream95/shared is inlined; real npm dependencies stay external.
export default defineConfig({
  entry: { index: 'src/index.ts', 'twitch-login': 'src/twitch/login-cli.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  noExternal: ['@stream95/shared'],
});
