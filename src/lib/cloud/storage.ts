/**
 * Token persistence for the Cloud session.
 *
 * Works in all three client targets:
 *  - Web (browser) → localStorage
 *  - Electron renderer (PC) → localStorage (per-app, isolated)
 *  - PWA / mobile webview → localStorage
 *
 * On the server side (Next.js API routes) localStorage is absent; callers
 * there should accept the token as a request header instead.
 */

const ACCESS_KEY = 'cf_cloud_access_token';
const REFRESH_KEY = 'cf_cloud_refresh_token';
const USER_KEY = 'cf_cloud_user';

export interface CloudUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  tier?: 'FREE' | 'PRO' | 'CREATOR';
  credits?: number;
}

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  user: CloudUser;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readSession(): CloudSession | null {
  if (!isBrowser()) return null;
  try {
    const accessToken = localStorage.getItem(ACCESS_KEY);
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    const userRaw = localStorage.getItem(USER_KEY);
    if (!accessToken || !refreshToken || !userRaw) return null;
    const user = JSON.parse(userRaw);
    if (typeof user?.id !== 'string' || typeof user?.email !== 'string') {
      clearSession();
      return null;
    }
    return { accessToken, refreshToken, user };
  } catch {
    clearSession();
    return null;
  }
}

export function writeSession(session: CloudSession): void {
  if (!isBrowser()) return;
  localStorage.setItem(ACCESS_KEY, session.accessToken);
  localStorage.setItem(REFRESH_KEY, session.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  window.dispatchEvent(new Event('cf:cloud-session-changed'));
}

export function updateAccessToken(accessToken: string, refreshToken?: string): void {
  if (!isBrowser()) return;
  localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  window.dispatchEvent(new Event('cf:cloud-session-changed'));
}

export function clearSession(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('cf:cloud-session-changed'));
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(REFRESH_KEY);
}
