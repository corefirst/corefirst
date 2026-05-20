'use client';
import { useState, useEffect, useCallback } from 'react';
import { USER_ID_COOKIE } from '@/src/lib/constants';
import { getAccessToken } from '@/src/lib/cloud/storage';
import { getCloudBaseUrl } from '@/src/lib/cloud/client';

const COOKIE_NAME = USER_ID_COOKIE;

export type SettingsMode = 'standard' | 'advanced';

export interface UserSettings {
  mode: SettingsMode;
  global: { provider: string; apiKey: string; model: string; ttsModel: string; sttModel: string; imageModel: string };
  advanced: {
    text?:       { provider?: string; model?: string; apiKey?: string };
    transform?:  { provider?: string; model?: string; apiKey?: string };
    courseGen?:  { provider?: string; model?: string; apiKey?: string };
    tts?:        { provider?: string; baseUrl?: string; model?: string; apiKey?: string };
    stt?:        { provider?: string; baseUrl?: string; apiKey?: string };
    imageGen?:   { provider?: string; apiKey?: string; baseUrl?: string; model?: string };
    ollama?:     { baseUrl?: string };
  };
}

const EMPTY_SETTINGS: UserSettings = {
  mode: 'standard',
  global: { provider: '', apiKey: '', model: '', ttsModel: '', sttModel: '', imageModel: '' },
  advanced: {},
};

// Stored TTS/STT model ids that are no longer routable on a given provider.
// Old defaults (e.g. OpenRouter `openai/tts-1`, `openai/whisper-1`) were saved
// into localStorage by earlier app versions; we replace them transparently so
// the user doesn't have to clear settings after a fix lands upstream.
const LEGACY_MODEL_MIGRATIONS: Record<string, {
  ttsModel?:   Record<string, string>;
  sttModel?:   Record<string, string>;
  imageModel?: Record<string, string>;
}> = {
  openrouter: {
    ttsModel: { 'openai/tts-1': 'openai/gpt-4o-mini-tts-2025-12-15' },
    // whisper-1 → 500 (route deprecated). whisper-large-v3-turbo → 500 since
    // 2026-04 (OpenRouter routes it through Groq, which has a known upstream
    // outage). gpt-4o-mini-transcribe goes direct to OpenAI and is stable.
    sttModel: {
      'openai/whisper-1':              'openai/gpt-4o-mini-transcribe',
      'openai/whisper-large-v3-turbo': 'openai/gpt-4o-mini-transcribe',
    },
    // flux-schnell needs OpenAI-style /v1/images/generations, which OpenRouter
    // doesn't expose — image generation there only goes through chat/completions
    // with modalities. Move to a model meant for that path.
    imageModel: { 'black-forest-labs/flux-schnell': 'google/gemini-3.1-flash-image-preview' },
  },
};

export function normalize(raw: unknown): UserSettings {
  // Migrate legacy payloads that predate the `mode` field.
  if (!raw || typeof raw !== 'object') return EMPTY_SETTINGS;
  const r = raw as Partial<UserSettings>;
  const hasAdvancedOverrides = !!(
    r.advanced && Object.keys(r.advanced).length > 0 &&
    Object.values(r.advanced).some(v => v && Object.keys(v).length > 0)
  );
  const global = { provider: '', apiKey: '', model: '', ttsModel: '', sttModel: '', imageModel: '', ...(r.global ?? {}) };
  const migrations = LEGACY_MODEL_MIGRATIONS[global.provider];
  if (migrations) {
    const ttsMap = migrations.ttsModel?.[global.ttsModel];
    if (ttsMap) global.ttsModel = ttsMap;
    const sttMap = migrations.sttModel?.[global.sttModel];
    if (sttMap) global.sttModel = sttMap;
    const imageMap = migrations.imageModel?.[global.imageModel];
    if (imageMap) global.imageModel = imageMap;
  }
  return {
    mode: r.mode ?? (hasAdvancedOverrides ? 'advanced' : 'standard'),
    global,
    advanced: r.advanced ?? {},
  };
}

const ANON_STORAGE_KEY = 'cf_settings_anon';

function storageKey(userId: string): string {
  return userId ? `cf_settings_${userId}` : ANON_STORAGE_KEY;
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
    const key = storageKey(uid);

    // Pre-select `corefirst` for first-time users that are logged into CoreFirst cloud
    // — gives a working out-of-the-box AI experience without a manual key.
    const withCloudDefault = (s: UserSettings): UserSettings => {
      if (s.global.provider || !getAccessToken()) return s;
      return { ...s, global: { ...s.global, provider: 'corefirst' } };
    };

    try {
      const raw = localStorage.getItem(key);
      setSettings(withCloudDefault(raw ? normalize(JSON.parse(raw)) : EMPTY_SETTINGS));
    } catch {}

    const reload = () => {
      try {
        const raw = localStorage.getItem(key);
        setSettings(withCloudDefault(raw ? normalize(JSON.parse(raw)) : EMPTY_SETTINGS));
      } catch {}
    };
    const onStorage = (e: StorageEvent) => { if (e.key === key) reload(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('cf:settings-saved', reload);
    window.addEventListener('cf:cloud-session-changed', reload);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cf:settings-saved', reload);
      window.removeEventListener('cf:cloud-session-changed', reload);
    };
  }, []);

  const save = useCallback((next: UserSettings): { ok: boolean; error?: string } => {
    setSettings(next);
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
      window.dispatchEvent(new Event('cf:settings-saved'));
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Storage write failed';
      console.error('[useSettings] Failed to persist settings:', msg);
      return { ok: false, error: 'Settings could not be saved. Your browser storage may be full or restricted.' };
    }
  }, [userId]);

  const getHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    const { mode, global: g, advanced: adv } = settings;

    // Cloud auth — forward access token + base URL on every API call so the
    // server-side route handlers can reach the gateway whenever the user
    // selects the `corefirst` provider. Cheap to always include; the per-request
    // resolvers only use these headers when provider === 'corefirst'.
    const cloudToken = getAccessToken();
    if (cloudToken) {
      headers['x-cf-cloud-token']    = cloudToken;
      headers['x-cf-cloud-base-url'] = getCloudBaseUrl();
    }

    if (g.provider)  headers['x-cf-provider']      = g.provider;
    if (g.apiKey)    headers['x-cf-api-key']        = g.apiKey;
    if (g.model)     headers['x-cf-model']          = g.model;

    // Standard mode: one provider covers all capabilities — propagate global
    // provider+key to TTS/STT/image headers so each backend route sees them.
    if (mode !== 'advanced') {
      if (g.provider) {
        headers['x-cf-tts-provider'] = g.provider;
        if (g.apiKey)     headers['x-cf-tts-key']    = g.apiKey;
        if (g.ttsModel)   headers['x-cf-tts-model']  = g.ttsModel;
        headers['x-cf-stt-provider'] = g.provider;
        if (g.apiKey)     headers['x-cf-stt-key']    = g.apiKey;
        if (g.sttModel)   headers['x-cf-stt-model']  = g.sttModel;
        headers['x-cf-image-provider'] = g.provider;
        if (g.apiKey)     headers['x-cf-image-key']  = g.apiKey;
        if (g.imageModel) headers['x-cf-image-model'] = g.imageModel;
      }
      return headers;
    }

    const text = adv.text;
    if (text?.provider) headers['x-cf-text-provider'] = text.provider;
    if (text?.model)    headers['x-cf-text-model']    = text.model;
    if (text?.apiKey)   headers['x-cf-text-key']      = text.apiKey;

    const transform = adv.transform;
    if (transform?.provider) headers['x-cf-transform-provider'] = transform.provider;
    if (transform?.model)    headers['x-cf-transform-model']    = transform.model;
    if (transform?.apiKey)   headers['x-cf-transform-key']      = transform.apiKey;

    const courseGen = adv.courseGen;
    if (courseGen?.provider) headers['x-cf-course-gen-provider'] = courseGen.provider;
    if (courseGen?.model)    headers['x-cf-course-gen-model']    = courseGen.model;
    if (courseGen?.apiKey)   headers['x-cf-course-gen-key']      = courseGen.apiKey;

    const ollama = adv.ollama;
    if (ollama?.baseUrl) headers['x-cf-ollama-url']   = ollama.baseUrl;
    const tts = adv.tts;
    if (tts?.provider)   headers['x-cf-tts-provider'] = tts.provider;
    if (tts?.baseUrl)    headers['x-cf-tts-url']      = tts.baseUrl;
    if (tts?.model)      headers['x-cf-tts-model']    = tts.model;
    if (tts?.apiKey)     headers['x-cf-tts-key']      = tts.apiKey;
    const stt = adv.stt;
    if (stt?.provider)   headers['x-cf-stt-provider'] = stt.provider;
    if (stt?.baseUrl)    headers['x-cf-stt-url']      = stt.baseUrl;
    if (stt?.apiKey)     headers['x-cf-stt-key']      = stt.apiKey;
    const img = adv.imageGen;
    if (img?.provider)   headers['x-cf-image-provider'] = img.provider;
    if (img?.apiKey)     headers['x-cf-image-key']      = img.apiKey;
    if (img?.baseUrl)    headers['x-cf-image-url']      = img.baseUrl;
    if (img?.model)      headers['x-cf-image-model']    = img.model;

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
    settings.global.provider.startsWith('cli/') ||
    (settings.global.provider === 'corefirst' && getAccessToken())
  ));

  const maskedKey = maskKey(settings.global.apiKey);

  return { settings, save, getHeaders, verifyKey, hasGlobalKey, maskedKey };
}
