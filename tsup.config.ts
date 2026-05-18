import { defineConfig } from 'tsup';
import * as path from 'path';

// Electron main/preload are compiled by `pnpm build:electron` (esbuild).
// Keep this config focused on the CLI binary only.
export default defineConfig({
  entry: ['src/cli/index.ts'],
  outDir: 'dist/cli',
  format: ['cjs'],
  target: 'node20',
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
  external: [
    'next',
    'electron',
    'pouchdb-adapter-leveldb',
    '@mapbox/node-pre-gyp',
    'leveldown',
  ],
  esbuildOptions(options) {
    options.alias = { '@': path.resolve(__dirname) };
  },
});
