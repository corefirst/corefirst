import { cookies, headers } from 'next/headers';
import { DEFAULT_USER_ID, normalizeUserId } from '@/src/lib/storage/paths';

const HEADER_NAME = 'x-user-id';
const COOKIE_NAME = 'cf_user_id';

/**
 * Resolve the current learner's userId.
 *
 * Resolution order:
 *   1. `X-User-Id` header (reverse proxy / platform injection)
 *   2. `cf_user_id` cookie (always present — set by middleware on first visit)
 *
 * All return values are normalized to the filesystem/PouchDB-safe alphabet
 * (`[a-z0-9_-]`) preventing path-traversal attacks.
 *
 * Pure server-side helper; do NOT call from client components.
 */
export async function getUserId(request?: Request): Promise<string> {
  // 1. Platform-injected header (reverse proxy / cloud edge)
  if (request) {
    const fromReq = request.headers.get(HEADER_NAME);
    if (fromReq) return normalizeUserId(fromReq);
  } else {
    try {
      const h = await headers();
      const fromHeaders = h.get(HEADER_NAME);
      if (fromHeaders) return normalizeUserId(fromHeaders);
    } catch {
      // headers() only available inside a request context
    }
  }

  // 2. Cookie (middleware guarantees this is always set for browser clients)
  try {
    const c = await cookies();
    const fromCookie = c.get(COOKIE_NAME)?.value;
    if (fromCookie) return normalizeUserId(fromCookie);
  } catch {
    // cookies() only available inside a request context
  }

  return DEFAULT_USER_ID;
}

export { COOKIE_NAME as USER_ID_COOKIE, HEADER_NAME as USER_ID_HEADER };
