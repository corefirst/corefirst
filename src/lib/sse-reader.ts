// Utility for consuming Server-Sent Events from a fetch Response body.
// Each `data: <json>` line is parsed and passed to the onEvent callback.
// Returns when the stream closes or the callback throws.

export async function consumeSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void | boolean, // return true to stop early
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
        const stop = onEvent(event);
        if (stop) return;
      } catch {
        // Partial JSON — wait for more chunks
      }
    }
  }
}
