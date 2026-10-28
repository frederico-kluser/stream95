import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER = process.env.STREAM95_SERVER ?? 'http://127.0.0.1:1995';

// The deck is served by the local server under /dock/ (the OBS dock and phones open that URL).
// In development it runs on Vite (5174) and reaches the server through this proxy.
export default defineConfig({
  base: '/dock/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: SERVER, changeOrigin: false },
      '/ws': { target: SERVER.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
});
