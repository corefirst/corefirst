/** Canonical base URLs for OpenAI-compatible provider endpoints. */
export const PROVIDER_BASE_URLS: Record<string, string> = {
  qwen:       'https://dashscope.aliyuncs.com/compatible-mode/v1',
  openrouter: 'https://openrouter.ai/api/v1',
} as const;
