'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  readSession,
  writeSession,
  type CloudSession,
  type CloudUser,
} from '@/src/lib/cloud/storage';
import {
  cloudLogin,
  cloudRegister,
  cloudLogout,
  fetchCurrentUser,
} from '@/src/lib/cloud/auth';

export function useCloudAuth() {
  const [session, setSession] = useState<CloudSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSession(readSession());
    setLoading(false);

    const onChange = () => setSession(readSession());
    window.addEventListener('cf:cloud-session-changed', onChange);
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
          window.dispatchEvent(new Event('cf:cloud-session-changed'));
          return;
        }
        const accessToken  = params.get('accessToken');
        const refreshToken = params.get('refreshToken');
        const userId       = params.get('userId');
        if (accessToken && refreshToken && userId) {
          // Write stub to prime refresh-token storage, then immediately fetch
          // the real user so the UI never renders with an empty email/tier.
          writeSession({ accessToken, refreshToken, user: { id: userId, email: '' } });
          fetchCurrentUser().then(() => {
            setSession(readSession());
          }).catch((e) => {
            console.warn('[oauth] could not fetch user after deep-link login:', e);
          });
        }
      } catch (e) {
        console.error('[oauth] failed to handle deep link:', e);
      }
    });

    return () => {
      window.removeEventListener('cf:cloud-session-changed', onChange);
      window.removeEventListener('storage', onChange);
      unsubDeepLink?.();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const s = await cloudLogin(email, password);
    setSession(s);
    return s;
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const s = await cloudRegister(email, password, name);
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(async (opts?: { everywhere?: boolean }) => {
    // cloudLogout always clears local state via clearSession() in its finally
    // block, so the UI flips logged-out immediately even if the network call
    // hasn't returned yet. We await mostly so callers can show a spinner.
    await cloudLogout(opts);
    setSession(null);
  }, []);

  const refresh = useCallback(async () => {
    // fetchCurrentUser() already calls writeSession internally; read back the
    // result rather than writing again to avoid clobbering a rotated token.
    const user = await fetchCurrentUser();
    if (user) {
      setSession(readSession());
    } else if (!readSession()) {
      setSession(null);
    }
    return user;
  }, []);

  return {
    session,
    user: session?.user as CloudUser | undefined,
    loggedIn: !!session,
    loading,
    login,
    register,
    logout,
    refresh,
  };
}

/** Helper for non-React contexts that need to know if cloud auth is active. */
export function isCloudLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return !!readSession();
}
