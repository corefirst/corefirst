/**
 * SaaS auth flows — login, register, logout, fetch current user.
 */
import { saasFetch, saasJson, SaasError } from './client';
import {
  writeSession,
  clearSession,
  readSession,
  getRefreshToken,
  type SaasSession,
  type SaasUser,
} from './storage';

export async function saasLogin(email: string, password: string): Promise<SaasSession> {
  const data = await saasJson<{ accessToken: string; refreshToken: string; user: SaasUser }>(
    '/v1/auth/login',
    { method: 'POST', body: { email, password }, skipAuth: true },
  );
  const session: SaasSession = data;
  writeSession(session);
  return session;
}

export async function saasRegister(
  email: string,
  password: string,
  name?: string,
): Promise<SaasSession> {
  const data = await saasJson<{ accessToken: string; refreshToken: string; user: SaasUser }>(
    '/v1/auth/register',
    { method: 'POST', body: { email, password, name }, skipAuth: true },
  );
  const session: SaasSession = data;
  writeSession(session);
  return session;
}

/**
 * Single-device logout. Revokes only this device's refresh token on the
 * server, then clears local session storage. Network failure is non-fatal —
 * the local clear still happens so the user is logged out client-side.
 *
 * Pass `{ everywhere: true }` to revoke all of the user's sessions (e.g.
 * "Sign out of all devices" button).
 */
export async function saasLogout(opts: { everywhere?: boolean } = {}): Promise<void> {
  try {
    const refreshToken = opts.everywhere ? undefined : (getRefreshToken() ?? undefined);
    await saasJson('/v1/auth/logout', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : {},
    });
  } catch {
    // Best-effort — even if the server call fails (offline, 401, etc.) we
    // still want to clear the local session so the user appears logged out.
  } finally {
    clearSession();
  }
}

export async function saasForgotPassword(email: string): Promise<void> {
  await saasJson('/v1/auth/forgot-password', {
    method: 'POST', body: { email }, skipAuth: true,
  });
}

export async function saasResetPassword(
  email: string,
  token: string,
  newPassword: string,
): Promise<void> {
  await saasJson('/v1/auth/reset-password', {
    method: 'POST', body: { email, token, newPassword }, skipAuth: true,
  });
}

/**
 * Fetch fresh user info from the server (credits, tier, etc).
 * Returns null if not logged in or the call fails.
 */
export async function fetchCurrentUser(): Promise<SaasUser | null> {
  const session = readSession();
  if (!session) return null;
  try {
    const user = await saasJson<SaasUser>('/v1/users/me');
    // Refresh cached user
    writeSession({ ...session, user });
    return user;
  } catch (e) {
    if (e instanceof SaasError && e.status === 401) clearSession();
    return null;
  }
}
