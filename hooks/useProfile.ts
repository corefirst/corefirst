'use client';
import { useState, useEffect, useCallback } from 'react';

import { USER_ID_COOKIE } from '@/src/lib/constants';
import { normalizeUsername } from '@/src/lib/user-id';

const PROFILES_KEY = 'cf_profiles';
const COOKIE_NAME = USER_ID_COOKIE;

export interface Profile {
  id: string;
  name: string;
}

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find(r => r.startsWith(`${name}=`))
    ?.split('=')[1];
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  document.cookie = `${name}=${value}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
}

export function useProfile() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentId, setCurrentId] = useState<string>('');

  useEffect(() => {
    const cookieId = getCookie(COOKIE_NAME) ?? '';
    let parsed: Profile[] = [];
    try {
      const stored = localStorage.getItem(PROFILES_KEY);
      parsed = stored ? JSON.parse(stored) : [];
    } catch {}

    // Ensure the cookie user exists in the profile list
    if (cookieId && !parsed.find(p => p.id === cookieId)) {
      parsed = [{ id: cookieId, name: '' }, ...parsed];
      localStorage.setItem(PROFILES_KEY, JSON.stringify(parsed));
    }

    setProfiles(parsed);
    setCurrentId(cookieId);
  }, []);

  const saveProfiles = useCallback((updater: Profile[] | ((prev: Profile[]) => Profile[])) => {
    setProfiles(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem(PROFILES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const addProfile = useCallback((name: string): string => {
    const id = normalizeUsername(name || 'New User');
    saveProfiles(prev => [...prev, { id, name }]);
    return id;
  }, [saveProfiles]);

  const renameProfile = useCallback((id: string, name: string) => {
    saveProfiles(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  }, [saveProfiles]);

  const switchProfile = useCallback((id: string) => {
    setCookie(COOKIE_NAME, id, 365);
    window.location.reload();
  }, []);

  const currentProfile = profiles.find(p => p.id === currentId);

  return { profiles, currentId, currentProfile, addProfile, renameProfile, switchProfile };
}
