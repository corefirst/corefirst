import { describe, it, expect } from 'vitest';
import { parseAIErrorResponse } from '@/src/lib/ai/client-error';

function mockResponse(status: number, body?: unknown): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

describe('parseAIErrorResponse', () => {
  it('returns null for OK responses', async () => {
    expect(await parseAIErrorResponse(mockResponse(200, { ok: true }))).toBeNull();
  });

  it('returns INSUFFICIENT_CREDITS for the 402 envelope', async () => {
    const res = mockResponse(402, {
      success: false,
      error: 'Insufficient credits…',
      code: 'INSUFFICIENT_CREDITS',
    });
    expect(await parseAIErrorResponse(res)).toBe('INSUFFICIENT_CREDITS');
  });

  it('returns INVALID_API_KEY for the 401 envelope', async () => {
    const res = mockResponse(401, {
      success: false,
      error: 'INVALID_API_KEY',
      code: 'INVALID_API_KEY',
    });
    expect(await parseAIErrorResponse(res)).toBe('INVALID_API_KEY');
  });

  it('returns API_KEY_REQUIRED when the body declares it', async () => {
    const res = mockResponse(401, {
      success: false,
      error: 'API_KEY_REQUIRED',
      code: 'API_KEY_REQUIRED',
    });
    expect(await parseAIErrorResponse(res)).toBe('API_KEY_REQUIRED');
  });

  it('returns null for non-auth errors (500, 503, etc.)', async () => {
    expect(await parseAIErrorResponse(mockResponse(500, { error: 'oops' }))).toBeNull();
    expect(await parseAIErrorResponse(mockResponse(503))).toBeNull();
  });

  it('falls back to status-derived code when body is missing', async () => {
    // Some intermediaries strip JSON bodies — UI should still surface a
    // useful code from status alone.
    expect(await parseAIErrorResponse(mockResponse(402))).toBe('INSUFFICIENT_CREDITS');
    expect(await parseAIErrorResponse(mockResponse(401))).toBe('INVALID_API_KEY');
  });

  it('does not consume the response body (clone() preserves it for the caller)', async () => {
    const res = mockResponse(402, { code: 'INSUFFICIENT_CREDITS' });
    await parseAIErrorResponse(res);
    // Caller should still be able to read the body.
    const body = await res.json();
    expect(body.code).toBe('INSUFFICIENT_CREDITS');
  });
});
