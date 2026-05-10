// Vendored from reachforge/src/llm/parsers/gemini.ts. Trimmed to fields
// CoreFirst's LanguageModelV2 wrapper consumes (no session resume).

import { parseJsonLine } from './utils';

export interface GeminiParseResult {
  summary: string;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  errorMessage: string | null;
}

export function parseGeminiJsonl(stdout: string): GeminiParseResult {
  let errorMessage: string | null = null;
  const messages: string[] = [];
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

  for (const line of stdout.split(/\r?\n/)) {
    const event = parseJsonLine(line);
    if (!event) continue;

    const type = String(event.type ?? '');
    const subtype = String(event.subtype ?? '');

    if (type === 'assistant') {
      // Legacy format: { type: 'assistant', message: { content: [{ text }] } }
      const message = event.message as Record<string, unknown> | undefined;
      if (message && Array.isArray(message.content)) {
        for (const block of message.content) {
          const b = block as Record<string, unknown>;
          if (typeof b.text === 'string') messages.push(b.text);
        }
      }
    } else if (type === 'message' && event.role === 'assistant') {
      // Current Gemini CLI (≥0.38) format: { type: 'message', role: 'assistant',
      // content: '<delta string>', delta: true }. Multiple events stream in;
      // concat their string content. Skip user/system messages.
      if (typeof event.content === 'string') {
        messages.push(event.content);
      } else if (Array.isArray(event.content)) {
        for (const block of event.content) {
          const b = block as Record<string, unknown>;
          if (typeof b.text === 'string') messages.push(b.text);
        }
      }
    } else if (type === 'text') {
      const part = event.part as Record<string, unknown> | undefined;
      if (part && typeof part.text === 'string') messages.push(part.text);
      else if (typeof event.text === 'string') messages.push(event.text);
    } else if (type === 'result') {
      // Current format puts token counts under `stats`; legacy used inline.
      const stats = event.stats as Record<string, unknown> | undefined;
      if (stats) accumulateUsage(usage, stats);
      else accumulateUsage(usage, event);
    } else if (type === 'step_finish' || event.usageMetadata || event.usage) {
      accumulateUsage(usage, event);
    } else if (type === 'error' || (type === 'system' && subtype === 'error')) {
      errorMessage =
        typeof event.message === 'string'
          ? event.message
          : typeof event.error === 'string'
            ? event.error
            : errorMessage;
    }
  }

  // Concat without separator: Gemini's stream-json emits each assistant
  // response as a sequence of delta chunks (`delta: true`) that may split mid-
  // token (even mid-string-literal in JSON output). A `\n\n` separator between
  // chunks would corrupt the assembled payload.
  return { summary: messages.join(''), usage, errorMessage };
}

const GEMINI_AUTH_RE =
  /(?:not\s+authenticated|api[_ ]?key\s+(?:required|missing|invalid)|unauthorized|not\s+logged\s+in|run\s+`?gemini\s+auth)/i;

export function detectGeminiAuthRequired(stdout: string, stderr: string): boolean {
  return GEMINI_AUTH_RE.test(stdout) || GEMINI_AUTH_RE.test(stderr);
}

function accumulateUsage(
  target: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
  event: Record<string, unknown>,
): void {
  const source = (event.usageMetadata ?? event.usage ?? event) as Record<string, unknown>;
  target.inputTokens += asNum(
    source.input_tokens,
    asNum(source.inputTokens, asNum(source.promptTokenCount, 0)),
  );
  target.cachedInputTokens += asNum(
    source.cached_input_tokens,
    asNum(
      source.cachedInputTokens,
      asNum(source.cachedContentTokenCount, asNum(source.cached, 0)),
    ),
  );
  target.outputTokens += asNum(
    source.output_tokens,
    asNum(source.outputTokens, asNum(source.candidatesTokenCount, 0)),
  );
}

function asNum(v: unknown, fallback: number = 0): number {
  return typeof v === 'number' ? v : fallback;
}
