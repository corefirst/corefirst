// Vendored from reachforge/src/llm/parsers/utils.ts. Kept identical so future
// parser fixes can be ported across both projects with a straight diff.

export const MAX_CAPTURE_BYTES = 4_194_304; // 4 MB

export function parseJsonLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function appendWithCap(
  buffer: string,
  chunk: string,
  maxBytes: number = MAX_CAPTURE_BYTES,
): string {
  const bufferBytes = Buffer.byteLength(buffer);
  const chunkBytes = Buffer.byteLength(chunk);

  if (bufferBytes + chunkBytes <= maxBytes) {
    return buffer + chunk;
  }

  const remaining = maxBytes - bufferBytes;
  if (remaining <= 0) return buffer;

  const truncated = Buffer.from(chunk).subarray(0, remaining).toString();
  return buffer + truncated;
}
