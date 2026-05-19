import { describe, it, expect } from 'vitest';
import {
  classifyAIError,
  isInsufficientCreditsError,
  buildAIErrorResponse,
} from '@/src/lib/ai/errors';

describe('classifyAIError', () => {
  it('classifies a 402 statusCode as INSUFFICIENT_CREDITS', () => {
    const err = Object.assign(new Error('Payment required'), { statusCode: 402 });
    expect(classifyAIError(err)).toBe('INSUFFICIENT_CREDITS');
  });

  it('classifies an INSUFFICIENT_CREDITS code in responseBody as INSUFFICIENT_CREDITS', () => {
    const err = Object.assign(new Error('Request failed'), {
      statusCode: 500,
      responseBody: JSON.stringify({
        success: false,
        error: 'Insufficient credits…',
        code: 'INSUFFICIENT_CREDITS',
      }),
    });
    expect(classifyAIError(err)).toBe('INSUFFICIENT_CREDITS');
  });

  it('detects INSUFFICIENT_CREDITS nested under a cause chain', () => {
    const upstream = Object.assign(new Error('upstream'), { statusCode: 402 });
    const wrapped = Object.assign(new Error('wrapper'), { cause: upstream });
    expect(classifyAIError(wrapped)).toBe('INSUFFICIENT_CREDITS');
  });

  it('classifies a 401 as INVALID_API_KEY', () => {
    const err = new Error('401 Unauthorized');
    expect(classifyAIError(err)).toBe('INVALID_API_KEY');
  });

  it('classifies provider-disabled errors as API_KEY_REQUIRED', () => {
    const err = new Error('openai is disabled — Set GLOBAL_PROVIDER');
    expect(classifyAIError(err)).toBe('API_KEY_REQUIRED');
  });

  it('falls back to AI_ERROR for unrecognised failures', () => {
    expect(classifyAIError(new Error('Network unreachable'))).toBe('AI_ERROR');
  });

  it('isInsufficientCreditsError mirrors the classifier', () => {
    const err = Object.assign(new Error('x'), { statusCode: 402 });
    expect(isInsufficientCreditsError(err)).toBe(true);
    expect(isInsufficientCreditsError(new Error('nope'))).toBe(false);
  });
});

describe('buildAIErrorResponse', () => {
  it('returns a 402 JSON response for INSUFFICIENT_CREDITS', async () => {
    const err = Object.assign(new Error('x'), { statusCode: 402 });
    const res = buildAIErrorResponse(err);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(402);
    const body = await res!.json();
    expect(body).toMatchObject({
      success: false,
      code: 'INSUFFICIENT_CREDITS',
    });
    expect(typeof body.error).toBe('string');
  });

  it('returns a 401 JSON response for INVALID_API_KEY', async () => {
    const err = new Error('Unauthorized');
    const res = buildAIErrorResponse(err);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    const body = await res!.json();
    expect(body.code).toBe('INVALID_API_KEY');
  });

  it('returns null for generic errors so callers can fall through to 500', () => {
    expect(buildAIErrorResponse(new Error('Network unreachable'))).toBeNull();
  });
});
