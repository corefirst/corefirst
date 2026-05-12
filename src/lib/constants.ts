export const USER_ID_COOKIE = 'cf_user_id';

export const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  openrouter:   'google/gemini-flash-1.5',
  groq:         'llama-3.3-70b-versatile',
  google:       'gemini-2.5-pro-preview',
  openai:       'gpt-4o',
  anthropic:    'claude-sonnet-4-6',
  ollama:       'llama3.2',
  'cli/claude': 'claude',
  'cli/gemini': 'gemini',
};
