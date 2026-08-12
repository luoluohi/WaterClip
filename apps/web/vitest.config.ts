import { defineConfig } from 'vitest/config';

// Unit tests do not need alphaTab's runtime asset copier. Keeping this separate
// from Vite avoids racing a running dev server while it serves the SoundFont.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  }
});
