import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';

export default defineConfig({
  plugins: [react(), alphaTab()],
  // alphaTab's Vite plugin emits dedicated worker/worklet entry points. If the
  // package is pre-bundled, Vite rewrites those URLs into .vite/deps where the
  // emitted files do not exist (especially visible from non-ASCII paths).
  optimizeDeps: {
    noDiscovery: true,
    exclude: ['@coderline/alphatab'],
    include: [
      'react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'react/jsx-runtime',
      'dexie', 'exceljs', 'fflate', 'lucide-react', 'zustand'
    ]
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4174' }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  }
});
