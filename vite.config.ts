import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build into ./docs (committed) for GitHub Pages.
// emptyOutDir is intentionally false to preserve docs/CNAME and any
// other manually-added files.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: false,
    sourcemap: false,
    target: 'es2022',
  },
});
