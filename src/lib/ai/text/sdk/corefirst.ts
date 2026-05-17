/**
 * CoreFirst SaaS text-generation provider.
 *
 * Talks to the corefirst-world `/v1/ai/chat/completions` OpenAI-compatible
 * endpoint. The `apiKey` carried here is the SaaS access token issued at
 * login (see `src/lib/saas/auth.ts`).
 *
 * BYOK note: when the user wants the SaaS gateway to forward to a specific
 * provider with their own key, the caller passes the user's provider name
 * via the `x-llm-provider` header AND their own key via `x-llm-api-key`. The
 * `Authorization` header always remains the SaaS access token.
 */
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export interface CorefirstTextOpts {
  model: string;
  baseUrl: string;          // e.g. http://localhost:4000/v1/ai
  accessToken: string;       // SaaS access token
  upstreamProvider?: string; // optional: pin a specific upstream provider on the gateway
  upstreamApiKey?: string;   // optional BYOK forwarded to upstream
}

export function corefirstTextModel(opts: CorefirstTextOpts): LanguageModel {
  const provider = createOpenAI({
    baseURL: opts.baseUrl,
    apiKey: opts.accessToken,
    headers: {
      ...(opts.upstreamProvider ? { 'x-llm-provider': opts.upstreamProvider } : {}),
      ...(opts.upstreamApiKey ? { 'x-llm-api-key': opts.upstreamApiKey } : {}),
    },
  });
  return provider(opts.model as Parameters<typeof provider>[0]);
}
