import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'src'),
  publicDir: path.resolve(__dirname, 'assets'),
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        overlay: path.resolve(__dirname, 'src/overlay/index.html'),
        settings: path.resolve(__dirname, 'src/settings/index.html'),
        card: path.resolve(__dirname, 'src/card/index.html'),
      },
    },
  },
});
