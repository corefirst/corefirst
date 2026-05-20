export type AIErrorCode =
  | 'API_KEY_REQUIRED'
  | 'INVALID_API_KEY'
  | 'INSUFFICIENT_CREDITS'
  | 'AI_ERROR';

/**
 * Classify an arbitrary thrown error from an AI provider (Vercel AI SDK,
 * custom TTS / STT / Image providers, or our own cloud gateway) into a
 * stable code that the UI can map to a friendly message.
 *
 * Detection priority:
 *  1. CoreFirst cloud gateway returns HTTP 402 with `code:"INSUFFICIENT_CREDITS"`
 *     when the user has no remaining credits and no BYOK key.
 *  2. 401/403/`invalid_api_key` → INVALID_API_KEY.
 *  3. Provider-disabled / no-API-key configured locally → API_KEY_REQUIRED.
 *  4. Anything else → AI_ERROR.
 */
export function classifyAIError(err: unknown): AIErrorCode {
  // Inspect every field that providers commonly carry the upstream response on.
  // Vercel AI SDK's APICallError exposes statusCode + responseBody; our own
  // wrapped fetch errors stash the body on `cause` or `data`. We don't depend
  // on instanceof here — provider versions and bundling make duck-typing
  // safer than identity checks.
  const status = findStatus(err);
  const haystack = collectErrorText(err);

  if (status === 402 || /INSUFFICIENT_CREDITS/i.test(haystack)) {
    return 'INSUFFICIENT_CREDITS';
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('is disabled') || msg.includes('Set GLOBAL_PROVIDER') || msg.includes('_PROVIDER to enable')) {
    return 'API_KEY_REQUIRED';
  }
  // Auth detection: prefer the numeric status (from APICallError.statusCode or
  // a cause-chained status field). Substring matches on bare `'401'`/`'403'`
  // false-fire on timing logs, request IDs, model names like `gpt-4-0314`,
  // and excerpts of upstream prose — so only the explicit invalid-key phrases
  // are checked, never digits alone.
  if (status === 401 || status === 403) return 'INVALID_API_KEY';
  if (
    msg.includes('Unauthorized') ||
    msg.includes('invalid_api_key') ||
    msg.includes('Invalid API key') ||
    msg.includes('Forbidden')
  ) {
    return 'INVALID_API_KEY';
  }
  return 'AI_ERROR';
}

/** Convenience predicate — wraps classifyAIError for call sites that just
 *  need to branch on the credits-exhausted condition. */
export function isInsufficientCreditsError(err: unknown): boolean {
  return classifyAIError(err) === 'INSUFFICIENT_CREDITS';
}

/**
 * If `error` is an AI-classifiable failure that the client must handle
 * specially (credits exhausted / invalid or missing key), return a JSON
 * Response with the matching HTTP status. Otherwise return null, letting
 * the caller fall through to its own generic error response.
 *
 * Response shape — kept aligned with the spec the client consumes:
 *   { success: false, error: <human message>, code: <AIErrorCode> }
 */
export function buildAIErrorResponse(error: unknown): Response | null {
  const code = classifyAIError(error);
  if (code === 'INSUFFICIENT_CREDITS') {
    return Response.json(
      {
        success: false,
        error: 'Insufficient credits. Provide X-LLM-API-Key or top up.',
        code,
      },
      { status: 402 },
    );
  }
  if (code === 'API_KEY_REQUIRED' || code === 'INVALID_API_KEY') {
    return Response.json({ success: false, error: code, code }, { status: 401 });
  }
  return null;
}

// Walk `cause` chain looking for a numeric statusCode/status, since the AI
// SDK often nests the original APICallError under one or two wrappers.
function findStatus(err: unknown, depth = 0): number | undefined {
  if (depth > 3 || err == null || typeof err !== 'object') return undefined;
  const e = err as { statusCode?: unknown; status?: unknown; cause?: unknown };
  if (typeof e.statusCode === 'number') return e.statusCode;
  if (typeof e.status === 'number') return e.status;
  return findStatus(e.cause, depth + 1);
}

function collectErrorText(err: unknown, depth = 0): string {
  if (depth > 3 || err == null) return '';
  if (typeof err === 'string') return err;
  if (typeof err !== 'object') return '';
  const e = err as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof e.message === 'string') parts.push(e.message);
  if (typeof e.responseBody === 'string') parts.push(e.responseBody);
  if (e.data !== undefined) {
    parts.push(typeof e.data === 'string' ? e.data : safeStringify(e.data));
  }
  if (e.cause) parts.push(collectErrorText(e.cause, depth + 1));
  return parts.join(' ');
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return ''; }
}
