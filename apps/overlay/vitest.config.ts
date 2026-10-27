import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'overlay',
    environment: 'happy-dom',
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
    // React95 imports its compiled .css files from JS: let Vite process them instead of Node.
    server: { deps: { inline: [/@react95\//, /clippyjs/] } },
  },
});
