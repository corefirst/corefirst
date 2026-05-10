import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    // E2E tests under tests/e2e/ require a running local AI stack
    // (Kokoro + faster-whisper). They are excluded from the default
    // `pnpm test` run to keep the suite hermetic. Run them with
    // `pnpm test:e2e`.
    exclude: ['**/node_modules/**', 'dist/**', 'tests/e2e/**'],
  },
});
