/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Electron (127.0.0.1) to access the Next.js dev server.
  // Without this, Next.js 16 treats 127.0.0.1 → localhost as cross-origin
  // and blocks HMR and some API requests.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  // Produce a self-contained server bundle under `.next/standalone/`.
  // Required for the Docker image — see Dockerfile.
  output: 'standalone',

  // Prompt markdown files are loaded at runtime via fs.readFileSync
  // (see src/lib/prompts/loader.ts). Next's tracer can't follow dynamic
  // paths, so list each route's prompt files explicitly here.
  outputFileTracingIncludes: {
    '/api/transform': ['./src/core/system_prompt.md'],
    '/api/generate-course': [
      './src/core/system_prompt.md',
      './src/generator/courseware_prompt.md',
      './src/generator/repair-instruction.md',
    ],
    '/api/roleplay': [
      './src/prompts/roleplay_base.md',
      './src/prompts/roleplay_analysis.md',
    ],
    '/api/admin/repair-cflt': ['./src/core/system_prompt.md'],
    '/api/speech-eval': ['./src/prompts/speech-eval.md', './src/prompts/speech-eval-user.md'],
    '/api/transform/refine': ['./src/prompts/refine.md', './src/prompts/refine-user.md'],
  },

  // Exclude build artifacts and dev-only directories from the standalone trace.
  // Without this, NFT over-traces src/lib/skills/store.ts (dynamic fs reads)
  // and pulls the entire project root—including release/ and electron-out/—
  // into .next/standalone/, which breaks electron-builder signing.
  outputFileTracingExcludes: {
    '**': [
      './release/**',
      './electron-out/**',
      './.next/**',
      './node_modules/.cache/**',
      './docs/**',
      './tests/**',
      './*.md',
      './Dockerfile',
      './docker-compose.yml',
      './data.tgz',
    ],
  },

  // FIX: Instruct Next.js not to bundle packages containing native modules.
  serverExternalPackages: [
    'pouchdb',
    'pouchdb-node',
    'pouchdb-adapter-leveldb',
    'leveldown',
    'classic-level'
  ],
};

export default nextConfig;
