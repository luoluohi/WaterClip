import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';

export default defineConfig({
  plugins: [react(), alphaTab()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4174' }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  }
});
