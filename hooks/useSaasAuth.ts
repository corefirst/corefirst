'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  readSession,
  writeSession,
  clearSession,
  type SaasSession,
  type SaasUser,
} from '@/src/lib/saas/storage';
import {
  saasLogin,
  saasRegister,
  saasLogout,
  fetchCurrentUser,
} from '@/src/lib/saas/auth';

export function useSaasAuth() {
  const [session, setSession] = useState<SaasSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSession(readSession());
    setLoading(false);

    const onChange = () => setSession(readSession());
    window.addEventListener('cf:saas-session-changed', onChange);
    window.addEventListener('storage', onChange);

    // Electron path: the OAuth deep-link (corefirst://oauth/callback#tokens)
    // is delivered via IPC by the main process, regardless of which route
    // the renderer happens to be on. We persist tokens here so the user is
    // logged in immediately wherever they were when they clicked the button.
    const unsubDeepLink = window.__corefirstElectron?.onOAuthCallback((deepLinkUrl) => {
      try {
        const hashStr = (deepLinkUrl.includes('#')
          ? deepLinkUrl.slice(deepLinkUrl.indexOf('#') + 1)
          : '');
        const params = new URLSearchParams(hashStr);
        const error = params.get('error');
        if (error) {
          console.warn('[oauth] callback error:', error);
          return;
        }
        if (params.get('linked')) {
          window.dispatchEvent(new Event('cf:saas-session-changed'));
          return;
        }
        const accessToken  = params.get('accessToken');
        const refreshToken = params.get('refreshToken');
        const userId       = params.get('userId');
        if (accessToken && refreshToken && userId) {
          writeSession({ accessToken, refreshToken, user: { id: userId, email: '' } });
          fetchCurrentUser().catch(() => {});
        }
      } catch (e) {
        console.error('[oauth] failed to handle deep link:', e);
      }
    });

    return () => {
      window.removeEventListener('cf:saas-session-changed', onChange);
      window.removeEventListener('storage', onChange);
      unsubDeepLink?.();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const s = await saasLogin(email, password);
    setSession(s);
    return s;
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const s = await saasRegister(email, password, name);
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(async (opts?: { everywhere?: boolean }) => {
    // saasLogout always clears local state via clearSession() in its finally
    // block, so the UI flips logged-out immediately even if the network call
    // hasn't returned yet. We await mostly so callers can show a spinner.
    await saasLogout(opts);
    setSession(null);
  }, []);

  const refresh = useCallback(async () => {
    const user = await fetchCurrentUser();
    if (user) {
      const current = readSession();
      if (current) {
        const next = { ...current, user };
        writeSession(next);
        setSession(next);
      }
    } else if (!readSession()) {
      setSession(null);
    }
    return user;
  }, []);

  return {
    session,
    user: session?.user as SaasUser | undefined,
    loggedIn: !!session,
    loading,
    login,
    register,
    logout,
    refresh,
  };
}

/** Helper for non-React contexts that need to know if SaaS auth is active. */
export function isSaasLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return !!readSession();
}

export { clearSession };
