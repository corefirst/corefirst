// Pure normalization — no Node.js deps, safe in browser and Edge Runtime.
// Logic mirrors normalizeUserId() in paths.ts (server-side canonical source).
export function normalizeUsername(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return cleaned || 'local';
}
