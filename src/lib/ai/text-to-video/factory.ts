import { NotImplementedError } from '../capabilities';

/**
 * text-to-video is declared but not implemented in v1. Calling this surface
 * throws a clear error so callers fail fast — no silent fallbacks.
 *
 * To implement: add a provider SDK adapter under `sdk/` and wire it into
 * this factory, mirroring the text-to-image pattern.
 */
export function buildTextToVideoModel(): never {
  throw new NotImplementedError('text-to-video');
}
