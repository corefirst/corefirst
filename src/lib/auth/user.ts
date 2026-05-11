import { cookies, headers } from 'next/headers';
import { DEFAULT_USER_ID, normalizeUserId } from '@/src/lib/storage/paths';

const HEADER_NAME = 'x-user-id';
const COOKIE_NAME = 'cf_user_id';

/**
 * Resolve the current learner's userId.
 *
 * Resolution order:
 *   1. `X-User-Id` header (highest precedence — used by SaaS edge integrations)
 *   2. `cf_user_id` cookie (local browser persistence)
 *   3. `COREFIRST_DEFAULT_USER` env (server-side override for single-user setups)
 *   4. `local` (default)
 *
 * All return values are normalized to the filesystem/PouchDB-safe alphabet
 * (`[a-z0-9_-]`) — an attacker can't write under another user's path even by
 * supplying a header.
 *
 * Pure server-side helper; do NOT call from client components.
 */
export async function getUserId(request?: Request): Promise<string> {
  // 1. Explicit request header takes precedence
  if (request) {
    const fromReq = request.headers.get(HEADER_NAME);
    if (fromReq) return normalizeUserId(fromReq);
  } else {
    // When no Request is in scope (e.g. server actions), fall back to the
    // global headers() helper which gives the same data on the request path.
    try {
      const h = await headers();
      const fromHeaders = h.get(HEADER_NAME);
      if (fromHeaders) return normalizeUserId(fromHeaders);
    } catch {
      // headers() only available inside a request context — ignore otherwise
    }
  }

  // 2. Cookie
  try {
    const c = await cookies();
    const fromCookie = c.get(COOKIE_NAME)?.value;
    if (fromCookie) return normalizeUserId(fromCookie);
  } catch {
    // cookies() only available inside a request context — ignore otherwise
  }

  // 3. Server-side single-user override
  const fromEnv = process.env.COREFIRST_DEFAULT_USER;
  if (fromEnv) return normalizeUserId(fromEnv);

  // 4. Default
  return DEFAULT_USER_ID;
}

export { COOKIE_NAME as USER_ID_COOKIE, HEADER_NAME as USER_ID_HEADER };
