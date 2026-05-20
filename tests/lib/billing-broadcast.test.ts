import { describe, it, expect, beforeEach, vi } from 'vitest';
import { onAIBillingError, emitAIBillingError } from '@/src/lib/ai/billing-broadcast';

describe('billing-broadcast', () => {
  it('fans an emit to every subscribed listener', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = onAIBillingError(a);
    const unsubB = onAIBillingError(b);
    emitAIBillingError('INSUFFICIENT_CREDITS');
    expect(a).toHaveBeenCalledWith('INSUFFICIENT_CREDITS');
    expect(b).toHaveBeenCalledWith('INSUFFICIENT_CREDITS');
    unsubA(); unsubB();
  });

  it('stops calling a listener after its unsubscribe', () => {
    const a = vi.fn();
    const unsub = onAIBillingError(a);
    unsub();
    emitAIBillingError('INVALID_API_KEY');
    expect(a).not.toHaveBeenCalled();
  });

  it('continues delivering to other listeners when one throws', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = vi.fn(() => { throw new Error('boom'); });
    const b = vi.fn();
    const unsubA = onAIBillingError(a);
    const unsubB = onAIBillingError(b);
    emitAIBillingError('API_KEY_REQUIRED');
    expect(b).toHaveBeenCalledWith('API_KEY_REQUIRED');
    unsubA(); unsubB();
    errSpy.mockRestore();
  });
});
