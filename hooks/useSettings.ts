'use client';
import { useState, useEffect, useCallback } from 'react';
import { USER_ID_COOKIE, PROVIDER_DEFAULT_MODELS } from '@/src/lib/constants';

const COOKIE_NAME = USER_ID_COOKIE;

export interface UserSettings {
  global: { provider: string; apiKey: string; model: string };
  advanced: {
    text?:     { provider?: string; model?: string; apiKey?: string };
    tts?:      { provider?: string; baseUrl?: string; model?: string };
    stt?:      { provider?: string; baseUrl?: string };
    imageGen?: { provider?: string; apiKey?: string };
    ollama?:   { baseUrl?: string };
  };
}

const EMPTY_SETTINGS: UserSettings = {
  global: { provider: '', apiKey: '', model: '' },
  advanced: {},
};

function storageKey(userId: string): string {
  return `cf_settings_${userId}`;
}

function getCookieValue(name: string): string {
  if (typeof document === 'undefined') return '';
  return document.cookie.split('; ').find(r => r.startsWith(`${name}=`))?.split('=')[1] ?? '';
}

function maskKey(key: string): string {
  if (!key || key.length <= 8) return key ? '••••••••' : '';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(EMPTY_SETTINGS);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const uid = getCookieValue(COOKIE_NAME);
    setUserId(uid);
    if (!uid) return;
    try {
      const raw = localStorage.getItem(storageKey(uid));
      if (raw) setSettings(JSON.parse(raw));
    } catch {}
  }, []);

  const save = useCallback((next: UserSettings): { ok: boolean; error?: string } => {
    setSettings(next);
    if (!userId) return { ok: true };
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Storage write failed';
      console.error('[useSettings] Failed to persist settings:', msg);
      return { ok: false, error: 'Settings could not be saved. Your browser storage may be full or restricted.' };
    }
  }, [userId]);

  const getHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    const { global: g, advanced: adv } = settings;

    if (g.provider)  headers['x-cf-provider']      = g.provider;
    if (g.apiKey)    headers['x-cf-api-key']        = g.apiKey;
    if (g.model)     headers['x-cf-model']          = g.model;

    const text = adv.text;
    if (text?.provider) headers['x-cf-text-provider'] = text.provider;
    if (text?.model)    headers['x-cf-text-model']    = text.model;
    if (text?.apiKey)   headers['x-cf-text-key']      = text.apiKey;

    const ollama = adv.ollama;
    if (ollama?.baseUrl) headers['x-cf-ollama-url']   = ollama.baseUrl;
    const tts = adv.tts;
    if (tts?.provider)   headers['x-cf-tts-provider'] = tts.provider;
    if (tts?.baseUrl)    headers['x-cf-tts-url']      = tts.baseUrl;
    if (tts?.model)      headers['x-cf-tts-model']    = tts.model;
    const stt = adv.stt;
    if (stt?.provider)   headers['x-cf-stt-provider'] = stt.provider;
    if (stt?.baseUrl)    headers['x-cf-stt-url']      = stt.baseUrl;
    const img = adv.imageGen;
    if (img?.provider)   headers['x-cf-image-provider'] = img.provider;
    if (img?.apiKey)     headers['x-cf-image-key']      = img.apiKey;

    return headers;
  }, [settings]);

  const verifyKey = useCallback(async (
    provider: string,
    apiKey: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      return res.json();
    } catch {
      return { ok: false, error: "Couldn't reach the server. Check your network connection." };
    }
  }, []);

  const hasGlobalKey = !!(settings.global.provider && (
    settings.global.apiKey ||
    settings.global.provider === 'ollama' ||
    settings.global.provider.startsWith('cli/')
  ));

  const maskedKey = maskKey(settings.global.apiKey);

  return { settings, save, getHeaders, verifyKey, hasGlobalKey, maskedKey };
}
