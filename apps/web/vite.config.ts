import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only proxy target; production build uses relative /api/v1 via nginx.
const proxyTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: false },
      '/health': { target: proxyTarget },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
