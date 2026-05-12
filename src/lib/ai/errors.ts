export type AIErrorCode = 'API_KEY_REQUIRED' | 'INVALID_API_KEY' | 'AI_ERROR';

export function classifyAIError(err: unknown): AIErrorCode {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('is disabled') || msg.includes('Set GLOBAL_PROVIDER') || msg.includes('_PROVIDER to enable')) {
    return 'API_KEY_REQUIRED';
  }
  if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized') || msg.includes('invalid_api_key') || msg.includes('Invalid API key') || msg.includes('Forbidden')) {
    return 'INVALID_API_KEY';
  }
  return 'AI_ERROR';
}
