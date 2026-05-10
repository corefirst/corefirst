/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained server bundle under `.next/standalone/`.
  // Required for the Docker image — see Dockerfile.
  output: 'standalone',

  // src/core/transformer.ts and src/generator/orchestrator.ts read prompt
  // markdown at runtime via fs.readFileSync(process.cwd() + ...). Next's
  // tracer can't follow dynamic paths, so list them explicitly here.
  outputFileTracingIncludes: {
    '/api/transform': ['./src/core/system_prompt.md'],
    '/api/generate-course': [
      './src/core/system_prompt.md',
      './src/generator/courseware_prompt.md',
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
