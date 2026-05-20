import { describe, expect, it, beforeEach, vi } from 'vitest';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem:    (k: string) => store[k] ?? null,
  setItem:    (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};
const dispatchEvent = vi.fn();

vi.stubGlobal('window',       { localStorage: localStorageMock, dispatchEvent });
vi.stubGlobal('localStorage', localStorageMock);

const { readSession, writeSession, clearSession, getAccessToken, getRefreshToken } =
  await import('../../src/lib/cloud/storage');

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  dispatchEvent.mockClear();
});

describe('readSession', () => {
  it('returns null when no keys present', () => {
    expect(readSession()).toBeNull();
  });

  it('returns session when all three keys are present', () => {
    store['cf_cloud_access_token']  = 'acc';
    store['cf_cloud_refresh_token'] = 'ref';
    store['cf_cloud_user']          = JSON.stringify({ id: 'u1', email: 'a@b.com' });
    const s = readSession();
    expect(s?.accessToken).toBe('acc');
    expect(s?.refreshToken).toBe('ref');
    expect(s?.user.email).toBe('a@b.com');
  });

});

describe('writeSession / clearSession', () => {
  it('persists all three fields and dispatches event', () => {
    writeSession({ accessToken: 'a', refreshToken: 'r', user: { id: 'u', email: 'x@y.com' } });
    expect(store['cf_cloud_access_token']).toBe('a');
    expect(store['cf_cloud_refresh_token']).toBe('r');
    expect(dispatchEvent).toHaveBeenCalled();
  });

  it('clearSession removes all three keys', () => {
    store['cf_cloud_access_token']  = 'acc';
    store['cf_cloud_refresh_token'] = 'ref';
    store['cf_cloud_user']          = '{}';
    clearSession();
    expect(store['cf_cloud_access_token']).toBeUndefined();
    expect(store['cf_cloud_refresh_token']).toBeUndefined();
    expect(store['cf_cloud_user']).toBeUndefined();
  });
});

describe('getAccessToken / getRefreshToken', () => {
  it('returns null when absent', () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('returns stored values', () => {
    store['cf_cloud_access_token']  = 'myToken';
    store['cf_cloud_refresh_token'] = 'myRefresh';
    expect(getAccessToken()).toBe('myToken');
    expect(getRefreshToken()).toBe('myRefresh');
  });
});
