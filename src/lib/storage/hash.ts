import { createHash } from 'crypto';

/**
 * Generates a SHA-256 hash of the given text, truncated to 16 characters for
 * manageable filenames while maintaining extremely low collision probability
 * for course-scale media pools.
 */
export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
