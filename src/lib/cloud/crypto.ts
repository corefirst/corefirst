// Uses globalThis.crypto.subtle — available in browser and Node.js 16+
export async function sha256(message: string): Promise<string> {
  const buffer = new TextEncoder().encode(message);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
