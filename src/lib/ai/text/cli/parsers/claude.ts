// Vendored from reachforge/src/llm/parsers/claude.ts. Trimmed to the fields
// CoreFirst's LanguageModelV2 wrapper actually consumes (no session resume).

import { parseJsonLine } from './utils';

export interface ClaudeParseResult {
  model: string;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } | null;
  summary: string;
}

export function parseClaudeStreamJson(stdout: string): ClaudeParseResult {
  let model = '';
  let usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } | null = null;
  const textBlocks: string[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const event = parseJsonLine(line);
    if (!event) continue;

    const type = String(event.type ?? '');
    const subtype = String(event.subtype ?? '');

    if (type === 'system' && subtype === 'init') {
      model = asString(event.model) ?? model;
    } else if (type === 'assistant') {
      const message = event.message as Record<string, unknown> | undefined;
      if (message && Array.isArray(message.content)) {
        for (const block of message.content) {
          const b = block as Record<string, unknown>;
          if (b.type === 'text' && typeof b.text === 'string') {
            textBlocks.push(b.text);
          }
        }
      }
    } else if (type === 'result') {
      const u = event.usage as Record<string, unknown> | undefined;
      if (u) {
        usage = {
          inputTokens: asNumber(u.input_tokens),
          cachedInputTokens: asNumber(u.cache_read_input_tokens),
          outputTokens: asNumber(u.output_tokens),
        };
      }
      if (typeof event.result === 'string' && !textBlocks.length) {
        textBlocks.push(event.result);
      }
    }
  }

  return { model, usage, summary: textBlocks.join('\n\n') };
}

const CLAUDE_AUTH_RE =
  /(?:not\s+logged\s+in|please\s+log\s+in|login\s+required|unauthorized|authentication\s+required)/i;

export function detectClaudeAuthRequired(stdout: string, stderr: string): boolean {
  return CLAUDE_AUTH_RE.test(stdout) || CLAUDE_AUTH_RE.test(stderr);
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}
