# Transform Mode

> Feature spec for the CoreFirst Transform Mode user experience.
> Theoretical reference: [cflt.center](https://cflt.center) (CFLT framework manifesto, separate repository).
> Related: [Logic Transformer Engine](./logic-transformer.md) covers the AI processing unit that Transform Mode invokes.

## Purpose

Transform Mode is the discovery entry point of the CoreFirst learning journey. A learner types any sentence in their native language, clicks Transform, and immediately sees that sentence restructured into the CFLT four-element sequence (`[Core Action/Result] → [Condition/Reason] → [Space/Context] → [Time]`) alongside a token-swapped target-language mapping and a polished idiomatic output. TTS playback and a `VoiceChallenge` panel follow inline, so the learner can hear and practice the discovered sentence without leaving the view. Transform Mode is deliberately lightweight and ad-hoc: it requires no topic selection, no course enrollment, and — in Phase 1 — no account. It is the fastest path from a thought to a spoken, CFLT-structured sentence.

**Relationship to Logic Transformer Engine:** `logic-transformer.md` describes the AI processing unit (`CFLTTransformer`, `POST /api/transform`, `CFLTResponseSchema`) that converts raw input into structured CFLT output. This document describes the end-to-end user interaction layer built on top of that engine: the input form, the CFLT block rendering, the TTS Play button, the VoiceChallenge integration, the history persistence strategy, and the phased cross-mode connection plan.

## Scope

**Included:**
- **Text Input and Submission:** A freeform textarea accepting native-language input (up to 8,192 characters) and a Transform button that POSTs to `/api/transform`.
- **CFLT Block Display:** Visual rendering of `cflt_l1` (native-language CFLT sequence) and `cflt_l2` (target-language token-swapped sequence) as color-coded blocks in the `CFLTBlock` component pattern, labeled "CFLT Thinking Structure" and "Target Language Mapping" respectively.
- **Standard Output Display:** The polished idiomatic `standard_l2` string rendered as a prominent quote inside a blue card, with a `PlayCircle` TTS button.
- **TTS Playback:** Clicking the `PlayCircle` button POSTs `standard_l2` to `/api/tts` and plays the returned `audio/mpeg` stream. Audio loading state is tracked per-call to disable the button while synthesis is in progress.
- **VoiceChallenge Practice:** After the result is displayed, a `VoiceChallenge` component is rendered with `expectedText = standard_l2`, giving the learner an immediate opportunity to record and receive a CFLT prosody evaluation.
- **Transform History (Phase 1):** Each successful `/api/transform` response is persisted as an entry in the learner's `.cfrecord` file under the `transforms[]` array (fields: `inputText`, `sourceLang`, `targetLang`, `cfltL1`, `cfltL2`, `standardL2`, `standardL1`, `isCflmCompliant`, `corrections`, `timestamp`). History is viewable from the Stats/History tab.

**Excluded:**
- **Cross-Mode Suggestions (Phase 3):** Topic detection and "Generate a Course on this topic" prompts are not present in Phase 1. Vocabulary annotation of recognized `cflt_l2` tokens against the vocabulary mastery section of `.cfrecord` is also Phase 3.
- **Vocabulary Tagging (Phase 2):** Surfacing mastery level indicators inline with individual CFLT block tokens is a Phase 2 capability dependent on the vocabulary mastery section of `.cfrecord` being populated.
- **Per-Element CFLT Voice Scores (Phase 2):** `VoiceChallenge` renders Phase 1 scores only (`overallScore`, `pronunciation`, `logicStress`). The four per-block CFLT sub-scores (`scoreCoreAction`, `scoreCondition`, `scoreSpaceContext`, `scoreTime`) are reserved for Phase 2.
- **Authenticated Sessions:** Transform Mode has no login requirement and no per-user isolation in Phase 1. Multi-user tenancy is out of scope.

## Core Responsibilities

1. **Input Collection and Validation** — Accepts freeform native-language text, enforces the 8,192-character limit, and dispatches the Transform request on user action.
2. **CFLT Result Rendering** — Parses and displays the four-element `cflt_l1` and `cflt_l2` structures as labeled block sequences, and presents `standard_l2` as the polished target output.
3. **Audio Playback Orchestration** — Manages per-sentence TTS loading state and Audio object lifecycle, routing requests through `/api/tts` and playing the response stream in the browser.
4. **VoiceChallenge Integration** — Mounts the `VoiceChallenge` component below the result with the correct `expectedText`, `sourceLang`, and `targetLang` props, enabling immediate spoken practice without navigation.
5. **History Persistence (Phase 1)** — Records every successful Transform call as an entry in the `transforms[]` array of the learner's `.cfrecord` file, providing the data anchor for future vocabulary detection and cross-mode navigation (Phase 3).

## Interfaces

### User Inputs
| Input | Location | Description |
|-------|----------|-------------|
| Native-language sentence | Textarea on Transform tab | Freeform text, any length up to 8,192 characters. |
| Source language selector | Mode controls | Defaults to `Chinese`; parameterizes both the transformer prompt and the phonetic migration feedback in speech-eval. |
| Target language selector | Mode controls | Defaults to `English`. |
| Transform button | Below textarea | Triggers `POST /api/transform`. Disabled while a request is in flight. |

### `POST /api/transform`
- **Request:** `{ text: string, sourceLang?: string, targetLang?: string }` (validated by `TransformRequestSchema` via Zod).
- **Response:** `CFLTResponse` JSON (validated by `CFLTResponseSchema` in `src/types/cflt.ts`) on success; `{ error: string }` with HTTP 400 or 500 on failure.
- **`CFLTResponse` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `is_cflt_compliant` | `boolean` | Whether the original input already followed the CFLT sequence. |
| `cflt_l1` | `string` | Input restructured into the Core-First sequence in the native language. |
| `cflt_l2` | `string` | Token-swapped CFLT output in the target language. |
| `standard_l2` | `string` | Polished idiomatic target-language sentence. |
| `standard_l1` | `string` | Back-translated native reference confirming the AI understood the intent. |
| `corrections` | `Correction[]` | Array of `{ type: 'logic' \| 'grammar' \| 'vocabulary', original, replacement, reason }` objects. |

### `POST /api/tts`
Invoked when the learner clicks the `PlayCircle` button on the `standard_l2` card.
- **Request:** `{ text: string }` — `standard_l2` from the transform result.
- **Response:** Raw `audio/mpeg` bytes, played via a browser `Audio` object.
- **Loading State:** A per-sentence `audioLoading` key (`'transform-result'`) tracks in-flight requests; the button renders a `Loader2` spinner while loading and is disabled to prevent double-submission.

### `VoiceChallenge` Component (mounted after result)
Receives:
- `expectedText = transformResult.standard_l2`
- `sourceLang` — from the active source language selection
- `targetLang` — from the active target language selection
- No `packageId` in Phase 1 (Transform Mode does not produce a `.corefirst` package; voice attempts from Transform Mode reference `transformRecordId` in Phase 3 when the `.cfrecord` transform entry becomes the anchor)

### Dependencies
- **Logic Transformer Engine** — `CFLTTransformer` in `src/core/transformer.ts`; see `docs/features/logic-transformer.md`.
- **TTS Factory** — `TTSFactory` in `src/core/tts/factory.ts`, backed by `OpenAITTSProvider` using `gpt-4o-mini-tts`. TTS is called in real time on demand — no caching layer.
- **`.cfrecord` File** — Persistence target for each transform invocation; entries are appended to the `transforms[]` array (Phase 1).

## Data Flow

```mermaid
graph TD
    A[User types sentence in textarea] --> B[User clicks Transform]
    B --> C[POST /api/transform with text + langs]
    C --> D[CFLTTransformer processes input]
    D --> E{LLM returns CFLTResponse?}
    E -- Error --> F[Error state shown in UI]
    E -- Success --> G[Append entry to .cfrecord transforms[] — Phase 1]
    G --> H[CFLTResponse stored in transformResult state]
    H --> I[cflt_l1 blocks rendered: CFLT Thinking Structure]
    H --> J[cflt_l2 blocks rendered: Target Language Mapping]
    H --> K[standard_l2 displayed in blue result card]
    K --> L[User clicks PlayCircle]
    L --> M[POST /api/tts with standard_l2]
    M --> N[OpenAI gpt-4o-mini-tts synthesis — real-time, no cache]
    N --> O[audio/mpeg bytes returned]
    O --> R[Audio plays in browser]
    K --> S[VoiceChallenge rendered with expectedText = standard_l2]
    S --> T[User records voice attempt]
    T --> U[POST /api/speech-eval → EvaluationResult]
    U --> V[Score display: pronunciation + logicStress + feedback]
```

## Key Behaviors

### CFLT Block Visualization
The `cflt_l1` and `cflt_l2` strings are rendered as sequences of visually distinct, labeled blocks by the `renderBlocks` function. Each block corresponds to one CFLT element — `[Core Action/Result]`, `[Condition/Reason]`, `[Space/Context]`, `[Time]` — and is color-coded to reinforce the structural mapping between native and target language. The two block rows are stacked with a horizontal divider between them, making the token-swap relationship spatially apparent.

### Immediate Practice Loop
Transform Mode is designed so that the learner can complete a full exposure-to-practice cycle in a single screen without navigation:
1. Type sentence → see CFLT restructuring (cognitive mapping)
2. Click Play → hear the sentence (auditory anchoring)
3. Click mic → record and receive score (production practice)

This loop can be repeated on the same sentence to improve `logicStress` or `pronunciation` scores, or the learner can type a new sentence to start the cycle again.

### Lightweight Operation in Phase 1
`/api/transform` requires no external database. The route instantiates `CFLTTransformer`, calls `transform()`, returns the result, and then appends the record to `.cfrecord` as a background write. This makes Transform the fastest and most resilient endpoint in the system — safe to experiment with new prompt variants. History persistence is not a prerequisite for the response; a write failure is logged but never surfaced to the user.

### Language Pair Parameterization
Both `sourceLang` and `targetLang` are passed through to the transformer and to the `VoiceChallenge` component. `sourceLang` is particularly significant: when set to `Chinese`, the `speech-eval` evaluator generates Pinyin-anchored phonetic migration feedback, leveraging the learner's existing phonological knowledge to bridge to English pronunciation.

## Constraints

- **Input Length:** 8,192 characters maximum, validated by `TransformRequestSchema` at the API layer. Inputs exceeding this limit receive a `400` response before any LLM call is made.
- **TTS Length:** 4,096 characters maximum per `/api/tts` request (`MAX_TTS_LEN` in `/api/tts/route.ts`). `standard_l2` output is well within this limit for typical sentences.
- **Language Pair Validation:** Chinese↔English is the production-validated pair with test vectors in `tests/core/test_vectors.md`. Other language pairs are supported by the prompt template but are not declared production-ready until their own test vectors are added.
- **No Cross-Mode State in Phase 1:** Transform Mode does not write to vocabulary mastery in `.cfrecord`, does not suggest Courses, and does not share data with Roleplay Mode until Phase 3 integration is complete.

## Error Handling

- **Empty or Oversized Input:** The Transform button is disabled (or `TransformRequestSchema` rejects) for empty strings or inputs exceeding 8,192 characters. A `400` response with `'Invalid request: text is required (max 8 KB)'` is returned.
- **LLM Transformation Failure:** If `CFLTTransformer.transform()` returns an `{ error }` object or throws, the route returns `500 Transformation failed`. The UI renders an inline error state and the result card is not shown.
- **TTS Generation Failure:** `/api/tts` returns `500 TTS generation failed`. The `PlayCircle` button exits its loading state; the learner can retry without losing the transform result.
- **VoiceChallenge Errors:** Microphone permission errors and evaluation failures are handled within the `VoiceChallenge` component and displayed inline below the result card. They do not affect the Transform result display.
- **History Write Failure (Phase 1):** `.cfrecord` write failures are logged server-side but do not cause the API response to fail. The learner receives their CFLT result even if the history entry could not be persisted.

## Phased Rollout

| Phase | Transform Mode additions |
|-------|--------------------------|
| **Phase 1 — Foundation** | Full CFLT display, TTS playback, VoiceChallenge (Phase 1 scores), `.cfrecord` transform history persistence, Stats/History tab |
| **Phase 2 — Progress Tracking** | `VoiceChallenge` renders four per-block CFLT sub-scores (`scoreCoreAction`, `scoreCondition`, `scoreSpaceContext`, `scoreTime`) once the Phase 2 evaluator prompt is deployed |
| **Phase 3 — Cross-mode Integration** | Vocabulary mastery annotations on `cflt_l2` blocks from `.cfrecord`; "Generate a Course on this topic" prompt surfaced after transform result; `standardL2` tokens upserted to vocabulary mastery in `.cfrecord` with Transform-mode mastery weight |
| **Phase 4 — CFLT Profiling** | Per-user CFLT weakness radar incorporates Transform Mode voice attempt sub-scores; SM-2 spaced repetition review scheduling surfaces weak vocabulary tokens within the Transform input suggestions |
