# Technical Design — CoreFirst

> Software version: 0.6.0 | Status: Active | Last Updated: 2026-05-16  
> Companion document to: `docs/prd.md`

### Changelog — v0.6.0 (2026-05-16)

| Area | Change |
|---|---|
| **Desktop App** | Electron wrapper (`electron/main.ts`) bundles the Next.js standalone server. Launched via `corefirst app`. Three startup modes: attach to existing dev server, load pre-built standalone, or spawn `next dev` on first run. Window: 1280×820 px, dark theme, per-process `COREFIRST_DATA_DIR` to avoid conflicts with concurrent web servers. |
| **i18n** | `src/lib/ui-i18n.ts` — 130+ key dictionary covering 8 UI languages (English, Chinese, Japanese, Korean, Vietnamese, Spanish, French, German). `tr(uiLang, key, ...args)` wrapper used across all components. LLM rationales localized via `{{UI_LANG}}` injected into system prompts. |
| **Ollama visual provider** | `src/core/visuals/ollama-provider.ts` — local offline image generation. Dual-path: OpenAI-compatible `/v1/images/generations` with native `/api/generate` fallback. Default model: `x/z-image-turbo:latest`. |
| **AI provider test CLI** | `src/cli/test-ai.ts` — validates LLM / TTS / STT / image connectivity end-to-end; saves generated artifacts to `data/tmp/`. |
| **Provider check** | `hasProvider()` in `src/cli/utils/config-store.ts` — gates CLI commands; fails fast if no provider key or `GLOBAL_PROVIDER` is configured. |
| **OpenRouter migration** | OpenRouter provider migrated from custom adapter to `@ai-sdk/openai`; TTS requests gain an explicit timeout; transformer `maxTokens` cap added. |
| **Strict Zod schemas** | OpenAI text routes use OpenAI Structured Outputs (strict mode). Default TTS and STT model identifiers updated. |
| **Image size normalization** | `parseSize()` utility extracts width/height from any size string; used by Qwen Wanx and Ollama providers for consistent aspect-ratio handling. |
| **Google key rename** | `GOOGLE_API_KEY` renamed to `GOOGLE_GENERATIVE_AI_API_KEY`; legacy name kept as fallback. CLI config key `google.key` maps to the new name. |
| **Footer component** | Semantic `<footer>` with copyright, website link (`corefirst.world`), and GitHub link. |
| **ProfileSwitcher** | Compact inline header layout replaces previous modal-based switcher. SRS due-date calculations are timezone-safe. |
| **CourseHistory** | Course lesson rendering extracted from `app/page.tsx` into a dedicated `CourseHistory` component. |

### Changelog — v0.5.0 (2026-05-14)

| Area | Change |
|---|---|
| **Qwen provider suite** | Qwen TTS (`src/core/tts/qwen-provider.ts`, model `qwen3-tts-flash`, voice `Cherry`); Qwen STT (`src/core/stt/qwen-provider.ts`, Paraformer/SenseVoice, async-poll architecture); Qwen Wanx image (`src/core/visuals/qwen-provider.ts`, `wanx-v1`, async job polling). All use `DASHSCOPE_API_KEY`. |
| **Google Gemini TTS voices** | Multi-voice support added to the Google Gemini TTS provider. |
| **Model selection UI + disk persistence** | Settings panel gains per-provider model presets and a free-text model override. Config is persisted to `~/.corefirst/config.json` via the CLI config store and reloaded at next start. |
| **ComboBox component** | `components/ComboBox.tsx` — searchable, keyboard-navigable dropdown replacing `<datalist>` for domain and scenario inputs. Supports custom free-text values; ARIA-compliant. |
| **History pagination** | Load-more pagination for Transform, Roleplay, and Course history lists. |
| **Domain rename** | `industry` / `industry_context` renamed to `domain` / `domain_context` everywhere. One-time migration utility converts existing learner records. |
| **AI config externalization** | Provider configuration moved to hot-reloadable dynamic modules; `/api/config/refresh` endpoint forces reload without restart. |
| **Young learner safeguards** | `AGE_GROUP_GUIDANCE` + `DOMAIN_GUIDANCE` injected into courseware prompts; `auditScript` (permissive) used instead of strict CFLT correction for "Young Child" age group. |
| **Language code mapping** | Speech evaluator maps UI language names to BCP-47 locale codes so transcription targets the correct locale. |
| **Roleplay robustness** | Strict slot-level Zod validation + flexible multi-format slot parsing + JSON salvage path for malformed model responses. |
| **Standardized AI factories** | All AI service factories share a unified request-context pattern; `getHeaders` included in effect dependency arrays for audio playback and transcription. |

### Changelog — v0.3.1 (2026-05-13)

| Area | Change |
|---|---|
| **Skills system** | New `src/lib/skills/` module — user-editable prompt templates per feature slot. `loadSkill()` replaces `loadPrompt()` in all routes; falls back to system `.md` files when no preference set. See `docs/features/skills.md`. |
| **Prompt templates** | All 9 LLM prompts extracted to `.md` files with `{{VAR}}` template syntax. `validatePromptTemplate()` added to `loader.ts` for syntax validation before save. |
| **Provider registry** | All 6 factory files (`text`, `text-to-speech`, `speech-to-text`, `text-to-image`, `src/core/tts`, `src/core/stt`) converted from `switch` statements to `Map`-based registries. New providers call `register*()` without modifying factory source. |
| **Provider defaults** | `PROVIDER_DEFAULT_MODELS` (constants.ts) removed. Single source: `PROVIDER_DEFAULTS` in `capabilities.ts` + `getDefaultTextModel(provider)` helper. `groq` added to `PROVIDERS_BY_CAPABILITY.text` (was previously missing despite being registered in factory). |
| **Per-feature headers** | `resolveFeatureFromSettings()` now reads `x-cf-{feature}-provider` / `x-cf-{feature}-model` headers, enabling per-feature model overrides from the client without affecting other features. |
| **Request context** | `src/lib/ai/request-context.ts` — shared `resolveTextContext`, `resolveTTSContext`, `resolveSTTContext` helpers eliminate 3-line boilerplate repeated across routes. |
| **Community backend** | Publish/fork/like/community-browse API routes and shared PouchDB catalog are implemented but the UI tab is hidden — reserved for corefirst-world cloud integration. |

---

## 1. Architecture Overview

CoreFirst currently operates as a **monolithic Next.js application** with a clear internal module boundary. All AI interactions are server-side (API Routes), keeping LLM credentials and prompt logic away from the browser.

### 1.1 [Roadmap] Adaptive Omni-Platform Architecture

To support the vision of a 100% private, BYOK (Bring Your Own Key) ecosystem across Desktop and Mobile, CoreFirst is migrating towards an **Adaptive Omni-Platform Architecture**:

1. **Desktop Hub (macOS/Windows) — The Powerhouse**
   - **Tech Stack:** Electron wrapping the Next.js application (embedded Node.js runtime).
   - **Role:** Full capabilities. Runs local AI (Ollama, Docker TTS/STT), executes CLI commands (Claude/Gemini CLI), and generates `.corefirst` course packages locally without cloud dependence.

2. **Mobile Companion (iOS/Android) — The Consumer**
   - **Tech Stack:** Capacitor wrapping the statically exported React UI.
   - **Role:** Pure client. Cannot run local Docker/CLI due to OS sandbox constraints. Connects directly to Cloud AI via user-provided API keys (BYOK) for generation, OR syncs via LAN to the Desktop Hub to download pre-generated courses and sync PouchDB progress.

3. **Hybrid AI Provider Layer**
   - An adaptive interface that detects the runtime environment. On Desktop, it unlocks Local + Cloud providers. On Mobile, it restricts to Cloud-only APIs or delegates heavy generation tasks to a LAN-connected Desktop Hub.

```
┌─────────────────────────────────────────────────────┐
│                   Browser (React 19)                 │
│  Settings  ProfileSwitcher  CFLTBlock  CFLTBuilder   │
│  CFLTDemo  VoiceChallenge                            │
│  TransformHistory  RoleplayHistory  CourseHistory    │
│                                                     │
│  useSettings → localStorage cf_settings_{uuid}      │
│     ↓ getHeaders() on every fetch                   │
│  x-cf-provider / x-cf-api-key / x-cf-model          │
│  x-cf-tts-url / x-cf-stt-url / x-cf-ollama-url      │
└───────────────────┬─────────────────────────────────┘
                    │ HTTP (fetch + x-cf-* headers)
                    │ + X-User-Id header / cf_user_id cookie
┌───────────────────▼─────────────────────────────────┐
│         middleware.ts (Next.js Proxy)                │
│  Auto-assigns cf_user_id=<uuid> cookie on 1st visit  │
└───────────────────┬─────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────┐
│             Next.js API Routes (Edge/Node)            │
│  /transform  /generate-course  /speech-eval  /tts    │
│  /roleplay   /generate-image   /progress  /transcribe│
│  /verify-key                                         │
│  /courses/[slug]  (GET, DELETE, PATCH)                │
│  /history/transforms  (GET, DELETE)                   │
│  /history/roleplay/sessions  (GET, DELETE, PATCH)     │
│  /history/roleplay/messages  (DELETE)                 │
│  /history/courses  (GET)  /media/[filename]  (GET)    │
│                                                     │
│  extractSettings(request) → resolveFeatureFromSettings│
│    → per-request model override from x-cf-* headers  │
└─────┬──────────────┬──────────────┬─────────────────┘
      │              │              │
 ┌────▼─────┐  ┌─────▼─────┐  ┌─────▼───────┐
 │  Text    │  │   Image   │  │  TTS / STT  │
 │  google  │  │  google   │  │   openai    │
 │  openai  │  │  openai   │  │             │
 │  anthropic│  └───────────┘  └─────────────┘
 │  ollama  │
 │  openroutr│
 │  cli/claude│  (subprocess — local subscription, no API key)
 │  cli/gemini│
 └────┬─────┘
      │
┌─────▼───────────────────────────────────────────────┐
│              src/  (TypeScript modules)               │
│  core/transformer.ts   core/system_prompt.md          │
│  generator/orchestrator.ts  generator/courseware_prompt.md │
│  generator/package-builder.ts  (audio + image CAS)    │
│  lib/ai/  (text/image/speech/transcription/video)     │
│  lib/auth/user.ts  (userId: x-user-id header → cookie)│
│  lib/constants.ts  (USER_ID_COOKIE, PROVIDER_DEFAULTS)│
│  lib/ai/settings-config.ts  (extractSettings, resolve)│
│  lib/ai/errors.ts  (classifyAIError)                  │
│  lib/ai/request-config.ts  (buildBYOKModel for verify)│
│  lib/storage/  (paths, PouchDB provider, package, record,│
│                 schemas, migrations, hash)            │
│  core/tts/   core/visuals/   (provider façades)       │
└──────────────────────────┬──────────────────────────┘
                           │ fs + PouchDB
                    ┌──────▼──────────────────────┐
                    │  data/users/<userId>/        │
                    │  ├─ packages/   *.json,      │
                    │  │              *.corefirst  │
                    │  ├─ media/      <hash>.mp3,  │
                    │  │              <hash>.webp  │
                    │  └─ records/    db_states/   │
                    │                 db_events/   │
                    │                 db_srs/      │
                    └─────────────────────────────┘
```

---

## 2. Module Breakdown

### 2.1 Core Engine (`src/core/`)

| File | Responsibility |
|------|---------------|
| `transformer.ts` | CFLT transformation logic: loads system prompt, calls `generateObject` against `CFLTResponseSchema`, returns parsed object |
| `system_prompt.md` | Language-agnostic system prompt with `{{SOURCE_LANG}}` / `{{TARGET_LANG}}` / `{{UI_LANG}}` placeholders |
| `tts/` | TTS provider interface + factory + OpenAI, Google Gemini, and Qwen (CosyVoice) implementations |
| `visuals/` | Image-generation provider interface + factory + Imagen, OpenAI, Qwen Wanx, and Ollama implementations |

The shared model registry lives in `src/lib/ai/`, split per *capability* (text, text-to-image, text-to-speech, speech-to-text, plus three video stubs). Consumers import the pre-built model for the specific *feature* they implement: `transformModel`, `courseGenModel`, `roleplayModel`, `speechEvalModel`, `imageGenModel`, `ttsModel`, `sttModel`. There is no separate `client.ts` wrapper — the Vercel AI SDK is the abstraction. Subscription CLIs (Claude / Gemini) plug in as a custom `LanguageModelV3` so call sites are oblivious to whether text comes from a cloud API or a local subprocess.

**Key design decision:** `CFLTTransformer.transform(input, sourceLang, targetLang)` is effectively pure given a fixed model — no DB writes, no global state — and is exercised against the canonical vectors in `tests/core/test_vectors.md`.

### 2.2 Generator (`src/generator/`)

| File | Responsibility |
|------|---------------|
| `orchestrator.ts` | `CoursewareOrchestrator.generate()` — assembles prompt, calls `generateObject` against `CoursewareManifestSchema`, then re-runs each script through `CFLTTransformer` for a CFLT self-audit |
| `courseware_prompt.md` | Pedagogical prompt template; same `{{SOURCE_LANG}}` / `{{TARGET_LANG}}` placeholder convention |

**SSML handling:** Each `LessonScript` carries its own `ssml` field produced directly by the LLM following the courseware prompt's instructions; there is no post-processing pass. Per-script `ssml` replaces the earlier per-lesson `audio_prosody_hints` design.

### 2.3 API Routes (`app/api/`)

Each route is a thin adapter: validate input → call core module → return JSON. No business logic lives in routes.

Every route reads `userId` via `getUserId(request)` from `src/lib/auth/user.ts` (resolution order: `X-User-Id` header → `cf_user_id` cookie → `COREFIRST_DEFAULT_USER` env → `'local'`). The id is whitelist-normalized so an attacker cannot use it to traverse out of their namespace.

Every route that consumes a `[slug]` URL param validates it against `/^[a-z0-9-]+$/` before any storage call, blocking path traversal via `..` segments.

| Route | Core Module | External Service | Storage Side Effects |
|-------|------------|-----------------|----------------------|
| `POST /api/transform` | `src/core/transformer.ts` | Text (per `TEXT_PROVIDER`) | Append per-event doc to `events/<slug>:transform:<isoTime>:<rand>` |
| `POST /api/generate-course` | `src/generator/orchestrator.ts` + `src/generator/package-builder.ts` | Text + Image + TTS | Write `data/users/<userId>/packages/<slug>.json` (Lite) + optional `.corefirst` ZIP; populate CAS pool; run `pruneOrphanMedia` |
| `POST /api/speech-eval` | inline prompt | STT + Text | Append per-event doc to `events/<slug>:attempt:<lesson>:<script>:<isoTime>:<rand>`; capture vocabulary into SRS deck |
| `POST /api/tts` | `src/core/tts/factory.ts` | TTS (`gpt-4o-mini-tts`) | CAS-cached at `data/users/<userId>/media/<hash>.mp3`; only synthesizes on cache miss |
| `POST /api/roleplay` | inline | Text (multi-turn) | Upsert session metadata doc; append per-message doc per turn; CAS-cache user audio + corrected audio |
| `POST /api/transcribe` | inline | STT | None |
| `POST /api/generate-image` | `src/core/visuals/factory.ts` (façade) → `src/lib/ai/text-to-image/factory.ts` | Image (per `IMAGE_GEN_PROVIDER` / `TEXT_TO_IMAGE_PROVIDER`) | CAS-cached in per-user media pool |
| `GET /api/progress` | `src/lib/storage` | None | Aggregates per-user `events` + `srs` collections |
| `GET /api/courses/[slug]` | `src/lib/storage` | None | Reads Lite manifest |
| `DELETE /api/courses/[slug]` | `src/lib/storage` | None | 5-step cascade (manifest + state + events + vocab back-links + media GC); returns 200 on full success, 207 with `{ok:false, steps, errors}` on partial |
| `PATCH /api/courses/[slug]` | `src/lib/storage` | None | Renames manifest `topic` (slug immutable) |
| `GET /api/history/transforms` | `src/lib/storage` | None | `listTransformEvents(userId)` over `events` collection, MAX 200 |
| `DELETE /api/history/transforms/[eventId]` | `src/lib/storage` | None | Tombstones one transform event doc (idempotent) |
| `GET /api/history/roleplay` | `src/lib/storage` | None | `listRoleplaySessions(userId)` over `events` collection, MAX 100 |
| `DELETE /api/history/roleplay/sessions/[sessionId]?slug=…` | `src/lib/storage` | None | Cascade-tombstone session metadata + all messages |
| `PATCH /api/history/roleplay/sessions/[sessionId]?slug=…` | `src/lib/storage` | None | Renames session `context` |
| `DELETE /api/history/roleplay/messages/[eventId]` | `src/lib/storage` | None | Tombstones one message doc |
| `GET /api/history/courses` | `src/lib/storage` | None | Per-user `listPackages` |
| `GET /api/media/[filename]` | `src/lib/storage` | None | Resolves filename against per-user CAS pool; validates filename regex |

### 2.4 Frontend Components (`components/`)

| Component | Purpose |
|-----------|---------|
| `CFLTBlock.tsx` | Renders a single CRST analysis: color-coded sequence blocks + corrections |
| `CFLTBuilder.tsx` | Practice mode (opt-in): drag-and-drop sentence sorter (Framer Motion Reorder) |
| `CFLTDemo.tsx` | Learn mode (default): animated CRST decomposition showing `standard_l1` → four blocks |
| `CFLTVisual.tsx` | Visual CRST sequence diagram |
| `CFLTChat.tsx` | Chat interface for Roleplay |
| `VoiceChallenge.tsx` | Audio recorder + score display |
| `ProgressDashboard.tsx` | Recharts analytics: score trend, vocabulary mastery |
| `TransformHistory.tsx` | Transform event list + per-entry delete |
| `RoleplayHistory.tsx` | Roleplay session list + session rename/delete + per-message delete |
| `CourseHistory.tsx` | Course list + per-row open/rename/delete |
| `ComboBox.tsx` | Searchable, keyboard-navigable dropdown (ARIA combobox) for domain and scenario inputs; supports free-text custom values |
| `Settings.tsx` | Two-tab settings modal: AI provider/key/model config + profile management; settings persisted to `~/.corefirst/config.json` |

UI strings are externalized via `src/lib/ui-i18n.ts` (`tr(uiLang, key)` calls). Components receive `uiLang: SupportedLang` as a prop; the dictionary covers 8 languages (English, Chinese, Japanese, Korean, Vietnamese, Spanish, French, German).

### 2.5 Hooks (`hooks/`)

| Hook | Purpose |
|------|---------|
| `useRecorder.ts` | MediaRecorder wrapper; exposes `start()`, `stop()`, returns audio `Blob` |
| `useSettings.ts` | Reads/writes `cf_settings_{uuid}` in localStorage; provides `getHeaders()` for BYOK fetch calls |

---

## 3. Data Model

CoreFirst persists data through a per-user hybrid: PouchDB for structured records, filesystem for media and course manifests. Everything is partitioned by `userId` under `data/users/<userId>/`.

- **`data/users/<userId>/packages/<slug>.json`** — Lite course manifest (V3 primary form): full `PackageManifest` with media referenced by hash. Editable: `topic` via `PATCH`; immutable: `slug` (it's the join key for every event doc).
- **`data/users/<userId>/packages/<slug>.corefirst`** — Optional Full ZIP for sharing/export. Bundles the manifest + media for offline distribution.
- **`data/users/<userId>/media/<hash>.<ext>`** — Per-user CAS pool. Audio (`<hash>.mp3`) keyed by `sha256(ssml)`, images (`<hash>.webp`) keyed by `sha256(prompt)`. Swept by `pruneOrphanMedia(userId)` after every package rewrite and delete.
- **`data/users/<userId>/records/db_states/`** — PouchDB LevelDB for the `states` collection: per-slug lesson/script progress flags.
- **`data/users/<userId>/records/db_events/`** — PouchDB LevelDB for the `events` collection: **per-event** documents (transforms, attempts, roleplay sessions, roleplay messages). Each event is its own doc, ID-prefixed by slug.
- **`data/users/<userId>/records/db_srs/`** — PouchDB LevelDB for the `srs` collection: single doc `user` holding the global vocabulary deck (composite key `(targetLang, token)`).

**Conflict-safe writes**: the storage layer uses two primitives:
- `db.put(coll, newUniqueId, …)` for append-only events (no conflicts because IDs are unique)
- `db.mutate(coll, id, mutator)` for shared docs (state flags, SRS deck) — re-runs the mutator on every 409 against the freshly-read document, so concurrent writers compose instead of clobbering

The previous "per-file mutex + tmp+rename atomic write" model has been replaced by PouchDB revisions and tombstones; the only remaining filesystem-level atomic write is the manifest JSON (single writer per slug; concurrent writes for the same slug are impossible by construction).

Schemas are defined in `src/lib/storage/schema.ts`; the full on-disk specification lives in `docs/package-format.md`.

**`logicStress`** is a CoreFirst-specific metric persisted in each attempt event: it measures whether the learner correctly stressed the `[Core Action]` block in speech, reinforcing the CRST cognitive protocol at the phonetic level.

---

## 4. Type System

### 4.1 CFLT Output Schema (Zod)

Defined in `src/types/cflt.ts`:

```typescript
const CorrectionSchema = z.object({
  type: z.enum(['logic', 'grammar', 'vocabulary']),
  original: z.string(),
  replacement: z.string(),
  reason: z.string(),
});

const CFLTResponseSchema = z.object({
  is_cflt_compliant: z.boolean(),
  cflt_l1: z.string(),          // Native language, Core-First order
  cflt_l2: z.string(),          // Target language, CFLT token-swap
  standard_l2: z.string(),      // Idiomatic polished output
  standard_l1: z.string(),      // Back-translated native reference
  corrections: z.array(CorrectionSchema),
});
```

### 4.2 Courseware Manifest Schema

Defined in `src/types/courseware.ts`:

```typescript
const LessonScriptSchema = z.object({
  speaker: z.string(),
  cflt_l1: z.string(),
  cflt_l2: z.string(),
  standard_l2: z.string(),
  ssml: z.string(),             // Per-script SSML with prosody on Core blocks
});

const LessonSchema = z.object({
  title: z.string(),
  scenario_description: z.string(),
  cflt_scripts: z.array(LessonScriptSchema),
  visual_generation_prompts: z.array(z.string()),
  vocabulary_focus: z.array(z.object({
    token: z.string(),
    meaning: z.string(),
  })),
});

const CoursewareManifestSchema = z.object({
  age_group: z.string(),
  industry_context: z.string(),
  topic: z.string(),
  lessons: z.array(LessonSchema),
});
```

---

## 5. LLM Prompt Architecture

### 5.1 Transformer System Prompt Strategy

The system prompt (`src/core/system_prompt.md`) enforces:
1. **Protocol declaration:** Defines the four-element CFLT sequence as an inviolable rule
2. **Language agnosticism:** Uses `{source_lang}` / `{target_lang}` placeholders
3. **JSON-only output:** Instructs the model to return only valid JSON matching `CFLTBlockSchema`
4. **Correction annotation:** Requires `reason` fields to cite the specific CFLT rule violated

### 5.2 Courseware Prompt Strategy (`src/generator/courseware_prompt.md`)

- **Persona injection:** Age group and industry context are injected as persona constraints
- **Structural constraint:** Every generated sentence must pass an internal CFLT audit instruction
- **SSML instruction:** Explicit rules for prosody tag placement around Core Action blocks; the LLM emits the `ssml` string per script directly
- **Self-audit pass:** After generation, `CoursewareOrchestrator` re-runs each script's `standard_l2` through `CFLTTransformer` and overwrites `cflt_l1` / `cflt_l2` with the audited values

### 5.3 Phonetic Bridge Prompt (`/api/speech-eval`)

Embeds a Pinyin→IPA reference table and instructs the evaluator to:
1. Score pronunciation against IPA targets
2. Score `logic_stress` — whether the `[Core Action]` phonetic block received natural emphasis
3. Provide articulation feedback using Pinyin analogies as reference points

---

## 6. Extension Guide

### Adding a New Language Pair

1. Add a system prompt template variant in `src/core/system_prompt.md` parameterized with the new `source_lang` / `target_lang`
2. Add UI selector option in the frontend language picker
3. Add test vectors to `tests/core/test_vectors.md`

No core logic changes required.

### Swapping AI providers

The AI provider layer is organized along two axes — **capabilities** (kinds of model interface) and **features** (use sites in the app). Each feature has its own model configuration knob; capability-level defaults catch features that don't override.

#### Resolution precedence (per feature)

```
<FEATURE>_PROVIDER  >  <CAPABILITY>_PROVIDER  >  baked-in default
<FEATURE>_MODEL     >  <CAPABILITY>_MODEL     >  baked-in default
<FEATURE>_BASE_URL  >  <CAPABILITY>_BASE_URL  >  provider default (real OpenAI URL etc.)
<FEATURE>_API_KEY   >  <CAPABILITY>_API_KEY   >  provider default (OPENAI_API_KEY etc.)
```

`BASE_URL` and `API_KEY` are only consumed by the `openai` provider today (it uses them to retarget at any OpenAI-compatible local server: Kokoro-FastAPI, faster-whisper-server, LM Studio, vLLM, etc.). Other providers ignore them.

#### Features

| Feature | Capability | Default provider | Default model | Used by |
|---|---|---|---|---|
| `transform` | text | `google` | `gemini-3.1-pro-preview` | `src/core/transformer.ts` |
| `courseGen` | text | `google` | `gemini-3.1-pro-preview` | `src/generator/orchestrator.ts` |
| `roleplay` | text | `google` | `gemini-3-flash-preview` | `/api/roleplay` |
| `speechEval` | text | `google` | `gemini-3-flash-preview` | `/api/speech-eval` |
| `imageGen` | text-to-image | `google` | `imagen-4.0-generate-001` | `src/core/visuals/imagen-provider.ts` |
| `tts` | text-to-speech | `openai` | `gpt-4o-mini-tts` | `src/core/tts/openai-provider.ts` |
| `stt` | speech-to-text | `openai` | `gpt-4o-mini-transcribe` | `/api/transcribe`, `/api/speech-eval` |

#### Provider catalog

| Capability | Providers (env value) | Notes |
|---|---|---|
| `text` | `google`, `openai`, `anthropic`, `ollama`, `groq`, `openrouter`, `qwen`, `deepseek`, `cli/claude`, `cli/gemini` | CLI providers wrap the local subprocess as a custom `LanguageModelV3`; `<FEATURE>_MODEL` for CLI is a command-path override |
| `text-to-image` | `google` (Imagen), `openai` (`gpt-image-1`), `qwen` (Wanx), `ollama` | `qwen` uses async job polling; `ollama` tries OpenAI-compat endpoint first with native API fallback |
| `text-to-speech` | `openai` (`gpt-4o-mini-tts`; also covers OpenAI-compat local servers via `TTS_BASE_URL`), `google` (Gemini TTS, multi-voice), `qwen` (CosyVoice, `qwen3-tts-flash`) | No CLI option |
| `speech-to-text` | `openai` (`gpt-4o-mini-transcribe`; also OpenAI-compat via `STT_BASE_URL`), `google` (Gemini STT), `qwen` (Paraformer / SenseVoice, async-poll) | No CLI option |
| `text-to-video` / `image-to-video` / `multimodal-to-video` | (none — stubs) | Throw `NotImplementedError` on use |

#### Capability matrix (provider × capability)

| Provider | text | text-to-image | text-to-speech | speech-to-text |
|---|:-:|:-:|:-:|:-:|
| `google` | ✅ | ✅ | ✅ | ✅ |
| `openai` | ✅ | ✅ | ✅ | ✅ |
| `anthropic` | ✅ | — | — | — |
| `ollama` | ✅ | ✅ | — | — |
| `groq` | ✅ | — | — | — |
| `openrouter` | ✅ | ✅ | ✅ | ✅ |
| `qwen` | ✅ | ✅ | ✅ | ✅ |
| `deepseek` | ✅ | — | — | — |
| `cli/claude` | ✅ | — | — | — |
| `cli/gemini` | ✅ | — | — | — |

Selecting a CLI provider for a non-text feature is rejected at module load with `InvalidProviderError`. Every consumer (`generateObject`, `generateText`, `experimental_generateImage`, etc.) uses the same Vercel AI SDK call shape regardless of provider — swapping is purely a configuration change.

### Storage location

Local data lives under `./data/users/<userId>/`:

```
data/users/<userId>/
  packages/    # <slug>.json (Lite manifest) + optional <slug>.corefirst (Full ZIP)
  media/       # <hash>.mp3, <hash>.webp (per-user CAS pool, GC-swept)
  records/     # PouchDB LevelDB instances
    db_states/ # CFStateSchema — per-slug progress flags
    db_events/ # Per-event docs: transforms, attempts, roleplay session+messages
    db_srs/    # CFSRSSchema — global vocabulary deck (one doc 'user')
```

Override the data root via `COREFIRST_DATA_DIR=/some/path`. The default `userId` is `'local'`; a single-user install never sees the partitioning.

PouchDB infrastructure (per-event docs + revisions + tombstones) is sync-ready; the live multi-device sync against a cloud registry is a separate planned phase (`docs/storage-design.md` §7).

### Adding an Industry Module

Today the orchestrator passes `industry_context` as a free-text string in the `GenerationRequest` (see `src/generator/orchestrator.ts`), and the prompt template in `src/generator/courseware_prompt.md` instructs the LLM to draw on industry-appropriate vocabulary. To bias generation toward a specific terminology pack, extend `courseware_prompt.md` to surface the tokens you care about — e.g. by appending an "Industry Vocabulary Focus" section at prompt-load time. A structured JSON-token-pack injection mechanism is not yet wired up; contributions are welcome (tracked as P2 in the PRD).

---

## 7. Testing Strategy

| Layer | Tool | Coverage Target |
|-------|------|----------------|
| Unit (transformer logic) | Vitest + mock LLM | 80% of core module |
| Integration (API routes) | Vitest + test DB | All P0 routes |
| CFLT correctness | Test vectors (`tests/core/test_vectors.md`) | All 5 canonical vectors |
| E2E | Manual (no Playwright in v1) | Golden path per feature |

Run tests: `pnpm test`

---

## 8. Development Setup

### Prerequisites
- Node.js ≥ 20 LTS
- pnpm ≥ 9
- API keys (typical setup):
  - `GOOGLE_GENERATIVE_AI_API_KEY` (or legacy `GOOGLE_API_KEY`) — Gemini LLM + Imagen
  - `OPENAI_API_KEY` — TTS (`generateSpeech`) + STT (`transcribe`)
  - Optional: `OPENROUTER_API_KEY` if routing the LLM via OpenRouter

### Quickstart

```bash
pnpm install
cp .env.example .env   # fill in API keys (or skip if all features use cli/claude or cli/gemini)
pnpm dev               # → http://localhost:3000
```

### Environment Variables

#### Capability-level defaults

| Variable | Required | Description |
|---|---|---|
| `TEXT_PROVIDER` | No | Default text provider for all 4 text features. Values: `google` (default), `openai`, `anthropic`, `ollama`, `openrouter`, `cli/claude`, `cli/gemini` |
| `TEXT_MODEL` | No | Default text model for all 4 text features. Useful when every text feature should use the same model (e.g. one OpenRouter model). Leave unset to use the per-feature baked-in defaults (Pro for transform/courseGen, Flash for roleplay/speechEval) |
| `TEXT_TO_IMAGE_PROVIDER` | No | Default image provider for `imageGen`. Values: `google` (default), `openai`, `qwen`, `ollama` |
| `TEXT_TO_IMAGE_MODEL` | No | Default image model for `imageGen` |
| `TEXT_TO_SPEECH_PROVIDER` | No | Default TTS provider. Values: `openai` (default), `google`, `qwen` |
| `TEXT_TO_SPEECH_MODEL` | No | Default TTS model |
| `SPEECH_TO_TEXT_PROVIDER` | No | Default STT provider. Values: `openai` (default), `google`, `qwen` |
| `SPEECH_TO_TEXT_MODEL` | No | Default STT model |

#### Per-feature overrides (most specific)

Each feature has its own pair of vars. Unset → falls back to capability-level default → falls back to baked-in default.

| Feature | Provider override | Model override |
|---|---|---|
| `transform` | `TRANSFORM_PROVIDER` | `TRANSFORM_MODEL` |
| `courseGen` | `COURSE_GEN_PROVIDER` | `COURSE_GEN_MODEL` |
| `roleplay` | `ROLEPLAY_PROVIDER` | `ROLEPLAY_MODEL` |
| `speechEval` | `SPEECH_EVAL_PROVIDER` | `SPEECH_EVAL_MODEL` |
| `imageGen` | `IMAGE_GEN_PROVIDER` | `IMAGE_GEN_MODEL` |
| `tts` | `TTS_PROVIDER` | `TTS_MODEL` |
| `stt` | `STT_PROVIDER` | `STT_MODEL` |

For CLI providers, `<FEATURE>_MODEL` is a **command path** (`claude`, `/usr/local/bin/claude-canary`), not a model identifier — the CLI uses whatever model the user's session is configured for.

#### Credentials & misc

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Conditional | Required when any feature resolves to provider `google` |
| `GOOGLE_API_KEY` | Conditional | Legacy alias for `GOOGLE_GENERATIVE_AI_API_KEY` (fallback) |
| `OPENAI_API_KEY` | Conditional | Required when any feature resolves to provider `openai` |
| `ANTHROPIC_API_KEY` | Conditional | Required when any feature resolves to provider `anthropic` |
| `OPENROUTER_API_KEY` | Conditional | Required when any feature resolves to provider `openrouter` |
| `GROQ_API_KEY` | Conditional | Required when any feature resolves to provider `groq` |
| `DEEPSEEK_API_KEY` | Conditional | Required when any feature resolves to provider `deepseek` |
| `DASHSCOPE_API_KEY` | Conditional | Required when any feature resolves to provider `qwen` (text, TTS, STT, or Wanx image) |
| `OLLAMA_BASE_URL` | No | Default `http://localhost:11434` (Ollama's native API root, **not** the OpenAI-compatible `/v1` endpoint) |
| `<FEATURE>_BASE_URL` / `<CAPABILITY>_BASE_URL` | No | Override the OpenAI HTTP base URL for one feature (e.g. `TTS_BASE_URL=http://localhost:8880/v1` for local Kokoro-FastAPI). Only consumed by the `openai` provider |
| `<FEATURE>_API_KEY` / `<CAPABILITY>_API_KEY` | No | Override the API key sent by the `openai` provider for one feature. Useful when a local server requires no auth (set any non-empty placeholder) or when one feature should bill to a different OpenAI account |
| `TTS_VOICE` | No | TTS voice id (default `alloy`). Local servers use different voice naming — set explicitly: Kokoro `af_sky` etc., Orpheus `tara` etc., Piper `en_US-amy-low` etc. |
| `COREFIRST_DATA_DIR` | No | Override the local `data/` root. Default: `./data` |

#### Worked examples

```env
# 1. All defaults — Gemini Pro for transform/courseGen, Gemini Flash for
#    roleplay/speechEval, Imagen 4 + OpenAI TTS/STT.
GOOGLE_GENERATIVE_AI_API_KEY=...
OPENAI_API_KEY=...

# 2. Pivot all 4 text features to OpenRouter.
TEXT_PROVIDER=openrouter
TEXT_MODEL=anthropic/claude-sonnet-4-6
OPENROUTER_API_KEY=...

# 3. Mixed: courseGen on the paid Anthropic API for quality, roleplay on the
#    local Claude CLI for free, transform/speechEval still on Gemini.
COURSE_GEN_PROVIDER=anthropic
COURSE_GEN_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=...
ROLEPLAY_PROVIDER=cli/claude
# ROLEPLAY_MODEL unset → defaults to `claude` (PATH lookup)
GOOGLE_GENERATIVE_AI_API_KEY=...

# 4. Override just the model name, keep provider.
TRANSFORM_MODEL=gemini-3.1-pro-preview-002
```

Implementation: `src/lib/ai/index.ts` exports one pre-built model per feature (`transformModel`, `courseGenModel`, `roleplayModel`, `speechEvalModel`, `imageGenModel`, `ttsModel`, `sttModel`). Each consumer imports the specific feature it needs — the import line is the capability declaration.

---

## 9. Known Technical Debt

| Item | Priority | Tracking |
|------|----------|---------|
| Courseware generator test suite | P1 | Partial in `tests/generator.test.ts` — needs broader CFLT audit-loop coverage |
| Industry token-pack injection mechanism | P2 | Currently free-text via `industry_context`; structured JSON pack not yet wired |
| Multi-language QA beyond Chinese↔English | P2 | Prompts are language-agnostic (`{{SOURCE_LANG}}` / `{{TARGET_LANG}}`) but only Chinese↔English vectors are validated in `tests/core/test_vectors.md` |

---

## 10. Related Documents

- `docs/prd.md` — Product requirements
- [cflt.center](https://cflt.center) — CFLT theoretical framework (separate repository: [github.com/corefirst/cflt](https://github.com/corefirst/cflt))
- [CFLT vision document](https://github.com/corefirst/cflt/blob/main/vision.md) — Cross-project strategic vision
- `docs/features/logic-transformer.md` — Logic Transformer feature spec
- `docs/features/courseware-generator.md` — Courseware Generator feature spec
- `tests/core/test_vectors.md` — CFLT validation test vectors
