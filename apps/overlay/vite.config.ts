import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const SERVER = process.env.STREAM95_SERVER ?? 'http://127.0.0.1:1995';

/**
 * @react95/icons ships no `sideEffects` field, so any barrel import (including the
 * ones inside @react95/core's TaskBar/Alert/Tree/Video) drags all 1131 icons into
 * the bundle. Marking its modules side-effect free lets tree-shaking drop the rest.
 */
const react95IconsSideEffectFree = (): Plugin => ({
  name: 'react95-icons-side-effect-free',
  transform(code, id) {
    if (/[\\/]@react95[\\/]icons[\\/]/.test(id)) return { code, map: null, moduleSideEffects: false };
    return null;
  },
});

// In development the overlay runs on Vite (5173) and talks to the local server
// through this proxy; in production the server itself serves the built files.
export default defineConfig({
  plugins: [react(), react95IconsSideEffectFree()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: SERVER, changeOrigin: false },
      '/ws': { target: SERVER.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // Clippy agents (sprite sheets as data URIs) are big lazy chunks loaded only for the chosen agent.
    chunkSizeWarningLimit: 3000,
  },
});
