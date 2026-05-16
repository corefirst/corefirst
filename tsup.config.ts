import { defineConfig } from 'tsup';
import * as path from 'path';

export default defineConfig([
  // CLI binary
  {
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
  },
  // Electron main + preload
  {
    entry: {
      main: 'electron/main.ts',
      preload: 'electron/preload.ts',
    },
    outDir: 'electron',
    format: ['cjs'],
    target: 'node20',
    shims: true,
    external: ['electron'],
    esbuildOptions(options) {
      options.alias = { '@': path.resolve(__dirname) };
    },
  },
]);
