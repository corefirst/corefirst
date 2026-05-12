# Provider & Storage Architecture

> Software version: 0.3.0 | Status: Implemented | Last Updated: 2026-05-12
> Companion documents: `docs/prd.md`, `docs/tech-design.md`, `docs/storage-design.md`, `docs/package-format.md`, `docs/learning-architecture.md`

---

## 0. Scope of This Document

This document is the as-built architectural reference for three tightly coupled subsystems that were introduced together in the AI/storage refactor (May 2026):

1. **AI provider layer** — pluggable backends per modality (text / image / TTS / STT), with subscription-CLI support for text
2. **Storage layer** — file-based `.corefirst` (ZIP) + `.cfrecord` (JSON) replacing the previous Prisma/libSQL setup
3. **Three-mode Phase 1 persistence** — Transform / Course / Roleplay each writing into `.cfrecord`

It originated as a refactor proposal; that migration has shipped. The contents now serve as the canonical design reference for the corresponding code under `src/lib/ai/` and `src/lib/storage/`. Code-level comments in those modules link back here by section number, so keep section numbering stable when editing.

The CLI provider work (Claude / Gemini subscription CLIs) sits inside the AI layer and follows the adapter design proven in `../reachforge/src/llm`.

---

## 1. Goals & Non-Goals

### 1.1 Goals

- Zero-API-key path: a developer with a logged-in `claude` or `gemini` CLI can run the full app without setting `*_API_KEY`.
- Single, narrow LLM API surface for the rest of the codebase. Swapping providers is one env var.
- Replace `prisma` imports with file I/O against `data/packages/*.corefirst` and `data/records/*.cfrecord`.
- Land Phase 1 persistence (transforms / roleplay) without expanding cross-mode coupling beyond what `learning-architecture.md` Phase 1 prescribes.

### 1.2 Non-Goals

- Phase 2/3/4 features (per-element CFLT sub-scores, cross-mode vocabulary, SM-2). Hooks left in but not implemented.
- ~~Authentication, multi-user, multi-tenant.~~ **Update:** Multi-user partitioning and the household profile switcher shipped in v0.3.0 (see `docs/features/user-identity.md`). Multi-tenant SaaS auth remains out of scope.
- Replacing the Vercel AI SDK as the type/abstraction layer. We extend it with custom providers; we do not abandon it.
- Migrating existing `dev.db` data. Local DBs are dropped; `data/` is the new world.

---

## 2. Pre-refactor vs. As-built State

The table below contrasts the system before the refactor with the architecture as it ships today. Kept for historical context — the "As built" column is the source of truth for current behavior; the "Pre-refactor" column documents what was deliberately removed and why.

| Concern | Pre-refactor | As built |
|---|---|---|
| AI module | Single `src/lib/ai.ts` exporting pre-built `llmModel` / `llmModelPro` / `imageModel` / `speechModel` / `transcriptionModel` from one file | `src/lib/ai/` package, split per capability: `text/`, `text-to-image/`, `text-to-speech/`, `speech-to-text/`, plus three video stubs. Each capability has its own factory; each *feature* (transform/courseGen/roleplay/speechEval/imageGen/tts/stt) has its own configuration knob. |
| Provider switch | Single `LLM_PROVIDER` env var | Per-capability defaults (`TEXT_PROVIDER`, `TEXT_TO_IMAGE_PROVIDER`, `TEXT_TO_SPEECH_PROVIDER`, `SPEECH_TO_TEXT_PROVIDER`) plus per-feature overrides (`TRANSFORM_PROVIDER`, `ROLEPLAY_PROVIDER`, …). Legacy `LLM_*` vars are not retained — pre-1.0 OSS, clean cut. |
| Text providers | `google`, `openai`, `anthropic`, `ollama`, `openrouter` | All of the above + `cli/claude`, `cli/gemini` (subscription-CLI subprocess; **text-only**) |
| Image / TTS / STT providers | Hardcoded to Google Imagen / OpenAI TTS / OpenAI STT | Pluggable via per-modality factories. Defaults match today; CLI providers explicitly **not** offered for these — capability matrix enforced at module load. |
| Structured output for CLI | N/A | Custom `LanguageModelV2.doGenerate` injects schema into system prompt, parses CLI's stream-json transcript, returns text; AI SDK handles JSON repair |
| Storage backend | Prisma + libSQL (`Session`, `Attempt`, `Vocabulary`) | File-based: `.corefirst` (ZIP) + `.cfrecord` (JSON), per `docs/storage-design.md` |
| Storage module | `src/lib/db.ts` (`prisma` singleton) | `src/lib/storage/`: `package.ts` (read/write `.corefirst`), `record.ts` (read/write `.cfrecord`), `paths.ts` |
| Course generation persistence | `prisma.session.create()` | Write `.corefirst` ZIP under `data/packages/<slug>.corefirst` |
| Voice attempt persistence | `prisma.attempt.create()` | Append to `lessons[].scripts[].attempts[]` in `.cfrecord` |
| Progress API | `prisma.session.findMany(...)` | Scan `data/records/*.cfrecord` and aggregate |
| Transform persistence | None | Append `.cfrecord` `transforms[]` entry (Phase 1) |
| Roleplay persistence | None | Append `.cfrecord` `roleplaySessions[]` entry (Phase 1) |
| `dev.db`, `prisma/`, `db:*` scripts | Present | Removed in this refactor |

---

## 3. AI Provider Layer

The AI surface is organized along two axes:

1. **Capabilities** — kinds of model interface (`text`, `text-to-image`, `text-to-speech`, `speech-to-text`, plus three video stubs). Each capability has its own provider set.
2. **Features** — concrete use sites inside the app that consume a capability. Each feature has its own configuration knob, so different parts of the app can pick different models without code changes.

The previous "standard / pro" tier abstraction is removed. It was a proxy for "quality vs cost", but the right granularity is *per feature*, not *per tier* — only `transform` and `courseGen` need quality-optimized models, and there is no clean two-bucket assignment for the rest.

### Capabilities

| Capability | What it does | AI SDK type | Status |
|---|---|---|---|
| `text` | Chat / structured output | `LanguageModelV3` | Implemented |
| `text-to-image` | Text → image generation | `ImageModelV3` | Implemented |
| `text-to-speech` | Text → audio | `SpeechModelV3` | Implemented |
| `speech-to-text` | Audio → text | `TranscriptionModelV3` | Implemented |
| `text-to-video` | Text → video | — | Stub (throws `NotImplementedError`) |
| `image-to-video` | Image → video | — | Stub |
| `multimodal-to-video` | Text + image → video | — | Stub |

The video stubs exist so the capability matrix is complete and so consumers can be wired through type-correctly today; switching them to real implementations is a drop-in change inside `src/lib/ai/<cap>/factory.ts`.

### Features

| Feature | Capability | Used by | Default provider | Default model | Rationale |
|---|---|---|---|---|---|
| `transform` | text | `src/core/transformer.ts` (`/api/transform`) | `google` | `gemini-3.1-pro-preview` | Structured output must be exact; quality-critical |
| `courseGen` | text | `src/generator/orchestrator.ts` (`/api/generate-course`) | `google` | `gemini-3.1-pro-preview` | Full lesson manifest + audit |
| `roleplay` | text | `/api/roleplay` | `google` | `gemini-3-flash-preview` | Cost-sensitive multi-turn |
| `speechEval` | text | `/api/speech-eval` LLM scoring | `google` | `gemini-3-flash-preview` | Short scoring task |
| `imageGen` | text-to-image | `package-builder.ts` + `/api/generate-image` | `google` | `imagen-4.0-generate-001` | Lesson scene art |
| `tts` | text-to-speech | `package-builder.ts` + `/api/tts` | `openai` | `gpt-4o-mini-tts` | Pre-rendered + live audio |
| `stt` | speech-to-text | `/api/transcribe` + `/api/speech-eval` | `openai` | `gpt-4o-mini-transcribe` | Voice transcription |

### 3.1 Module Layout

```
src/lib/ai/
  index.ts                     # public exports — pre-built feature models
  capabilities.ts              # CAPABILITIES, FEATURES, PROVIDERS_BY_CAPABILITY,
                               #   InvalidProviderError, NotImplementedError
  config.ts                    # resolveFeature() — applies the precedence chain

  text/                        # capability: text
    factory.ts                 # buildTextModelFor(featureKey) — dispatch on provider
    sdk/
      google.ts                # createGoogleGenerativeAI({ ... })(model)
      openai.ts                # openai(model)
      anthropic.ts             # createAnthropic({ ... })(model)
      ollama.ts                # createOllama({ baseURL })(model)
      openrouter.ts            # createOpenRouter({ apiKey })(model)
    cli/                       # text-only — see §3.4
      provider.ts              # wraps CLIAdapter as LanguageModelV3
      adapter.ts
      process.ts
      adapters/{claude,gemini}.ts
      parsers/{claude,gemini,utils}.ts
      schema.ts                # injectJsonSchemaInstructions

  text-to-image/               # capability: text-to-image
    factory.ts                 # buildImageModel() — for the imageGen feature
    sdk/
      google-imagen.ts
      openai-image.ts

  text-to-speech/              # capability: text-to-speech
    factory.ts                 # buildSpeechModel() — for the tts feature
    sdk/openai-tts.ts

  speech-to-text/              # capability: speech-to-text
    factory.ts                 # buildTranscriptionModel() — for the stt feature
    sdk/openai-stt.ts

  text-to-video/               # stub
    factory.ts                 # buildTextToVideoModel() — throws NotImplementedError
  image-to-video/              # stub
    factory.ts
  multimodal-to-video/         # stub
    factory.ts
```

The CLI subtree mirrors `../reachforge/src/llm/` deliberately. Files are copied — not vendored as a package — because (a) this repo doesn't have a workspace setup with reachforge, and (b) corefirst only needs the read-only execution path (`execute` + `probe`), not the full session manager / skill resolver. **Note the CLI subtree lives only under `text/`** — `image/cli/`, `speech/cli/`, `transcription/cli/` do not exist and will not exist, because subscription CLIs do not expose image/audio/video generation.

### 3.2 Public API (`src/lib/ai/index.ts`)

Each feature gets a pre-built model instance whose name matches the feature key. The import line is the capability declaration:

```ts
import type { LanguageModel, ImageModel, SpeechModel, TranscriptionModel } from 'ai';

// --- text features ---
export const transformModel: LanguageModel;
export const courseGenModel: LanguageModel;
export const roleplayModel: LanguageModel;
export const speechEvalModel: LanguageModel;

// --- non-text features ---
export const imageGenModel: ImageModel;          // text-to-image
export const ttsModel: SpeechModel;              // text-to-speech
export const sttModel: TranscriptionModel;       // speech-to-text

// --- video stubs (throw NotImplementedError) ---
export function buildTextToVideoModel(): never;
export function buildImageToVideoModel(): never;
export function buildMultimodalToVideoModel(): never;

// --- metadata for tooling and tests ---
export { CAPABILITIES, FEATURES, PROVIDERS_BY_CAPABILITY,
         InvalidProviderError, NotImplementedError,
         resolveFeature };
```

Each consumer imports exactly the feature it needs:

```ts
// src/core/transformer.ts
import { transformModel } from '@/src/lib/ai';
const { object } = await generateObject({ model: transformModel, schema, prompt });

// app/api/roleplay/route.ts
import { roleplayModel } from '@/src/lib/ai';

// src/core/visuals/imagen-provider.ts
import { imageGenModel } from '@/src/lib/ai';
```

The CLI providers transparently fulfill the same `LanguageModelV3` interface — selecting `cli/claude` for any text feature is a config-only change.

### 3.3 Provider Selection

Each feature resolves provider + model via this precedence:

0. **`x-cf-*` request headers** (highest priority) — sent by the browser when the user has configured a provider in the Settings panel. Extracted by `extractSettings()` in `src/lib/ai/settings-config.ts` and applied per-request only. Does not modify env vars or module-level state. See `docs/features/settings-ai-config.md`.
1. **`<FEATURE>_PROVIDER`** / **`<FEATURE>_MODEL`** — most specific env-var; one knob per feature.
2. **`<CAPABILITY>_PROVIDER`** — capability-level env-var default (e.g. `TEXT_PROVIDER`). Sets all features of that capability unless they have their own override.
3. **Baked-in default** from `FEATURES` in `capabilities.ts`.

#### 3.3.1 Provider catalog (per capability)

| Capability | Providers |
|---|---|
| `text` | `google`, `openai`, `anthropic`, `ollama`, `openrouter`, `groq` (OpenAI-compatible, UI only), **`cli/claude`**, **`cli/gemini`** |
| `text-to-image` | `google` (Imagen), `openai` (`gpt-image-1`) |
| `text-to-speech` | `openai` (`gpt-4o-mini-tts`) — also covers OpenAI-compatible local servers via `TTS_BASE_URL` |
| `speech-to-text` | `openai` (`gpt-4o-mini-transcribe`) |
| `text-to-video` | (none — stub) |
| `image-to-video` | (none — stub) |
| `multimodal-to-video` | (none — stub) |

For CLI providers, `<FEATURE>_MODEL` (or `TEXT_MODEL`) acts as a **command path override** (`/path/to/claude-canary`), not a model identifier — the actual model is whatever the user's CLI session is configured to use. The format is `cli/<name>` rather than `cli-<name>` because the slash makes the namespace explicit and round-trips cleanly through every config format we care about (env, YAML, JSON, CLI flags).

#### 3.3.2 Worked examples

```env
# All features defaulted (no env vars set) — Gemini Pro for transform/courseGen,
# Gemini Flash for roleplay/speechEval, Imagen + OpenAI TTS/STT.

# Pivot all text features to OpenRouter:
TEXT_PROVIDER=openrouter
TEXT_MODEL=anthropic/claude-sonnet-4-6     # capability-level default for all
                                            # 4 text features unless overridden

# Mixed: courseGen on Anthropic API, roleplay on local Claude CLI (free):
COURSE_GEN_PROVIDER=anthropic
COURSE_GEN_MODEL=claude-sonnet-4-6
ROLEPLAY_PROVIDER=cli/claude
# ROLEPLAY_MODEL unset — defaults to `claude` (PATH lookup)

# Override only the model, keep provider on default:
TRANSFORM_MODEL=gemini-3.1-pro-preview-002
```

#### 3.3.3 Capability matrix (provider × capability)

| Provider | text | text-to-image | text-to-speech | speech-to-text |
|---|:-:|:-:|:-:|:-:|
| `google` | ✅ | ✅ | — | — |
| `openai` | ✅ | ✅ | ✅ | ✅ |
| `anthropic` | ✅ | — | — | — |
| `ollama` | ✅ | — | — | — |
| `openrouter` | ✅ | — | — | — |
| `groq`¹ | ✅ | — | — | — |
| `cli/claude` | ✅ | — | — | — |
| `cli/gemini` | ✅ | — | — | — |

¹ `groq` is supported via the Settings UI only (uses OpenAI-compatible endpoint `https://api.groq.com/openai/v1`). It is not registered in `PROVIDERS_BY_CAPABILITY` and cannot be selected via env vars — attempting to do so will fail at route resolution time.

Selecting `cli/claude` for `IMAGE_GEN_PROVIDER` is rejected at module load with `InvalidProviderError` — a fail-fast guard, not a runtime surprise.

### 3.4 CLI Provider Internals

The CLI provider implements `LanguageModelV2` from `@ai-sdk/provider`. It sits underneath `generateObject` / `generateText` so the rest of the codebase is oblivious to whether it's talking to a SaaS API or a logged-in CLI process.

#### 3.4.1 Adapter interface (vendored from reachforge, trimmed)

```ts
// src/lib/ai/text/cli/adapter.ts
export interface CLIAdapter {
  readonly name: 'claude' | 'gemini';
  readonly command: string;
  execute(opts: AdapterExecuteOptions): Promise<AdapterResult>;
  probe(): Promise<AdapterProbeResult>;
}

export interface AdapterExecuteOptions {
  prompt: string;        // pre-assembled system+user prompt (no skills layer)
  cwd: string;           // working directory; defaults to os.tmpdir()
  timeoutSec: number;    // hard timeout
  abortSignal?: AbortSignal;
}

export interface AdapterResult {
  success: boolean;
  content: string;       // assistant final text, drained from stream-json
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };
  costUsd: number | null;
  errorMessage: string | null;
  errorCode: 'auth_required' | 'timeout' | 'parse_error' | 'unknown' | null;
}
```

We **drop** the `sessionId` / `extraArgs` / `skillPaths` fields from reachforge's interface. CoreFirst's LLM calls are stateless (the AI SDK gives us the full `prompt` each call, including chat history), there is no skill registry, and we do not need session resume.

#### 3.4.2 LanguageModelV2 wrapper

```ts
// src/lib/ai/text/cli/provider.ts (sketch)
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { ClaudeAdapter } from './adapters/claude';
import { GeminiAdapter } from './adapters/gemini';
import { injectJsonSchemaInstructions } from './schema';

export function createCliProvider(name: 'claude' | 'gemini', command: string): LanguageModelV2 {
  const adapter = name === 'claude'
    ? new ClaudeAdapter(command)
    : new GeminiAdapter(command);

  return {
    specificationVersion: 'v2',
    provider: `cli-${name}`,
    modelId: command,

    async doGenerate(options) {
      const prompt = renderPromptForCli(options.prompt);          // §3.4.3
      const finalPrompt = options.responseFormat?.type === 'json'
        ? injectJsonSchemaInstructions(prompt, options.responseFormat.schema)
        : prompt;

      const result = await adapter.execute({
        prompt: finalPrompt,
        cwd: process.cwd(),
        timeoutSec: 180,
        abortSignal: options.abortSignal,
      });

      if (!result.success) {
        throw mapAdapterError(result);                            // §3.4.4
      }

      return {
        content: [{ type: 'text', text: result.content }],
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cachedInputTokens: result.usage.cachedTokens,
          totalTokens: result.usage.inputTokens + result.usage.outputTokens,
        },
        finishReason: 'stop',
        warnings: [],
      };
    },

    async doStream(options) {
      // Phase 1: re-use doGenerate and emit a single text-delta + finish frame.
      // Phase 2 (optional): stream stream-json events through to LanguageModelV2 stream parts.
      const result = await this.doGenerate(options);
      return wrapAsSingleShotStream(result);
    },
  };
}
```

Three deliberate design decisions:

1. **No streaming optimization in v1.** `doStream` collapses to `doGenerate` + a one-shot emit. Real token-by-token streaming is possible (the CLIs already emit stream-json) but every consumer in CoreFirst calls `generateObject` or `generateText` with no streaming, so the optimization buys nothing today.

2. **Object mode via prompt injection, not native tool calling.** Neither the Claude CLI nor the Gemini CLI exposes structured-output mode the way the SDK does. `injectJsonSchemaInstructions` appends a schema-and-format block that the SDK's existing `mode: 'json'` handler is designed for; the SDK's built-in JSON repair / parse retries handle malformed output without us writing a parser.

3. **Skill / session features deliberately omitted.** Reachforge uses the CLIs as agents with their own filesystem state. CoreFirst uses them as text-in/text-out replacements for a SaaS API. Stripping skills/sessions is a clean simplification.

#### 3.4.3 Prompt rendering

`LanguageModelV2.doGenerate` receives a `LanguageModelV2Prompt` — an array of role-tagged parts (`system` / `user` / `assistant` / `tool`). Both Claude and Gemini CLIs accept a single text prompt. We flatten:

```
{system content}

[USER]: {user-1 content}
[ASSISTANT]: {assistant-1 content}
[USER]: {user-2 content}
...
```

Image/audio parts are not supported on the CLI path (they aren't supported by the CLIs themselves for this use case) — we throw `UnsupportedFunctionalityError` and let the SDK surface a clear error.

#### 3.4.4 Error mapping

| `AdapterErrorCode` | AI SDK error | UX |
|---|---|---|
| `auth_required` | `APICallError` with explicit message | Documented in README: run `claude login` / `gemini auth` |
| `timeout` | `APICallError` (retryable) | SDK retries per its built-in policy |
| `parse_error` | `NoObjectGeneratedError` (for object mode) | SDK's repair logic kicks in |
| `unknown` | `APICallError` | Surfaced to route handler |

#### 3.4.5 Probing on startup

`buildLanguageModel('cli/claude', ...)` calls `adapter.probe()` lazily on first use, not at module load, so a missing CLI doesn't break unrelated parts of the app. The probe result is cached for the process lifetime. `pnpm test` and unit tests inject a mock adapter to avoid real CLI calls.

### 3.5 Image / Speech / Transcription factories

Each modality gets a factory in the same shape as `text/factory.ts`, but trivially smaller (single-provider in v1 for TTS/STT, two-provider for image). Per §3.3, each is selected by its own `*_PROVIDER` env var with a sensible default that means "matches today's behavior".

The factories enforce the §3.3.6 capability matrix at module load: requesting `cli/claude` for image generation throws before any HTTP request is ever made. This catches misconfiguration at startup rather than at the first lesson generation 30 seconds in.

### 3.6 Video — out of scope

No video provider exists in v1. The `src/lib/ai/video/` directory is created as an empty `index.ts` placeholder with a `// reserved` comment so the modality split is visible in the source tree. When a video feature is proposed, the same pattern as image/speech (factory + sdk subdir) applies — no architectural decision required.

---

## 4. Storage Layer

### 4.1 Module Layout

```
src/lib/storage/
  index.ts            # public exports
  paths.ts            # data root, packages dir, records dir, slug helpers
  package.ts          # writePackage(manifest, audio, images): zip → data/packages/<slug>.corefirst
                      # readPackage(slugOrPath): { manifest, audio(blob), image(blob) }
  record.ts           # readRecord(packageId), writeRecord(packageId, mutator),
                      # appendAttempt, appendTransform, appendRoleplaySession
  schema.ts           # Zod schemas for ManifestSchema, RecordSchema (per package-format.md)
  errors.ts           # PackageNotFoundError, RecordCorruptError, ...
```

### 4.2 Public API surface

```ts
// Package writes (course generation)
writePackage(input: { manifest, audioPerScript: Map<string, Buffer>, imagesPerLesson: Map<number, Buffer> }): Promise<{ packageId: string; slug: string; path: string }>

// Package reads (study session)
readPackageManifest(packageId: string): Promise<CoursewareManifest>
readPackageAudio(packageId: string, lesson: number, script: number): Promise<Buffer>
readPackageImage(packageId: string, lesson: number): Promise<Buffer | null>

// Record writes
appendAttempt(packageId: string, lesson: number, script: number, attempt: AttemptEntry): Promise<void>
appendTransform(packageId: string | null, transform: TransformEntry): Promise<void>
appendRoleplaySession(packageId: string | null, session: RoleplaySessionEntry): Promise<void>

// Record reads
readRecord(packageId: string): Promise<CFRecord | null>
listRecords(): Promise<{ packageId: string; slug: string; lastStudiedAt: string }[]>
```

`packageId | null` parameters on `appendTransform` / `appendRoleplaySession` exist because Transform and Roleplay can be invoked outside of a course context. When `null`, the entry is appended to a synthetic `data/records/_global.cfrecord` per the Phase 1 conventions in `learning-architecture.md` §"Persistence (Phase 1)" — the doc doesn't pin a specific filename, so we declare `_global.cfrecord` here and add a one-line note to `storage-design.md`.

### 4.3 Concurrency strategy

`.cfrecord` writes are append-mostly but multi-field. We use **read-modify-write under a per-file mutex** (`async-mutex` or a hand-rolled `Map<string, Promise<void>>` queue). Two reasons over file-locks (`proper-lockfile`):

- All callers run in the same Node process (Next.js server). No external lock semantics needed.
- A 1-line mutex is dependency-free and Edge-runtime-friendly if we ever move routes to Edge.

Writes are atomic-ish: serialize JSON → write to `<file>.tmp` → `fs.rename` over the original. Crash safety is "either fully old or fully new", which is sufficient given the user-driven write rate (one append per voice attempt).

### 4.4 Migration

`dev.db` is dropped. Existing local users lose any local progress. We document this in `CHANGELOG.md` under "Breaking changes — 0.2.0". No automated migration path; this is a pre-1.0 OSS project and the doc has been signaling "no DB" since the initial design phase.

`prisma/`, `prisma.config.ts`, `db:generate`, `db:migrate*` scripts, and the `@prisma/*` / `@libsql/client` dependencies all leave the repo in this refactor.

---

## 5. Three-Mode Phase 1 Persistence

Per `docs/learning-architecture.md` §"Phased Integration Plan — Phase 1", every mode has a write-back path even before cross-mode integration arrives in Phase 3.

| Mode | Trigger | Write |
|---|---|---|
| Transform | `POST /api/transform` 200 response | `appendTransform(packageId?, { inputText, sourceLang, targetLang, cfltL1, cfltL2, standardL2, createdAt })` |
| Course | `POST /api/generate-course` 200 response | `writePackage(...)` — full ZIP |
| Course | `POST /api/speech-eval` 200 response (with `packageId`) | `appendAttempt(packageId, lesson, script, { ... })` |
| Roleplay | `POST /api/roleplay` final response of a session | `appendRoleplaySession(packageId?, { context, sourceLang, targetLang, messages, createdAt })` |

Two open questions resolved here so implementation isn't blocked:

1. **Roleplay session boundary.** Phase 1 has no explicit "session start / session end" event. We append on **every** `/api/roleplay` POST, but the route accepts an optional `sessionId` (UUID minted by the client on its first turn) and updates the existing entry's `messages[]` if it matches — equivalent to upsert. New session = new UUID = new entry.

2. **Linking transforms/roleplay to packages.** Phase 1 doc says Transform persists to `.cfrecord transforms[]`; if no package is open, it goes to `_global.cfrecord`. The `packageId` parameter in the API is optional and supplied by the UI when the user is in a course context.

---

## 6. Migration Order (Historical)

The refactor shipped as the sequence below. Kept on record so anyone tracing why a particular module looks the way it does can locate the originating PR. All six steps are merged into `main`.

1. **PR-1: AI module skeleton + capability split.** Create `src/lib/ai/` with one subdir per capability (`text/`, `text-to-image/`, `text-to-speech/`, `speech-to-text/`) plus three video stubs (`text-to-video/`, `image-to-video/`, `multimodal-to-video/`). Port the existing SDK behavior with no functional change. Introduce capability-level (`TEXT_PROVIDER`, `TEXT_TO_IMAGE_PROVIDER`, `TEXT_TO_SPEECH_PROVIDER`, `SPEECH_TO_TEXT_PROVIDER`) and feature-level (`TRANSFORM_PROVIDER`/`TRANSFORM_MODEL`, etc.) env vars. Enforce the capability matrix at module load. Update one consumer (`src/core/transformer.ts`) as a smoke test. *Pure refactor + naming cleanup, no behavioral change.*
2. **PR-2: CLI provider (text only).** Vendor reachforge adapters into `src/lib/ai/text/cli/`, wire `LanguageModelV2` wrapper, register `cli/claude` / `cli/gemini` in the text factory. Add unit tests with a mock adapter. Document the two new env-var values in `docs/tech-design.md`. *Adds CLI capability for text; image/TTS/STT unaffected.*
3. **PR-3: Storage module + course generation.** Create `src/lib/storage/`, switch `/api/generate-course` to write `.corefirst`. Behind a feature flag (`COREFIRST_STORAGE=files`) so we can flip atomically. *Course mode keeps working via Prisma until flag is flipped.*
4. **PR-4: Voice attempts + progress.** Switch `/api/speech-eval` and `/api/progress` to `.cfrecord`. Flip the flag default to `files`. *Prisma reads remain as a fallback for one release.*
5. **PR-5: Drop Prisma.** Remove `src/lib/db.ts`, `prisma/`, `@prisma/*` deps, `db:*` scripts. Update `package.json`, `.gitignore`, `tests/`. *Cleanup.*
6. **PR-6: Phase 1 transform/roleplay persistence.** Wire `appendTransform` / `appendRoleplaySession` into `/api/transform` and `/api/roleplay`. *New behavior, no migration concerns.*

Total: roughly 6 PRs, each scoped to ~200–600 lines. The CLI provider work (PR-2) is independent of storage and can ship in parallel with PR-3 if two contributors are working.

---

## 7. Open Questions

1. **(Resolved.)** ~~Default tier for CLI providers.~~ Tiers were removed in favor of per-feature config; this question no longer applies. Each feature picks its own model directly.
2. **Progress dashboard scope under file storage.** `prisma.session.findMany({ include: { attempts: true } })` is one query; `listRecords()` over `data/records/*.cfrecord` is N file reads. At &lt;100 packages this is fine. Add an in-memory cache in PR-4 only if profiling shows it matters.
3. **`_global.cfrecord` schema.** The package-format spec describes per-package records. A global record reuses the same shape but with `packageId: null` and ignores `lessons[]`. We should formalize this in `docs/storage-design.md` before PR-6 lands.
4. **CLI auth UX.** When `cli/claude` returns `auth_required`, where does the error surface? Options: 500 from the API route (current SDK behavior on auth failures), or a dedicated 503 with a hint. Lean: 500 with `{ error: "Claude CLI not authenticated. Run `claude login`." }` body so the existing UI error path handles it.
5. **Test strategy for CLI provider.** No real CLI in CI. We unit-test against a fake `CLIAdapter`; we add a documented `pnpm test:cli` for local smoke tests against a real CLI. The full Vitest suite stays hermetic.

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| CLI stream-json format drift between Claude/Gemini versions | Medium — silent parse failures | Pin tested CLI versions in `docs/tech-design.md`; emit a one-line `[cli/claude] Unrecognized event: ...` warning when parser hits an unknown event type |
| AI SDK V6's `LanguageModelV2` shape changes | Low — `ai@^6.0.175` is current; V6 is settled | Pin `ai` to a minor range; integration tests catch regressions |
| File-based progress dashboard slow on large `data/` | Low — practical scale is &lt;100 records | See §7 #2; profile before optimizing |
| Concurrent writes from two routes corrupt `.cfrecord` | Medium | Per-file mutex + atomic rename (§4.3) |
| Dropping Prisma breaks anyone running `pnpm dev` against an old `dev.db` | Low — pre-1.0 OSS, no real users | CHANGELOG entry; `dev.db` is gitignored so no code change is destructive |

---

## 9. Out of Scope (Tracking)

These are deliberately **not** part of this refactor. They will be tracked as separate issues if/when the time comes:

- Streaming token output through the CLI provider's `doStream`.
- Reach-style skill resolver / session manager for CLI providers.
- Codex CLI provider (reachforge has it; no demand in CoreFirst).
- Phase 2 per-element CFLT sub-scores, Phase 3 cross-mode vocabulary, Phase 4 SM-2.
- Replacing the Vercel AI SDK with a hand-rolled abstraction.
- ~~Authentication / multi-user~~ → **Shipped (v0.3.0):** UUID-based multi-user identity and household profile switcher. See `docs/features/user-identity.md`. Multi-tenant SaaS auth (login, passwords, hub.corefirst.world) remains deferred.
- Per-request TTS/STT key overrides (base URL supported; per-request API key overrides for TTS/STT deferred).

---

## 10. References

- `docs/prd.md` — product requirements (extension points table)
- `docs/tech-design.md` — companion tech design covering the rest of the system
- `docs/storage-design.md` — `.corefirst` / `.cfrecord` formats
- `docs/package-format.md` — full schemas for both file types
- `docs/learning-architecture.md` — three-mode integration phases
- `../reachforge/src/llm/` — reference implementation of the CLI adapter pattern
- `@ai-sdk/provider` — `LanguageModelV2` interface spec
