/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCloudAuth } from '@/hooks/useCloudAuth';
import * as storage from '@/src/lib/cloud/storage';
import * as auth from '@/src/lib/cloud/auth';

vi.mock('@/src/lib/cloud/storage', () => ({
  readSession: vi.fn(),
  writeSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock('@/src/lib/cloud/auth', () => ({
  cloudLogin: vi.fn(),
  cloudRegister: vi.fn(),
  cloudLogout: vi.fn(),
  fetchCurrentUser: vi.fn(),
}));

describe('useCloudAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with null session if none stored', () => {
    vi.mocked(storage.readSession).mockReturnValue(null);
    const { result } = renderHook(() => useCloudAuth());
    
    expect(result.current.session).toBeNull();
    expect(result.current.loggedIn).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('initializes with session if stored', () => {
    const mockSession = { accessToken: 'at', refreshToken: 'rt', user: { id: 'u1', email: 'e' } };
    vi.mocked(storage.readSession).mockReturnValue(mockSession as any);
    
    const { result } = renderHook(() => useCloudAuth());
    
    expect(result.current.session).toEqual(mockSession);
    expect(result.current.loggedIn).toBe(true);
  });

  it('updates session on login', async () => {
    const mockSession = { accessToken: 'at', refreshToken: 'rt', user: { id: 'u1', email: 'e' } };
    vi.mocked(auth.cloudLogin).mockResolvedValue(mockSession as any);
    
    const { result } = renderHook(() => useCloudAuth());
    
    await act(async () => {
      await result.current.login('test@test.com', 'pass');
    });

    expect(result.current.session).toEqual(mockSession);
    expect(result.current.loggedIn).toBe(true);
  });

  it('clears session on logout', async () => {
    const mockSession = { accessToken: 'at', refreshToken: 'rt', user: { id: 'u1', email: 'e' } };
    vi.mocked(storage.readSession).mockReturnValue(mockSession as any);
    
    const { result } = renderHook(() => useCloudAuth());
    
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.session).toBeNull();
    expect(result.current.loggedIn).toBe(false);
  });

  it('responds to cf:cloud-session-changed event', () => {
    vi.mocked(storage.readSession).mockReturnValue(null);
    const { result } = renderHook(() => useCloudAuth());

    const mockSession = { accessToken: 'at2', refreshToken: 'rt2', user: { id: 'u2', email: 'e2' } };
    vi.mocked(storage.readSession).mockReturnValue(mockSession as any);

    act(() => {
      window.dispatchEvent(new Event('cf:cloud-session-changed'));
    });

    expect(result.current.session).toEqual(mockSession);
  });
});
