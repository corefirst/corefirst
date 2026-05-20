/**
 * Lightweight module-level pub/sub for AI billing errors observed by any
 * UI caller in the browser bundle. Lets deep child components (chat,
 * voice-challenge, visual, history lists) signal a 401/402 to the top-level
 * page so a single banner renders — without threading an `onAIError` prop
 * through every component layer.
 *
 * Browser-only; the listener is registered by `app/page.tsx` once on mount.
 */
import type { ClientAIErrorCode } from './client-error';

type Listener = (code: ClientAIErrorCode) => void;

const listeners = new Set<Listener>();

export function onAIBillingError(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitAIBillingError(code: ClientAIErrorCode): void {
  for (const l of listeners) {
    try { l(code); } catch (err) {
      // A faulty listener must not block the others.
      console.error('[ai/billing] listener threw:', err);
    }
  }
}
