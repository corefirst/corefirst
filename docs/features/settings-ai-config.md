# Settings & AI Configuration

> Status: Shipped | Updated: 2026-05-16  
> PRD: F-15 UI-Configurable AI Provider, F-16 BYOK Error Handling  
> Source spec: `docs/prd.md` F-15/F-16

---

## Overview

Users configure AI providers, API keys, and local server URLs entirely from the browser UI — no `.env` editing required. Settings are stored in `localStorage` per profile, delivered to the server as `x-cf-*` request headers, and applied per-request without touching any server-side config.

Existing `.env`-based configuration continues to work unchanged. Browser settings override env vars for that request only.

CLI-configured settings (via `corefirst config set …`) are persisted to `~/.corefirst/config.json` and loaded as env vars at process start, so the same provider/key choices apply to both the web server and CLI commands.

---

## Settings Panel (`components/Settings.tsx`)

Two-tab modal, opened via the ⚙ icon in the header.

### Tab 1: AI Providers

**Text AI section** — provider picker in two groups:

| Group | Providers |
|-------|-----------|
| Cloud | OpenRouter · Groq · Google AI · OpenAI · Anthropic · Qwen |
| Local | Ollama · Claude CLI · Gemini CLI |

Auth input adapts to provider type:
- **Cloud (API key providers):** API key (password field) + [Verify] button + optional model override + preset chips + "Get one free →" link
- **Qwen:** `DASHSCOPE_API_KEY` + optional model; presets include `qwen3-235b-a22b`, `qwen3-30b-a3b`, etc.
- **Ollama:** Base URL (default `http://localhost:11434`) + required model field + quick-pick tags (llama3.2, qwen2.5, mistral, deepseek-r1, gemma3)
- **CLI:** No auth needed; optional command path override; [Check CLI] verify button

Three collapsible sections for auxiliary capabilities:
- **TTS:** Provider (`openai` / `google` / `qwen`) + Base URL (openai-compat only) + Model. Local examples: Kokoro-FastAPI, Piper, Orpheus-FastAPI
- **STT:** Provider (`openai` / `google` / `qwen`) + Base URL (openai-compat only). Local examples: faster-whisper-server, whisper.cpp
- **Image Gen:** Provider (`google` / `openai` / `qwen` / `ollama`) + API Key

### Tab 2: Profile

- Display name input (synced to `cf_profiles` in localStorage via `useProfile.renameProfile`)
- User ID display (UUID, read-only — future hub.corefirst.world link)

---

## Data Model

```typescript
// localStorage key: cf_settings_{uuid}
interface UserSettings {
  global: {
    provider: string;  // 'openrouter' | 'groq' | 'google' | 'openai' | 'anthropic' | 'ollama' | 'cli/claude' | 'cli/gemini' | ''
    apiKey:   string;
    model:    string;  // optional override; '' = use provider default
  };
  advanced: {
    text?:     { provider?: string; model?: string; apiKey?: string };
    tts?:      { provider?: string; baseUrl?: string; model?: string };
    stt?:      { provider?: string; baseUrl?: string };
    imageGen?: { provider?: string; apiKey?: string };
    ollama?:   { baseUrl?: string };
  };
}
```

**Ollama URL** is stored in `advanced.ollama.baseUrl` (not `global.apiKey`). `global.model` holds the Ollama model name.

---

## `hooks/useSettings.ts`

```typescript
export function useSettings(): {
  settings: UserSettings;
  save(next: UserSettings): { ok: boolean; error?: string };
  getHeaders(): Record<string, string>;
  verifyKey(provider: string, apiKey: string): Promise<{ ok: boolean; error?: string }>;
  hasGlobalKey: boolean;
  maskedKey: string;
}
```

**`save()`** persists to localStorage and returns `{ ok, error? }` — callers show the error if storage write fails (e.g. private browsing quota exceeded).

**`getHeaders()`** produces the `x-cf-*` header map for inclusion in `fetch()` calls. Only non-empty values are emitted.

---

## Header Protocol

All headers use the `x-cf-` prefix to avoid collisions:

### Global / capability-level headers

| Header | Source field | Server reads via |
|--------|-------------|-----------------|
| `x-cf-provider` | `global.provider` | `extractSettings().global.provider` |
| `x-cf-api-key` | `global.apiKey` | `extractSettings().global.apiKey` |
| `x-cf-model` | `global.model` | `extractSettings().global.model` |
| `x-cf-text-provider` | `advanced.text.provider` | `extractSettings().text.provider` |
| `x-cf-text-model` | `advanced.text.model` | `extractSettings().text.model` |
| `x-cf-text-key` | `advanced.text.apiKey` | `extractSettings().text.apiKey` |
| `x-cf-ollama-url` | `advanced.ollama.baseUrl` | `extractSettings().ollama.baseUrl` |
| `x-cf-tts-provider` | `advanced.tts.provider` | `extractSettings().tts.provider` |
| `x-cf-tts-url` | `advanced.tts.baseUrl` | `extractSettings().tts.baseUrl` |
| `x-cf-tts-model` | `advanced.tts.model` | `extractSettings().tts.model` |
| `x-cf-stt-provider` | `advanced.stt.provider` | `extractSettings().stt.provider` |
| `x-cf-stt-url` | `advanced.stt.baseUrl` | `extractSettings().stt.baseUrl` |
| `x-cf-image-provider` | `advanced.imageGen.provider` | `extractSettings().image.provider` |
| `x-cf-image-key` | `advanced.imageGen.apiKey` | `extractSettings().image.apiKey` |

### Per-feature text headers (highest priority)

These override the text model for one specific feature without affecting others:

| Header | Feature overridden | Example |
|--------|-------------------|---------|
| `x-cf-transform-provider` / `x-cf-transform-model` | `transform` | `anthropic` / `claude-sonnet-4-6` |
| `x-cf-roleplay-provider` / `x-cf-roleplay-model` | `roleplay` | `ollama` / `llama3.2` |
| `x-cf-course-gen-provider` / `x-cf-course-gen-model` | `courseGen` | `openai` / `gpt-4o` |
| `x-cf-speech-eval-provider` / `x-cf-speech-eval-model` | `speechEval` | `groq` / `llama-3.3-70b-versatile` |

Server stores them in `extractSettings().features[featureKey]`. When present, `resolveFeatureFromSettings(feature, settings)` uses the feature-specific provider and ignores the global text headers for that feature.

---

## Server-Side Resolution (`src/lib/ai/settings-config.ts`)

### Text model resolution order (highest to lowest priority)

1. `x-cf-{feature}-provider` (per-feature header — e.g. `x-cf-roleplay-provider`)
2. `x-cf-text-provider` + `x-cf-text-key` (advanced text override, all text features)
3. `x-cf-provider` + `x-cf-api-key` (global UI setting)
4. `<FEATURE>_PROVIDER` / `<FEATURE>_MODEL` env vars
5. `<CAPABILITY>_PROVIDER` env vars
6. `GLOBAL_PROVIDER` / `GLOBAL_API_KEY` env vars
7. Baked-in defaults from `capabilities.ts`

### Key functions

```typescript
// Extract all x-cf-* headers from a request into a typed object.
// Populates RequestSettings.features for any per-feature provider headers found.
export function extractSettings(request: Request): RequestSettings

// Build a LanguageModel for a specific feature.
// Checks feature-specific header first, then falls back to global text settings.
// Returns undefined if no client-side settings are present (callers use env-var model).
export function resolveFeatureFromSettings(
  feature: FeatureKey,
  settings: RequestSettings,
): LanguageModel | undefined

// Shared context helpers — combine extractSettings + resolveFeatureFromSettings + getUserId
// Use in routes where the pattern is clean; import from src/lib/ai/request-context.ts
export async function resolveTextContext(feature: FeatureKey, request: Request): Promise<TextRequestContext>
export async function resolveTTSContext(request: Request): Promise<TTSRequestContext>
export async function resolveSTTContext(request: Request): Promise<STTRequestContext>

// TTS/STT/Image override extractors — return undefined if no override configured
export function resolveTTSOverride(settings: RequestSettings): TTSOverride | undefined
export function resolveSTTOverride(settings: RequestSettings): STTOverride | undefined
export function resolveImageOverride(settings: RequestSettings): ImageOverride | undefined
```

---

## Provider Default Models

Default text models per provider are the single source of truth in `PROVIDER_DEFAULTS` in `src/lib/ai/capabilities.ts`. Use the exported helper:

```typescript
// src/lib/ai/capabilities.ts
export function getDefaultTextModel(provider: string): string
// Returns PROVIDER_DEFAULTS[provider]?.text ?? ''

// Example values:
// getDefaultTextModel('google')       → 'gemini-2.5-pro-preview'
// getDefaultTextModel('openai')       → 'gpt-4o'
// getDefaultTextModel('anthropic')    → 'claude-sonnet-4-6'
// getDefaultTextModel('groq')         → 'llama-3.3-70b-versatile'
// getDefaultTextModel('ollama')       → 'llama3.2'
// getDefaultTextModel('cli/claude')   → 'claude'
```

> **Note:** `PROVIDER_DEFAULT_MODELS` in `src/lib/constants.ts` was removed in v0.3.1. Use `getDefaultTextModel()` instead.

---

## Routes Wired for Per-Request Overrides

All AI-facing routes include BYOK headers. The client components call `useSettings().getHeaders()` and spread the result into every `fetch` options object.

| Route | Called from | Text AI | TTS | STT | Image |
|-------|------------|---------|-----|-----|-------|
| `/api/transform` | `app/page.tsx` | ✅ | — | — | — |
| `/api/transform/refine` | `app/page.tsx` | ✅ | — | — | — |
| `/api/roleplay` | `CFLTChat.tsx` | ✅ | — | — | — |
| `/api/transcribe` | `CFLTChat.tsx` | — | — | ✅ | — |
| `/api/tts` | `CFLTChat.tsx` + `app/page.tsx` | — | ✅ | — | — |
| `/api/generate-course` | `app/page.tsx` | ✅ | — | — | — |
| `/api/speech-eval` | `VoiceChallenge.tsx` | ✅ | — | ✅ | — |
| `/api/generate-image` | `app/page.tsx` | — | — | — | ✅ |

---

## Key Verification (`/api/verify-key`)

```
POST /api/verify-key
Body: { provider, apiKey, baseUrl?, model? }
Response: { ok: boolean, error?: string }
```

Fires a minimal `generateText({ maxOutputTokens: 16 })` call. For Ollama, uses the provided `baseUrl` and `model`. Returns plain-English error messages for common failure modes (invalid key, insufficient credits, rate limit, network unreachable).

**Used by:** `Settings.tsx` Verify button (cloud + Ollama + CLI paths).

---

## Error Handling (`src/lib/ai/errors.ts`)

```typescript
export type AIErrorCode = 'API_KEY_REQUIRED' | 'INVALID_API_KEY' | 'AI_ERROR';

export function classifyAIError(err: unknown): AIErrorCode
```

Routes return `{ error: 'API_KEY_REQUIRED' | 'INVALID_API_KEY' }` with HTTP 401 when the error matches a key-related pattern. `AI_ERROR` falls through to HTTP 500.

**Frontend response** (`app/page.tsx`): detects 401, sets `keyError` state, shows inline banner:
- `API_KEY_REQUIRED` → "No API key configured. Open Settings →"
- `INVALID_API_KEY` → "API key invalid or expired. Update in Settings →"

Local provider errors (Ollama connection refused, CLI not found) do NOT trigger this path — they return descriptive 500s.

---

## Security Notes

- API keys transmitted as HTTP request headers. Requires HTTPS in production.
- Keys stored in `localStorage` only — never written to server disk.
- `baseUrl` values from headers are used to construct AI clients without allowlist validation. Safe for self-hosted deployments; add a URL allowlist before enabling in shared/SaaS contexts.
- `cf_user_id` cookie is `httpOnly: false` (required for localStorage namespacing). Acceptable for the client-first architecture; document this if hardening for a shared deployment.
