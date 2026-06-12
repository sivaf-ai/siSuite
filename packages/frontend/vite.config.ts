import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // risolve il workspace shared anche fuori dalla root del frontend
      '@sisuite/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    host: true, // 0.0.0.0 per Docker
    port: 5173,
    strictPort: true,
    watch: { usePolling: true }, // hot-reload affidabile su bind-mount Windows/Docker
  },
  // consente a Vite di leggere i sorgenti del package shared (fuori root)
  // (server.fs.allow di default copre la workspace root con pnpm)
});
