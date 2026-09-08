import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  server: {
    port: 5273,
    // Im Entwicklungsmodus laufen API und WebSocket auf dem Fastify-Server.
    proxy: {
      '/api': { target: 'http://localhost:8770', changeOrigin: true, ws: true },
    },
  },
});
