/**
 * Third-party identity bindings — list / start-link / unlink.
 *
 * The link flow is a TOP-LEVEL navigation (window.location.assign) so the
 * SaaS server can set HttpOnly cookies before redirecting to the provider.
 */
import { saasJson, getSaasBaseUrl } from './client';
import { getAccessToken } from './storage';

export type IdentityProvider = 'google' | 'github' | 'stripe' | string;

export interface BoundIdentity {
  provider: IdentityProvider;
  providerUid: string;
  createdAt: string;
  updatedAt: string;
}

export async function listMyIdentities(): Promise<BoundIdentity[]> {
  return saasJson<BoundIdentity[]>('/v1/users/me/identities');
}

export async function unlinkIdentity(provider: IdentityProvider): Promise<void> {
  await saasJson(`/v1/users/me/identities/${encodeURIComponent(provider)}`, { method: 'DELETE' });
}

/**
 * Detect Electron renderer via the preload-exposed `__corefirstDesktop`.
 * When true, OAuth flows must (a) open in the system browser and (b) come
 * back via the `corefirst://oauth/callback` custom protocol — Google rejects
 * embedded user agents and Electron's BrowserWindow counts as one.
 * Type augmentation lives in src/types/electron.d.ts.
 */
function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.__corefirstDesktop;
}

/** Get the appropriate returnTo for the current runtime. */
function defaultReturnTo(): string {
  if (typeof window === 'undefined') return '';
  if (isElectron()) return 'corefirst://oauth/callback';
  return `${window.location.origin}/oauth/callback`;
}

/** Open URL — system browser when Electron, top-level navigation when web. */
function openOAuthUrl(url: string): void {
  if (isElectron() && window.__corefirstElectron?.openExternal) {
    window.__corefirstElectron.openExternal(url);
    return;
  }
  window.location.assign(url);
}

/**
 * Begin OAuth LOGIN (or signup) flow — no prior session required.
 * Web: top-level redirect.  Electron: system browser + corefirst:// callback.
 */
export function beginOAuthLogin(provider: 'google' | 'github', returnTo?: string): void {
  const url = new URL(`${getSaasBaseUrl()}/v1/auth/oauth/${provider}/start`);
  url.searchParams.set('returnTo', returnTo ?? defaultReturnTo());
  openOAuthUrl(url.toString());
}

/**
 * Begin OAuth LINK flow — bind the resulting external account to the
 * currently-logged-in user.
 *
 * Two-step handshake so the long-lived JWT never lands in URL logs:
 *   1. POST /v1/auth/link-token (Authorization: Bearer <access>) →
 *      returns a 60-second single-use `linkToken`.
 *   2. Top-level redirect to /v1/auth/oauth/:p/link?ltoken=<...>&returnTo=...
 *      which the server consumes and seeds the link cookies before bouncing
 *      to the provider.
 */
export async function beginLinkExternalAccount(provider: 'google' | 'github', returnTo?: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('Must be logged in to link an external account');

  const { saasJson } = await import('./client');
  const { linkToken } = await saasJson<{ linkToken: string }>('/v1/auth/link-token', { method: 'POST' });

  const url = new URL(`${getSaasBaseUrl()}/v1/auth/oauth/${provider}/link`);
  url.searchParams.set('ltoken', linkToken);
  url.searchParams.set('returnTo', returnTo ?? defaultReturnTo());
  openOAuthUrl(url.toString());
}
