# Product Requirements Document — CoreFirst

> Version: 1.0.0 | Status: Active | Last Updated: 2026-05-07

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
- **Value prop:** Clean TypeScript codebase, modular API routes, Prisma-backed persistence, LLM-agnostic architecture

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
**Integration:** Embedded in `/api/speech-eval` prompt

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

---

## 6. Out of Scope

| Item | Reason |
|------|--------|
| Payment / subscription billing | Open-source v1; no monetization features |
| Mobile native app (iOS/Android) | Web-first; React Native adaptation is a community fork concern |
| Offline mode | LLM API dependency requires connectivity |
| L1 acquisition (children learning first language) | Fundamentally different from CFLT's L2 use case |
| Hard-coded local dictionary | MVP is fully LLM-driven for iteration speed |
| User authentication / accounts | Intentionally omitted in v1; local/session persistence only |
| LLM-protocol layer (Apcore ecosystem integration) | Belongs to a sister project in the apcore ecosystem; see §11 Related Projects |

---

## 7. Open Source & Extensibility Requirements

### 7.1 License
Apache License 2.0. All contributions must be compatible.

### 7.2 Extension Points

Every major module must be independently swappable without modifying core logic:

| Extension Point | Interface | How to Swap |
|----------------|-----------|-------------|
| Text Provider | `src/lib/ai/text/factory.ts` (`buildTextModelFor(featureKey)` — dispatches on `TEXT_PROVIDER` and per-feature overrides) | Add a branch under `text/sdk/` for SaaS providers, or `text/cli/` for new subscription-CLI providers |
| Image Provider | `src/lib/ai/text-to-image/factory.ts` (`buildImageModel` — dispatches on `TEXT_TO_IMAGE_PROVIDER` / `IMAGE_GEN_PROVIDER`) | Add a branch under `text-to-image/sdk/`. CLI providers are not supported here — text-only |
| TTS Provider | `src/lib/ai/text-to-speech/factory.ts` (`buildSpeechModel` — dispatches on `TEXT_TO_SPEECH_PROVIDER` / `TTS_PROVIDER`) | Add a branch under `text-to-speech/sdk/` |
| STT Provider | `src/lib/ai/speech-to-text/factory.ts` (`buildTranscriptionModel` — dispatches on `SPEECH_TO_TEXT_PROVIDER` / `STT_PROVIDER`) | Add a branch under `speech-to-text/sdk/` |
| Storage | `src/lib/storage/` — `.corefirst` packages + `.cfrecord` records | File-based; no DB. Swap the persistence layer by replacing `package.ts` / `record.ts` |
| Language Pair | `{{SOURCE_LANG}}` / `{{TARGET_LANG}}` placeholders in `src/core/system_prompt.md` and `src/generator/courseware_prompt.md` | Add UI selector option + canonical test vectors |
| Industry Module | `industry_context` field on `GenerationRequest` | Free-text today; structured token-pack injection is a P2 follow-up |

### 7.3 Developer Experience Requirements

- Single `pnpm install && pnpm dev` startup (no external services required for basic demo)
- All API keys configurable via `.env` (documented in `.env.example`)
- Prisma migrations auto-applied on first run
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
| API keys | Google Gemini (text default + Imagen), OpenAI (TTS + STT). `OPENROUTER_API_KEY` only when a text feature uses provider `openrouter`. **No API key required when text features use `cli/claude` or `cli/gemini`** — the local CLI subscription is used directly |

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
- `plans/` — Implementation plans (completed and in-progress; consumed by code-forge)
- `tests/core/test_vectors.md` — CFLT validation test vectors
