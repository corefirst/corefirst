/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings } from '@/hooks/useSettings';
import * as cloudStorage from '@/src/lib/cloud/storage';

vi.mock('@/src/lib/cloud/storage', () => ({
  getAccessToken: vi.fn(),
  getCloudBaseUrl: vi.fn().mockReturnValue('https://api.corefirst.world'),
}));

describe('useSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Clear cookies mock if needed, but getCookieValue uses document.cookie
    document.cookie = '';
  });

  it('initializes with default settings when localStorage is empty', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.mode).toBe('standard');
    expect(result.current.settings.global.provider).toBe('');
  });

  it('pre-selects corefirst provider for cloud-logged-in users', () => {
    vi.mocked(cloudStorage.getAccessToken).mockReturnValue('fake-token');
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.global.provider).toBe('corefirst');
  });

  it('saves settings to localStorage', () => {
    const { result } = renderHook(() => useSettings());
    const nextSettings = {
      ...result.current.settings,
      global: { ...result.current.settings.global, provider: 'openai', apiKey: 'sk-test' }
    };

    act(() => {
      result.current.save(nextSettings);
    });

    expect(result.current.settings.global.provider).toBe('openai');
    const stored = JSON.parse(localStorage.getItem('cf_settings_anon')!);
    expect(stored.global.provider).toBe('openai');
  });

  it('generates correct headers for standard mode', () => {
    const { result } = renderHook(() => useSettings());
    const nextSettings = {
      ...result.current.settings,
      global: { 
        provider: 'openai', 
        apiKey: 'sk-test', 
        model: 'gpt-4o',
        ttsModel: 'tts-1',
        sttModel: 'whisper-1',
        imageModel: 'dall-e-3'
      }
    };

    act(() => {
      result.current.save(nextSettings);
    });

    const headers = result.current.getHeaders();
    expect(headers['x-cf-provider']).toBe('openai');
    expect(headers['x-cf-api-key']).toBe('sk-test');
    expect(headers['x-cf-tts-provider']).toBe('openai');
    expect(headers['x-cf-tts-model']).toBe('tts-1');
  });

  it('generates cloud auth headers when token is present', () => {
    vi.mocked(cloudStorage.getAccessToken).mockReturnValue('fake-token');
    const { result } = renderHook(() => useSettings());
    
    const headers = result.current.getHeaders();
    expect(headers['x-cf-cloud-token']).toBe('fake-token');
    expect(headers['x-cf-cloud-base-url']).toBe('http://localhost:4000');
  });

  it('responds to storage events for cross-tab sync', () => {
    const { result } = renderHook(() => useSettings());
    
    const nextSettings = {
        ...result.current.settings,
        global: { ...result.current.settings.global, provider: 'external' }
    };

    act(() => {
        localStorage.setItem('cf_settings_anon', JSON.stringify(nextSettings));
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'cf_settings_anon',
            newValue: JSON.stringify(nextSettings)
        }));
    });

    expect(result.current.settings.global.provider).toBe('external');
  });
});
