# CoreFirst

**An open-source, AI-driven bilingual learning platform built on Core-First Language Theory (CFLT).**

Instead of memorizing grammar rules, CoreFirst trains learners to restructure thoughts using a universal sequencing protocol — eliminating the cognitive overhead of L1→L2 mental translation at its root.

> Project home: [corefirst.world](https://corefirst.world)

---

## The Core Idea

Traditional language learning forces a real-time mental switch:
*Think in Chinese word order → restructure → produce English.*

CoreFirst eliminates this by teaching one rule first:

```
[Core Action/Result] → [Condition/Reason] → [Space/Context] → [Time]
```

Once a learner habitually sequences thoughts this way — regardless of language — producing fluent English becomes a simple token replacement, not a structural overhaul.

**Example:**

| Stage | Sentence |
|-------|----------|
| Chinese L1 order | 昨天下雨，我在家没出去。*(Time → Reason → Result)* |
| CFLT-L1 | 我没出去，因为下雨，在家，昨天。*(Result → Reason → Space → Time)* |
| CFLT-English | I didn't go out, because it rained, at home, yesterday. |

---

## Features

### Core Engine
- **Logic Transformer** — Converts freeform input into CFLT-structured output with bilingual mapping, grammar overlay, and correction annotations
- **CFLT Validator** — Enforces the four-element protocol; flags non-conformant sequences

### Learning Modes
- **Transform** — Discover CFLT on any sentence; ad-hoc structured rewriting + voice challenge
- **Course** — Generated lesson packages (`.corefirst` ZIP) with scenario, dialogue scripts, pre-rendered audio + scene images
- **Roleplay** — Multi-turn AI dialogue with per-turn CFLT compliance feedback
- **Voice Challenge** — Records speech, transcribes, scores pronunciation and Core-Action prosodic emphasis
- **CFLT Builder** — Drag-and-drop sentence sorting (Framer Motion)
- **Phonetic Bridge** — Maps Pinyin sounds to English IPA phonemes for Chinese speakers
- **Progress Dashboard** — Recharts analytics over `.cfrecord` learning logs

---

## Architecture at a Glance

- **Frontend:** Next.js 16 + React 19 + Tailwind v4
- **AI layer:** [Vercel AI SDK](https://ai-sdk.dev) — provider-agnostic by design. Split per *capability* (text / text-to-image / text-to-speech / speech-to-text) and per *feature* (transform / courseGen / roleplay / speechEval / imageGen / tts / stt). Each feature configures its own provider + model independently.
- **Provider catalog:** SaaS (`google` / `openai` / `anthropic` / `openrouter`), local daemon (`ollama`), subscription CLIs (`cli/claude` / `cli/gemini`), and any OpenAI-compatible local server (Kokoro / faster-whisper / Piper / LM Studio / vLLM…) via `<FEATURE>_BASE_URL`.
- **Storage:** **No database.** Course content lives in self-contained `.corefirst` ZIP packages; learner progress lives in plain JSON `.cfrecord` files. See [`docs/storage-design.md`](docs/storage-design.md).
- **Validation:** Zod everywhere — at LLM output boundary, at file read/write, at API request boundary.

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19 |
| Styling | Tailwind CSS v4, Framer Motion |
| AI SDK | [Vercel AI SDK](https://ai-sdk.dev) |
| LLM (default) | Google Gemini 3 Flash / Pro |
| Image (default) | Google Imagen 4 |
| TTS (default) | OpenAI `gpt-4o-mini-tts` |
| STT (default) | OpenAI `gpt-4o-mini-transcribe` |
| Storage | File-based (`.corefirst` ZIP + `.cfrecord` JSON) |
| Validation | Zod |
| Charts | Recharts |
| Testing | Vitest |

---

## Quick Start

Three supported run modes — pick whichever matches your environment.

### Mode A: Hybrid (recommended for daily Mac dev)

AI sidecars (Kokoro TTS + faster-whisper STT) in Docker, CoreFirst itself runs natively with hot reload. Ollama stays native for Apple Silicon Metal acceleration.

```bash
git clone https://github.com/corefirst/corefirst.git
cd corefirst
pnpm install
cp .env.example .env                  # fill in API keys (or skip — see below for zero-key paths)

# Bring up local TTS/STT sidecars
docker compose up -d                  # starts kokoro + faster-whisper

# Optional: native Ollama for text features (already running for many users)
ollama serve

# Run the app with hot reload
pnpm dev                              # → http://localhost:3000
```

### Mode B: Full Docker (one-command demo / server deploy)

Everything containerized, including the CoreFirst app.

```bash
cp .env.example .env                  # set keys before starting
docker compose --profile full up -d   # kokoro + faster-whisper + corefirst-app
# → http://localhost:3000
```

Inside the compose network, the app talks to `kokoro:8880` and `faster-whisper:8000` by service name; Ollama is reached via `host.docker.internal:11434` (Linux compat handled via `extra_hosts: host-gateway`).

### Mode C: Native (no Docker)

If you'd rather run sidecars directly:

```bash
pnpm install
cp .env.example .env

# Install + run Kokoro-FastAPI and faster-whisper-server natively (see their READMEs)
# Or skip TTS/STT and use real OpenAI by leaving TTS/STT_BASE_URL unset.

pnpm dev
```

---

## Configuration

Every AI feature has its own `<FEATURE>_PROVIDER` and `<FEATURE>_MODEL` knob, with capability-level defaults and baked-in defaults underneath. Three resolution levels:

```
<FEATURE>_PROVIDER  >  <CAPABILITY>_PROVIDER  >  baked-in default
<FEATURE>_MODEL     >  <CAPABILITY>_MODEL     >  baked-in default
<FEATURE>_BASE_URL  >  <CAPABILITY>_BASE_URL  >  provider's default URL
<FEATURE>_API_KEY   >  <CAPABILITY>_API_KEY   >  provider's default env key
```

The 7 features and their default providers/models:

| Feature | Capability | Default | Used by |
|---|---|---|---|
| `transform` | text | `google` / `gemini-3.1-pro-preview` | `/api/transform` |
| `courseGen` | text | `google` / `gemini-3.1-pro-preview` | `/api/generate-course` |
| `roleplay` | text | `google` / `gemini-3-flash-preview` | `/api/roleplay` |
| `speechEval` | text | `google` / `gemini-3-flash-preview` | `/api/speech-eval` LLM scoring |
| `imageGen` | text-to-image | `google` / `imagen-4.0-generate-001` | course package builder |
| `tts` | text-to-speech | `openai` / `gpt-4o-mini-tts` | course audio + Transform/Roleplay playback |
| `stt` | speech-to-text | `openai` / `gpt-4o-mini-transcribe` | `/api/transcribe`, `/api/speech-eval` |

### Minimum `.env` (defaults — paid SaaS path)

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key   # text + image
OPENAI_API_KEY=your_openai_key                 # tts + stt
```

That's it. Everything else has defaults.

### Mix providers per feature

```env
# courseGen on Anthropic API for quality, roleplay on local Claude CLI for free
COURSE_GEN_PROVIDER=anthropic
COURSE_GEN_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=...

ROLEPLAY_PROVIDER=cli/claude
# ROLEPLAY_MODEL unset → CLI uses your logged-in account's default model
```

### Fully local OSS path

Pair the Hybrid Docker setup with Ollama for text:

```env
TEXT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
TRANSFORM_MODEL=qwen2.5-coder:32b-instruct-q8_0
COURSE_GEN_MODEL=qwen2.5-coder:32b-instruct-q8_0
ROLEPLAY_MODEL=qwen2.5-coder:32b-instruct-q4_K_M
SPEECH_EVAL_MODEL=qwen2.5-coder:32b-instruct-q4_K_M

TTS_PROVIDER=openai
TTS_BASE_URL=http://localhost:8880/v1     # Kokoro-FastAPI from compose
TTS_MODEL=kokoro
TTS_VOICE=af_sky

STT_PROVIDER=openai
STT_BASE_URL=http://localhost:8000/v1     # faster-whisper-server from compose
STT_MODEL=Systran/faster-whisper-large-v3

# imageGen via local Ollama (zero API key)
IMAGE_GEN_PROVIDER=openai
IMAGE_GEN_MODEL=x/z-image-turbo
IMAGE_GEN_BASE_URL=http://localhost:11434/v1
IMAGE_GEN_API_KEY=ollama
# Or fall back to Google Imagen:
# IMAGE_GEN_PROVIDER=google
# GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key
```

### Zero-API-key text path (Claude / Gemini CLI)

If you have [Claude Code](https://docs.claude.com/claude-code) or [Gemini CLI](https://github.com/google/gemini-cli) installed and logged in:

```env
TEXT_PROVIDER=cli/claude              # or cli/gemini
# TEXT_MODEL unset → uses whatever your CLI account is configured for
```

Subscription CLIs handle text only; image / TTS / STT still need their own backends.

Full reference and worked examples: see [`.env.example`](./.env.example) and [`docs/tech-design.md`](docs/tech-design.md) §6.

> **Pre-baked local stack:** [`.env.localstack.example`](./.env.localstack.example) is a complete working `.env` for the Mac mini / Apple-Silicon recipe — Ollama text + Kokoro TTS + faster-whisper STT + Ollama z-image. It bundles the `docker run` commands and `curl` verification one-liners as comments. Drop-in:
>
> ```bash
> cp .env.localstack.example .env.local      # .env.local is git-ignored — your edits stay local
> ```

---

## Local OSS Stack — what runs where

The `docker-compose.yml` wires these together; you can also run any of them standalone.

| Component | Technology | Port | Why this choice |
|---|---|---|---|
| TTS | [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) | 8880 | 82M params, RTF<0.05 on Apple Silicon, OpenAI-compatible `/v1/audio/speech`. Smaller and simpler to set up than Orpheus while quality is comparable. |
| STT | [faster-whisper-server](https://github.com/fedirz/faster-whisper-server) | 8000 | Whisper Large-v3 with CTranslate2 backend (4–8× faster than vanilla Whisper), OpenAI-compatible `/v1/audio/transcriptions`. |
| Text | Ollama (native) | 11434 | Stays on the host so Mac Metal acceleration works. Linux deploy can flip the commented `ollama:` block in compose. |
| Image | Ollama (`x/z-image-turbo` etc.) **or** Google Imagen | 11434 | Ollama exposes an experimental OpenAI-compatible `/v1/images/generations` endpoint — point `IMAGE_GEN_BASE_URL=http://localhost:11434/v1` at it for fully-local images. |

For STT specifically, see the caveat in [`.env.example`](./.env.example): Whisper-family models auto-correct accent, which is great for transcribing roleplay input but masks pronunciation errors in `/api/speech-eval`. Phoneme-level evaluation (wav2vec2-phoneme) is roadmap.

---

## Storage

CoreFirst persists nothing in any database. Two file types under `data/`:

```
data/
  packages/           *.corefirst   — ZIP: manifest.json + audio/*.mp3 + images/*.webp
                                      Read-only after generation; safe to share.
  records/            *.cfrecord    — Plain JSON: per-package learner progress
                      _global.cfrecord — Transform / Roleplay history with no course context
```

Schemas: [`docs/package-format.md`](docs/package-format.md). Higher-level model: [`docs/storage-design.md`](docs/storage-design.md).

Override the data root with `COREFIRST_DATA_DIR=/some/path` if you need to.

---

## Extending CoreFirst

CoreFirst is designed for secondary development. Every major module is independently swappable.

### Add a new SaaS provider

Drop a new file under `src/lib/ai/<capability>/sdk/<provider>.ts` exporting a builder function (return the AI SDK model type for that capability), add the provider id to `PROVIDERS_BY_CAPABILITY` in `src/lib/ai/capabilities.ts`, and add a `case` to the corresponding factory.

### Add a local OpenAI-compatible server

No code change needed. Set `<FEATURE>_PROVIDER=openai` plus `<FEATURE>_BASE_URL=http://your-server/v1` in `.env`. The bundled `openai` provider rebuilds itself with the custom base URL on a per-feature basis.

### Add a new feature

Add an entry to `FEATURES` in `src/lib/ai/capabilities.ts` (specify capability, env prefix, default provider/model). Wire your route handler to import the resulting model from `src/lib/ai/index.ts`. Done.

### Add a language pair

Add a prompt template variant in `src/core/system_prompt.md` and a UI selector option. No core logic changes required. Add canonical test vectors to `tests/core/test_vectors.md`.

### Add an industry module

Today, industry context flows through the free-text `industry_context` field on `GenerationRequest`, and the LLM follows the prompt at `src/generator/courseware_prompt.md` to bias vocabulary appropriately. To embed a token pack, extend that prompt template with an "Industry Vocabulary Focus" section. A structured JSON token-pack injection mechanism is on the roadmap (P2).

---

## Testing

```bash
pnpm test           # full vitest suite (29 tests)
pnpm exec tsc --noEmit --ignoreDeprecations 6.0   # type check
pnpm build          # next standalone build (used by Docker image)
```

Test vectors for CFLT correctness are in `tests/core/test_vectors.md`. All five canonical Chinese↔English transformation cases must pass.

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/prd.md`](docs/prd.md) | Product Requirements Document |
| [`docs/tech-design.md`](docs/tech-design.md) | Technical architecture, env vars, module breakdown |
| [`docs/learning-architecture.md`](docs/learning-architecture.md) | Three-mode learning system + cross-mode integration phases |
| [`docs/storage-design.md`](docs/storage-design.md) | `.corefirst` and `.cfrecord` design rationale |
| [`docs/package-format.md`](docs/package-format.md) | On-disk schemas for both file formats |
| [`docs/refactor-plan.md`](docs/refactor-plan.md) | Capability/feature provider architecture (this design's reference) |
| [`docs/features/`](docs/features/) | Per-feature specs (transform / course / roleplay / voice / etc.) |
| [`.env.example`](./.env.example) | Full env reference with worked examples |
| [`.env.localstack.example`](./.env.localstack.example) | Drop-in `.env.local` for the all-OSS Mac/Linux stack (Ollama + Kokoro + faster-whisper) |
| [cflt.center](https://cflt.center) | CFLT theoretical framework (separate repository) |

---

## Theoretical Framework

CoreFirst is the first reference implementation of **CFLT — Core-First Language Theory**, which extends Chomsky's *core grammar* from a structural category to a dynamic sequencing rule:

> *The cognitive core of an utterance is also its universally-prioritized linear position.*

CFLT lives in its own repository, separate from any single product:

- **Theory & specification:** [cflt.center](https://cflt.center)
- **Source:** [github.com/corefirst/cflt](https://github.com/corefirst/cflt)
- **License:** CC BY 4.0

See the [CFLT manifesto](https://cflt.center) for the full academic treatment of the framework.

---

## Related Projects

CoreFirst is the reference implementation of **Pillar I** of CFLT — Human Bilingual Education for language learners.

CFLT also defines a **Pillar II** — applying the same Core-First sequencing rule as a standardized reasoning protocol for LLMs and AI agents. Pillar II is **not implemented in this repository**. Its natural home is the [apcore ecosystem](https://github.com/apcore) (a separate framework family providing multi-language SDKs, CLI tooling, and MCP integration), where it will eventually land as a dedicated module (e.g., `apcore-cflt`).

The two projects share theory at [cflt.center](https://cflt.center) but ship independently. For the full cross-project vision, see the [CFLT vision document](https://github.com/corefirst/cflt/blob/main/vision.md).

---

## Contributing

Contributions are welcome. Please open an issue or pull request. Areas especially suited for community contribution:

- New language pair prompt templates and test vectors
- Industry-specific vocabulary token packs
- Additional providers (image, TTS/STT alternatives, new text providers)
- UI/UX improvements
- Translations of documentation

---

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
