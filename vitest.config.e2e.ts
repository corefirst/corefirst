import { defineConfig } from 'vitest/config';
import path from 'node:path';

// E2E config — used by `pnpm test:e2e` to run tests under tests/e2e/
// against the real local stack (Kokoro on 8880, faster-whisper on 8000).
//
// Default `pnpm test` uses vitest.config.ts which excludes tests/e2e/.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    // First TTS / STT call may load a 3 GB Whisper model into memory; subsequent
    // calls are much faster. beforeAll warmup absorbs the cold-start cost.
    testTimeout: 60_000,
    hookTimeout: 300_000,
    isolate: true,
  },
});
