# Product Requirements Document — CoreFirst

> Software version: 0.4.0 | Status: Active | Last Updated: 2026-05-12

---

## 1. Executive Summary

**CoreFirst** is an open-source, AI-driven bilingual language learning platform that implements **Core-First Language Theory (CFLT)** as a pedagogical protocol. Instead of memorizing grammar rules, learners internalize a universal thought-sequencing pattern:

```
[Core Action/Result] → [Condition/Reason] → [Space/Context] → [Time]
```

By training the brain to restructure native-language thoughts into this sequence first, producing the target language becomes a simple token-replacement exercise rather than a full syntactic reorganization. CoreFirst ships as a production-ready Next.js application that any developer or institution can deploy, extend, and build upon.

---

## 2. Problem Statement

### 2.1 The Core Pain Point

Traditional second-language acquisition (SLA) forces learners to perform **real-time mental context switching**: think in L1 structure → mentally translate → produce L2. For learners whose native language is "context-heavy" (Chinese, Japanese, Korean), this overhead is extreme, because L1 word order places Time and Context *before* the Core Action — the exact inverse of English.

**Result:** High cognitive load, slow fluency development, and persistent grammar errors that stem not from ignorance but from structural interference.

### 2.2 Why Existing Tools Fail

| Tool | Approach | Gap |
|------|----------|-----|
| Duolingo | Gamified vocabulary/phrases | No structural cognitive reshaping |
| Babbel / Rosetta Stone | Curriculum-based grammar drills | Teaches L2 rules in isolation, no L1 bridge |
| AI chatbots (ChatGPT, etc.) | Free conversation | No structured logic protocol enforcement |
| Speak / Elsa | Pronunciation coaching | Ignores the sequencing problem entirely |

None of them address the **root cause**: the structural mismatch between how learners think and how the target language is organized.

### 2.3 The CoreFirst Hypothesis

If a learner can habitually structure *any* thought — in any language — as `[Core] → [Reason] → [Space] → [Time]`, then producing fluent English becomes mechanical token substitution. The cognitive bottleneck is eliminated at the thought-formation stage, not patched at the output stage.

---

## 3. Target Users

### 3.1 Primary Persona — "The Pragmatic Adult Learner"

- **Who:** Chinese-speaking adults aged 22–45, intermediate English users
- **Goal:** Functional professional or daily English fluency
- **Frustration:** Knows grammar rules but freezes when speaking; thinks in Chinese, produces broken English sentences
- **Behavior:** Has tried apps but abandoned them after weeks; needs structured method, not games

### 3.2 Secondary Persona — "The Developer / Educator"

- **Who:** Software developers, language educators, ed-tech builders who want to extend or embed CoreFirst
- **Goal:** Deploy CoreFirst as infrastructure for their own learning product or research
- **Behavior:** Forks the repo, customizes prompts, adds language pairs or domain modules
- **Value prop:** Clean TypeScript codebase, modular API routes, PouchDB-backed file storage, LLM-agnostic architecture with UI-configurable providers

### 3.3 Out-of-Scope Users (v1)

- Children under 12 (UI/UX requires significant adaptation)
- Complete beginners with zero target-language exposure

---

## 4. Product Goals & Success Metrics

### 4.1 Qualitative Goals

1. Prove that CFLT-based sequencing training measurably reduces L1→L2 restructuring time
2. Build the canonical open-source reference implementation of CFLT
3. Enable any developer to add a new language pair or industry module in under 2 hours

### 4.2 Key Performance Indicators

| Metric | Description | Target (90 days post-launch) |
|--------|-------------|-------------------------------|
| CFLT Compliance Score | % of user sentences that pass the four-element validator | ≥ 60% by session 5 (baseline: ~15%) |
| 7-Day Retention | Users who return within 7 days of first session | ≥ 30% |
| Voice Challenge Pass Rate | % of voice attempts scoring ≥ 70/100 | ≥ 50% after 3 attempts |
| Courseware Generation Time | Time to generate a 5-lesson module | ≤ 30 seconds |
| GitHub Stars / Forks | Indicator of developer adoption | 500 stars within 90 days |
| Issue / PR Activity | Community engagement | ≥ 10 external contributions within 90 days |

### 4.3 Anti-Metrics (What We Do Not Optimize For)

- Raw session length (CFLT training should be short and intense, not time-padded)
- Vocabulary count (not the primary learning objective)
- Revenue / conversion (no payment features in open-source v1)

---

## 5. Feature Requirements

### P0 — Core (Must Ship)

#### F-01: CFLT Logic Transformer
The central engine. Takes freeform L1 input and outputs a structured CFLT analysis.

**Inputs:** User text (any language), display config  
**Outputs:**
- `is_cflt_compliant` — whether input already follows the protocol
- `cflt_l1` — reconstructed native-language logic in Core-First sequence
- `cflt_l2` — token-swapped target language (CFLT-English)
- `standard_l2` — idiomatic polished output
- `standard_l1` — back-translated reference
- `corrections` — annotated grammar/logic diffs

**Constraints:** ≤ 2 second latency; all four sequence elements mandatory

#### F-02: CFLT Courseware Generator
Generates scenario-based lesson content conforming to the CFLT protocol.

**Inputs:** `age_group`, `industry_context`, `topic`, `sourceLang`, `targetLang`  
**Outputs:** `CoursewareManifest` — lessons containing `title`, `scenario_description`, `cflt_scripts` (each with per-script `ssml`), `visual_generation_prompts`, `vocabulary_focus`  
**Constraints:** 5-lesson module in ≤ 30 seconds; every script re-audited through the CFLT Logic Transformer in a self-audit pass

#### F-03: Voice Challenge Engine
Records user speech, transcribes via OpenAI STT, scores pronunciation and logic stress placement.

**Inputs:** Audio blob, expected text  
**Outputs:** `score`, `pronunciation`, `logic_stress` (emphasis on Core Action block), `transcription`, `feedback`  
**Integration:** OpenAI transcription (`gpt-4o-mini-transcribe`) + LLM prosody evaluator

#### F-04: Progress Map & Analytics
Persists session and attempt data; provides a visual dashboard of learning trajectory.

**Data model:** `Session → Attempt`, `Vocabulary` mastery tracking  
**UI:** Recharts-powered dashboard; score trends over time; vocabulary mastery heatmap

#### F-05: Gamified CFLT Builder
Drag-and-drop sentence reconstruction game. User sorts shuffled blocks into the correct CFLT sequence.

**UI:** Framer Motion reorder; "Verify Logic" feedback; integrated into course result cards

---

### P1 — Important (Target v1.0)

#### F-06: Dynamic Roleplay (Conversational AI)
Multi-turn dialogue practice where the AI maintains a CFLT-enforced conversational persona.

**Inputs:** User message, conversation history, `sourceLang`, `targetLang`, `context`  
**Outputs:** `reply`, `ssml`, `cflt_analysis`, `feedback` (per-turn coaching when the user's logic deviates from CFLT)  
**Status:** Shipped — `/api/roleplay` route + `components/CFLTChat.tsx` + Roleplay tab in `app/page.tsx`

#### F-07: Phonetic Bridge (Pinyin → IPA)
For Chinese speakers: maps familiar Pinyin sounds to English IPA phonemes, reducing articulatory friction.

**Logic:** Overlapping sets (direct migration), modification guidance (relative adjustments), zero-to-one phonemes (analogical generation)  
**Integration:** (1) Embedded in `/api/speech-eval` LLM prompt as Pinyin-anchored error feedback. (2) `components/PhoneticBridge.tsx` — interactive collapsible reference panel rendered below VoiceChallenge in Transform Mode. Groups sounds by category (stops, retroflexes, palatals, vowels, common mistake pairs); searchable by Pinyin, IPA, or English keyword; only visible when `sourceLang === 'Chinese'`.  
**Data:** `src/lib/phonetics/pinyin-ipa.ts` — static mapping of 40+ Pinyin entries to IPA with English approximations and difficulty flags.  
**Status:** Shipped as structured interactive component.

#### F-08: TTS Audio Output
Text-to-Speech synthesis with SSML prosody tagging that emphasizes the `[Core Action]` block.

**Provider:** OpenAI `gpt-4o-mini-tts` (default; swappable via `TTS_MODEL` env, or by adding a provider under `src/core/tts/`)  
**SSML:** `<prosody pitch="+10%">` on core blocks; standard delivery for supplementary elements

#### F-09: Image Generation for Lessons
Visual context generation for courseware to bypass native-language mental translation.

**Provider:** Google Imagen (`imagen-4.0-generate-001` by default; swappable via the `imageGen` feature env vars (`IMAGE_GEN_PROVIDER`, `IMAGE_GEN_MODEL`) or by adding a provider under `src/lib/ai/text-to-image/sdk/`)  
**Integration:** `/api/generate-image` route; triggered by courseware `visual_generation_prompts`

---

### P2 — Nice to Have (Post-v1.0)

#### F-10: Any-to-Any Language Pairs
Generalize all LLM prompts and UI selectors to support non-Chinese source languages (Japanese→English, Arabic→Spanish, etc.).

**Status:** Language-agnostic prompt templates already implemented; UI selectors exist; needs QA for non-Chinese pairs

#### F-11: Industry-Specific Module Packs
Pre-built token vocabularies for IT, Medical, Finance, Hospitality sectors.

**Status:** Currently free-text via the `industry_context` field on `GenerationRequest` (the LLM is instructed to draw on industry-appropriate vocabulary). Structured JSON token packs and a dedicated injection slot in `src/generator/courseware_prompt.md` are not yet built; community-contributed packs are welcome.

#### F-12: Multi-User Storage Partitioning
Per-user data isolation enabling multiple learners on a shared device (and serving as the foundation for the SaaS sync layer).

**User identity resolution** (precedence order):
1. `X-User-Id` request header — platform/reverse-proxy injection
2. `cf_user_id` cookie — auto-assigned UUID on first visit by Next.js middleware (`middleware.ts`)

On every first visit, `middleware.ts` transparently assigns a `crypto.randomUUID()` as the `cf_user_id` cookie (1-year expiry). This UUID serves as both the local storage partition key and the future hub.corefirst.world member ID. All values normalized via `/[a-z0-9_-]/` whitelist (UUID hex chars and hyphens pass naturally).

**Multi-profile support (household use):** A `ProfileSwitcher` component manages a `cf_profiles` JSON array in `localStorage`. Switching profiles writes the chosen UUID into the `cf_user_id` cookie and reloads the page — the server instantly scopes all storage to the new UUID. Profile display names are stored in `localStorage` only; renaming never moves any server directory.

**Outputs:** All packages, media, and PouchDB records partitioned under `data/users/<userId>/`. Cross-user reads/writes are mechanically impossible — every storage function takes `userId` as its first argument.

**Status:** Shipped. `middleware.ts` assigns UUIDs; `src/lib/auth/user.ts` resolves; `src/lib/storage/paths.ts` partitions; `components/ProfileSwitcher.tsx` provides the household UI.

#### F-13: History Management (Edit + Delete)
User control over their own history: delete unwanted records, rename session/course titles, with multi-device sync friendliness.

**Capabilities:**
- Per-entry delete for transforms, roleplay messages
- Cascade delete for roleplay sessions (metadata + all messages in one `bulkDocs` round-trip)
- Cascade delete for courses (manifest + state + events + vocab back-links + media GC; partial-failure observable via HTTP 207)
- Rename for roleplay session `context` and course `topic` (slugs and sessionIds are immutable join keys)

**Sync semantics:** All deletes are hard-delete via PouchDB tombstones (`_deleted: true`) — propagates correctly across devices. All operations idempotent (404 → 200) so concurrent multi-device deletes never error.

**Status:** Shipped. UI buttons in `TransformHistory.tsx`, `RoleplayHistory.tsx`, `CourseHistory.tsx`; API routes under `app/api/history/*` and `app/api/courses/[slug]`.

#### F-14: Sync-Safe Per-Event Persistence
Every learner event (transform / voice attempt / roleplay message) is a distinct PouchDB document with a unique stable ID. Foundation for live multi-device sync via PouchDB replication.

**Why it matters:** The previous "single doc with arrays of events" pattern produced `_conflicts` on concurrent multi-device writes; per-event docs eliminate that conflict class entirely. Distinct IDs cannot collide.

**Status:** Shipped storage-side. Live replication to a SaaS CouchDB endpoint is a separate planned phase.

#### F-15: UI-Configurable AI Provider (Settings Panel)

Allows users to configure all AI providers directly from the browser UI without touching `.env` files — essential for non-technical users and cloud deployments where operator `.env` access is unavailable.

**Settings panel** (`components/Settings.tsx`) provides two tabs:
- **AI Providers:** Provider picker (OpenRouter · Groq · Google AI · OpenAI · Anthropic · Ollama · Claude CLI · Gemini CLI), API key input with live verification, optional model override, TTS/STT/Image collapsible sections for local server URLs
- **Profile:** Display name editor, User ID display

**Storage:** Settings persisted to `localStorage` under `cf_settings_{uuid}` (per-profile isolation). API keys never written to server disk.

**Delivery mechanism:** Settings injected as `x-cf-*` request headers on every AI call. Server reads headers via `extractSettings()` (`src/lib/ai/settings-config.ts`) and overrides env-var resolution for that request only. All existing env-var configurations continue to work unchanged.

**Key verification:** `POST /api/verify-key` fires a minimal test call to the provider. Returns `{ ok, error? }` with plain-English error messages.

**Status:** Shipped. See `docs/features/settings-ai-config.md`.

#### F-16: AI Provider BYOK Error Handling

When an API key is absent or invalid, routes return `{ error: 'API_KEY_REQUIRED' | 'INVALID_API_KEY' }` with HTTP 401. The frontend detects the code and shows an inline contextual prompt — "No API key configured. Open Settings →" — that opens the Settings panel directly. All AI-facing routes carry BYOK headers: transform, roleplay, generate-course, TTS, STT, speech-eval, and transform/refine.

Local providers (Ollama, CLI) report connection/auth errors differently (not 401) so they do not trigger the BYOK prompt.

**Status:** Shipped. `src/lib/ai/errors.ts` classifies; all routes use `getHeaders()` from `useSettings`.

#### F-17: CFLT Build Mode (Roleplay Pre-Production Scaffold)

Addresses the core learning gap where users default to their native sentence structure before speaking. In Roleplay, a "Build" toggle switches the input to four labelled slots — Core / Reason / Space / Time — mirroring the CFLT sequence. The user fills whichever slots apply, then sends; the client assembles them into a comma-joined message and submits to `/api/roleplay` as normal.

**Goal:** Train the habit of structuring thought *before* output, not just correcting after.  
**UI:** `components/CFLTChat.tsx` — header toggle button (green when active); 2×2 slot grid with color-coded inputs and quick-send on Enter.  
**Status:** Shipped.

#### F-18: Transform Cover & Recall

After a Transform result is displayed, a "Test Yourself" button hides the standard-L2 answer and presents a free-text field. The user attempts to reproduce the target-language sentence from the CFLT structure alone. Clicking "Reveal Answer" shows their attempt alongside the correct sentence for self-assessment.

**Goal:** Force active production from structure rather than passive reading.  
**UI:** `app/page.tsx` — three-state view (normal → recall input → comparison). Resets automatically on every new transform.  
**Status:** Shipped.

#### F-19: Vocabulary Review (SRS Flashcard Drill)

Direct entry point from the Stats dashboard Memory section. When words are due for SRS review, a "Review X due →" button opens a full-screen flashcard modal.

**Flow:** meaning shown → tap to flip → L2 word revealed → "Knew it!" / "Didn't know" → SM-2 state updated via `POST /api/vocabulary/review`.  
**Endpoints:** `GET /api/vocabulary/due?lang=` returns today's due items; `POST /api/vocabulary/review` records result and updates interval/easeFactor/reviewCount.  
**UI:** `components/VocabReview.tsx` — progress bar, two-column done/summary screen, "Review again" shuffle.  
**Status:** Shipped.

#### F-20: Cross-Tab Vocabulary Analytics

Shows which vocabulary words from the SRS deck have been used organically in Roleplay conversations, closing the feedback loop between structured learning (Course/Transform) and free practice (Roleplay).

**Endpoint:** `GET /api/progress/vocab-usage` — scans all roleplay-msg events for the user, counts distinct sessions where each vocab token appears (word-boundary check for Latin; substring for CJK). Response cached 60 seconds.  
**UI:** `CrossTabSection` in `ProgressDashboard` — progress bar ("12 of 45 words used in Roleplay"), two columns (used words with session count × / unused words to try), expandable full list.  
**Status:** Shipped.

#### F-21: Course Generation Real-Time Progress (SSE)

Course generation (20–30 seconds) now streams Server-Sent Events so users see live step updates instead of a spinner.

**Event stream:** `Designing lessons… → Auditing scripts… → Generating audio (3/8)… → Generating images (2/4)… → Packaging…`  
**Implementation:** `app/api/generate-course/route.ts` returns `text/event-stream`; `CoursewareOrchestrator` and `buildAndWritePackage` accept an `onProgress: ProgressEmitter` callback. Frontend reads the stream via `src/lib/sse-reader.ts` utility.  
**Status:** Shipped.

---

## 6. Out of Scope

| Item | Reason |
|------|--------|
| Payment / subscription billing | Open-source v1; no monetization features |
| Mobile native app (iOS/Android) | Web-first; React Native adaptation is a community fork concern |
| Offline mode | LLM API dependency requires connectivity |
| L1 acquisition (children learning first language) | Fundamentally different from CFLT's L2 use case |
| Hard-coded local dictionary | MVP is fully LLM-driven for iteration speed |
| Live multi-device replication endpoint | PouchDB infrastructure ready (F-14); the SaaS registry + sync service is the next major project, not part of the local app |
| User authentication backend | Local app accepts userId from header/cookie/env but does not authenticate it — the SaaS registry layer (when shipped) handles identity proofing |
| LLM-protocol layer (Apcore ecosystem integration) | Belongs to a sister project in the apcore ecosystem; see §11 Related Projects |

---

## 7. Open Source & Extensibility Requirements

### 7.1 License
Apache License 2.0. All contributions must be compatible.

### 7.2 Extension Points

Every major module must be independently swappable without modifying core logic:

| Extension Point | Interface | How to Swap |
|----------------|-----------|-------------|
| Text Provider (env) | `src/lib/ai/text/factory.ts` (`buildTextModelFor(featureKey)` — dispatches on `TEXT_PROVIDER` and per-feature overrides) | Add a branch under `text/sdk/` for SaaS providers, or `text/cli/` for new subscription-CLI providers |
| Text Provider (UI/per-request) | `src/lib/ai/settings-config.ts` (`resolveFeatureFromSettings`) — reads `x-cf-provider` / `x-cf-api-key` headers | Client sends provider+key as request headers; server builds a fresh model instance for that request only |
| Image Provider | `src/lib/ai/text-to-image/factory.ts` (`buildImageModel`, `buildImageModelWith`) | Add a branch under `text-to-image/sdk/`. CLI providers not supported — text-only |
| TTS Provider | `src/lib/ai/text-to-speech/factory.ts` (`buildSpeechModel`, `buildSpeechModelWith`) | Add a branch under `text-to-speech/sdk/`; or configure local server via `x-cf-tts-url` header |
| STT Provider | `src/lib/ai/speech-to-text/factory.ts` (`buildTranscriptionModel`, `buildTranscriptionModelWith`) | Add a branch under `speech-to-text/sdk/`; or configure local server via `x-cf-stt-url` header |
| Storage | `src/lib/storage/` — `.corefirst` packages + PouchDB records | File-based; no DB. Swap by replacing `package.ts` / `record.ts` |
| Language Pair | `{{SOURCE_LANG}}` / `{{TARGET_LANG}}` placeholders in `src/core/system_prompt.md` and `src/generator/courseware_prompt.md` | Add UI selector option + canonical test vectors |
| Industry Module | `industry_context` field on `GenerationRequest` | Free-text today; structured token-pack injection is a P2 follow-up |

### 7.3 Developer Experience Requirements

- Single `pnpm install && pnpm dev` startup (no external services required for basic demo)
- All AI providers configurable via `.env` (documented in `.env.example`) **or** via the in-app Settings panel without touching any config file
- Vitest test suite runnable with `pnpm test`
- Each feature module self-contained in its own API route + component pair

---

## 8. Technical Constraints

| Constraint | Detail |
|-----------|--------|
| LLM latency | CFLT transformation ≤ 2s; courseware generation ≤ 30s |
| Storage | File-based — `.corefirst` packages and `.cfrecord` learning records under `data/`. No database. See `docs/storage-design.md` |
| Node.js | ≥ 20 LTS required for Next.js 16 |
| Browser | Modern browsers only (no IE11); uses MediaRecorder API for voice capture |
| API keys | Configurable via `.env` (server-side) or Settings panel (per-user, stored in `localStorage`). Supported text providers: Google AI, OpenAI, Anthropic, OpenRouter, Groq, Ollama, Claude CLI, Gemini CLI. TTS/STT: OpenAI-compatible (local or cloud). Image: Google Imagen or OpenAI DALL-E. No API key required for `cli/claude` / `cli/gemini` — uses local CLI subscription |

---

## 9. What Happens If We Don't Build This?

The CFLT/CFLT framework remains theoretical — a research manifesto without a usable reference implementation. Educators and developers who want to experiment with Core-First pedagogy have no working baseline to fork or study. The gap between the cognitive insight (restructure thought before translating) and practical tooling (a usable app that enforces it) stays unbridged.

---

## 10. Related Projects

CoreFirst is the **reference implementation of CFLT for human learners (Pillar I)**. The CFLT framework also has a second strategic pillar — standardizing how LLMs and AI agents structure reasoning — which this repository does **not** implement.

| Pillar | Audience | Repository | Status |
|--------|----------|-----------|--------|
| Pillar I — Human Bilingual Education | Language learners | `corefirst` (this repo) | Active |
| Pillar II — LLM Protocol Layer | LLM/Agent developers | `apcore-cflt` (planned, in the apcore ecosystem) | Not started |

The `apcore` ecosystem (`apcore-mcp`, `apcore-cli`, `apcore-sdk`) is the natural home for Pillar II — it already provides the framework abstraction layer, multi-language SDK family, and MCP integration that a CFLT-as-protocol module would extend. CoreFirst will not absorb this work; the two projects share theory hosted at [cflt.center](https://cflt.center) but ship independently.

For the full cross-project vision, see the [CFLT vision document](https://github.com/corefirst/cflt/blob/main/vision.md).

---

## 11. Appendix

### 11.1 CFLT Sequence Reference

```
[Core Action/Result] → [Condition/Reason] → [Space/Context] → [Time]
```

All four elements are mandatory. Partial sequences are non-conformant.

**Example:**
- Input (Chinese L1 order): 昨天下雨，我在家没出去。*(Time → Reason → Result)*
- CFLT-L1: 我没出去，因为下雨，在家，昨天。*(Result → Reason → Space → Time)*
- CFLT-L2: I didn't go out, because it rained, at home, yesterday.

### 11.2 Naming Conventions

| Layer | Name | Use |
|-------|------|-----|
| Brand | CoreFirst / Core First | Product, repo, domain (corefirst.world), all user-facing UI |
| Theory / Method | CFLT — Core-First Language Theory | Academic citation, runtime references, technical specs |

### 11.3 Related Documents

- [cflt.center](https://cflt.center) — CFLT theoretical framework (separate repository: [github.com/corefirst/cflt](https://github.com/corefirst/cflt))
- [CFLT vision document](https://github.com/corefirst/cflt/blob/main/vision.md) — Cross-project strategic vision: Human-AI synchronized logic
- `docs/features/logic-transformer.md` — Logic Transformer feature spec
- `docs/features/courseware-generator.md` — Courseware Generator feature spec
- `docs/features/user-identity.md` — UUID-based user identity, middleware, and profile switcher
- `docs/features/settings-ai-config.md` — Settings panel, BYOK, and per-request provider overrides
- `tests/core/test_vectors.md` — CFLT validation test vectors
