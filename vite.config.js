import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the client runs here and the race server runs on :8787 (see `npm run dev`).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
      '/api': 'http://localhost:8787',
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
