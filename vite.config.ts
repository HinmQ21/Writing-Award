import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { scoringApi } from './server/vite-scoring';

export default defineConfig(({ mode }) => ({
  plugins: [react(), scoringApi({ ...loadEnv(mode, process.cwd(), ''), ...process.env })],
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
}));
