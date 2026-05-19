/**
 * Thin HTTP client for the CoreFirst Cloud API (`corefirst-world`).
 *
 * Responsibilities:
 *   - Resolve the base URL (env-driven, with sane localhost default).
 *   - Attach the bearer access token on every request.
 *   - Transparently refresh the token on a single 401, then retry once.
 *
 * Browser-only — relies on localStorage via ./storage. Server-side Next.js
 * routes that forward client headers do not need this; they should call
 * fetch() directly with the Authorization header coming from the client.
 */
import {
  getAccessToken,
  getRefreshToken,
  updateAccessToken,
  clearSession,
} from './storage';

export function getCloudBaseUrl(): string {
  // NEXT_PUBLIC_* is the only way to reach the browser bundle in Next.js.
  const fromEnv =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_COREFIRST_SERVER_URL) ||
    '';
  return (fromEnv || 'http://localhost:4000').replace(/\/$/, '');
}

export class CloudError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequestOpts extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** When true, do not attempt token refresh / 401 recovery (used by refresh itself). */
  skipAuth?: boolean;
}

// In-flight refresh dedup: when multiple requests 401 concurrently they must
// share a single refresh exchange. The server rotates refresh tokens on every
// call, so racing refreshes would invalidate each other and log the user out.
let pendingRefresh: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${getCloudBaseUrl()}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        console.warn('[cloud/auth] Token refresh failed (status=%d); clearing session.', res.status);
        clearSession();
        return null;
      }
      const data = await res.json();
      const newAccess = typeof data?.accessToken === 'string' ? data.accessToken : null;
      if (!newAccess) {
        console.warn('[cloud/auth] Refresh response missing accessToken; clearing session.');
        clearSession();
        return null;
      }
      const newRefresh = typeof data?.refreshToken === 'string' ? data.refreshToken : undefined;
      updateAccessToken(newAccess, newRefresh);
      return newAccess;
    } catch {
      return null;
    } finally {
      // Clear after the microtask so awaiters resolved with the same value all see it.
      queueMicrotask(() => { pendingRefresh = null; });
    }
  })();
  return pendingRefresh;
}

export async function cloudFetch(path: string, opts: RequestOpts = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${getCloudBaseUrl()}${path}`;
  const { body: rawBody, skipAuth: _skipAuth, ...rest } = opts;
  const init: RequestInit = {
    ...rest,
    headers: { ...(opts.headers || {}) },
  };

  if (rawBody !== undefined && !(rawBody instanceof FormData)) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
  } else if (rawBody instanceof FormData) {
    init.body = rawBody;
  }

  let token = getAccessToken();
  if (!opts.skipAuth && token) {
    (init.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  let res = await fetch(url, init);

  if (res.status === 401 && !opts.skipAuth && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      (init.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
      res = await fetch(url, init);
    }
  }

  return res;
}

export async function cloudJson<T = any>(path: string, opts: RequestOpts = {}): Promise<T> {
  const res = await cloudFetch(path, opts);
  let body: any = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const message = body?.error || `Request failed: ${res.status}`;
    throw new CloudError(res.status, message, body?.code);
  }
  return body as T;
}
