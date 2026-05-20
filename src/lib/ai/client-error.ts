/**
 * Browser-side helper that classifies the auth/credits status of a response
 * from one of the local AI API routes.
 *
 * The server-side error shape (set by `src/lib/ai/errors.ts buildAIErrorResponse`)
 * is `{ success: false, error: <human message>, code: <AIErrorCode> }` with
 * HTTP 402 for credits and 401 for key issues. Every UI surface that fetches
 * an AI endpoint should route the response through this helper so the
 * INSUFFICIENT_CREDITS / INVALID_API_KEY / API_KEY_REQUIRED codes surface
 * uniformly to the learner instead of being swallowed as a generic failure.
 */
export type ClientAIErrorCode =
  | 'API_KEY_REQUIRED'
  | 'INVALID_API_KEY'
  | 'INSUFFICIENT_CREDITS';

/**
 * Inspect a non-OK response and return the AI error code if the server
 * signaled one. Returns null when the response is OK or when the status /
 * body does not match the AI-error envelope (caller falls through to its
 * own generic error handling).
 */
export async function parseAIErrorResponse(
  res: Response,
): Promise<ClientAIErrorCode | null> {
  if (res.ok) return null;
  // Only 401 / 402 carry the AI-error envelope; other failures (400 / 500 /
  // 503) come from validation, infra, or non-AI paths and should not be
  // re-interpreted as auth issues.
  if (res.status !== 401 && res.status !== 402) return null;
  const body = await res.clone().json().catch(() => null) as { code?: string } | null;
  const code = body?.code;
  if (
    code === 'INSUFFICIENT_CREDITS' ||
    code === 'INVALID_API_KEY' ||
    code === 'API_KEY_REQUIRED'
  ) {
    return code;
  }
  // Status said 401/402 but body did not declare a known code — fall back
  // to the status's most likely meaning so the UI still shows something
  // actionable.
  return res.status === 402 ? 'INSUFFICIENT_CREDITS' : 'INVALID_API_KEY';
}
