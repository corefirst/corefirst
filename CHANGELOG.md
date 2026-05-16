# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-05-16
### Added
- **Desktop App (F-22):** Cross-platform Electron-based desktop application with a bundled Next.js server, dev server support, and service worker registration.
- **Internationalization (F-23):** Full i18n support across all UI components and user-facing messages.
- **Ollama Visual Provider:** Local image generation via Ollama, adding an offline-capable visual provider option.
- **AI Provider Test CLI:** New `test-provider` CLI command for validating LLM, TTS, STT, and image provider connectivity end-to-end.
- **Footer Component:** Added site footer with copyright information and project links.

### Changed
- Migrated OpenRouter provider from a custom adapter to `@ai-sdk/openai` for better compatibility and timeout support.
- Replaced compact `ProfileSwitcher` inline with a reorganized dashboard header layout.
- SRS due-date calculations are now timezone-safe.
- Implemented strict Zod schemas for OpenAI Structured Outputs; updated default model identifiers for TTS and STT.
- Standardized image size parsing and aspect-ratio normalization into shared utility functions.
- Renamed `GOOGLE_API_KEY` to `GOOGLE_GENERATIVE_AI_API_KEY` and added provider-availability checks at startup.
- Improved Electron server initialization: graceful shutdown, request timeouts on history fetches, and first-run open-browser behavior.
- Extracted course lesson rendering into a dedicated `CourseHistory` component.

## [0.5.0] - 2026-05-14
### Added
- **Qwen Provider Suite:** Qwen TTS, Qwen native STT, and Qwen Wanx image generation (with async polling and fallback API key resolution).
- **Google Gemini TTS Voices:** Added multi-voice support to the Google Gemini TTS provider.
- **Model Selection UI:** Persistent AI configuration with per-provider model presets; settings are saved to local disk and reloaded on restart.
- **ComboBox Component:** Replaced native `<datalist>` elements with a searchable ComboBox for domain and scenario selection.
- **History Pagination:** Load-more pagination for Transform, Roleplay, and Course history lists.
- **Young Learner Safeguards:** Age and domain-specific guidance injected into courseware generation; lightweight script audit flags content unsuitable for young learners.

### Changed
- Renamed "industry" to "domain" across the entire codebase; added a one-time migration utility for existing learner records.
- Externalized AI provider configuration into hot-reloadable dynamic modules with a `/api/config/refresh` endpoint.
- Standardized all AI service factories under a unified request-context pattern; improved header propagation for TTS, STT, and transcription services.
- Implemented language-code mapping in the speech evaluator so transcription requests target the correct locale.
- Hardened Roleplay API with strict slot-level Zod validation, flexible multi-format slot parsing, and a JSON salvage path for malformed model responses.

## [0.4.0] - 2026-05-13
### Added
- **Progress Analytics & SRS (F-04):** Implemented SM-2 algorithm for spaced repetition and vocabulary mastery tracking.
- **UI-Configurable AI Provider (F-15):** Added a Settings panel allowing users to configure AI providers, API keys, and model overrides directly from the browser.
- **BYOK Error Handling (F-16):** Improved 401/403 error handling with inline prompts to "Open Settings" when API keys are missing or invalid.
- **SSE for Course Generation (F-21):** Added real-time progress updates via Server-Sent Events during the 20-30 second course generation process.
- **Vocabulary Review (F-19):** Added a dedicated SRS flashcard drill component for reviewing due vocabulary.
- **Phonetic Bridge (F-07):** Added an interactive Pinyin-to-IPA mapping component for Chinese speakers.

### Changed
- Enhanced speech evaluator prompt to return detailed 4-element sub-scores.
- Improved accessibility with ARIA labels and roles across the Settings panel.

## [0.3.0] - 2026-05-12
### Added
- **Multi-User Storage Partitioning (F-12):** Implemented UUID-based user identity with middleware auto-assignment and a `ProfileSwitcher` component.
- **History Management (F-13):** Added edit and delete capabilities for transforms, roleplay sessions, and course packages.
- **Sync-Safe Per-Event Persistence (F-14):** Migrated to a PouchDB-backed (but still file-first) event storage model to prevent multi-device sync conflicts.
- **Cross-Tab Vocabulary Analytics (F-20):** Added tracking for organic vocabulary usage in Roleplay conversations.

### Changed
- Consolidated generated media into a shared global pool to improve caching efficiency.
- Simplified `user.ts` by removing the `COREFIRST_DEFAULT_USER` constant.

## [0.2.0] - 2026-05-11
### Changed
- **Major Architecture Refactor:** Dropped SQLite and Prisma in favor of a purely file-based storage system (`.cfrecord` + `.corefirst`).
- Removed `prisma/`, `prisma.config.ts`, and all `@prisma/*` / `@libsql/client` dependencies.
- Updated `docs/storage-design.md` and `docs/package-format.md` to reflect the new file-first architecture.
- Added four-element CFLT sub-scores (`coreScore`, `reasonScore`, `spaceScore`, `timeScore`) to speech evaluation.

### Fixed
- Improved crash safety for learner records using an atomic write-rename strategy.

## [0.1.0] - 2026-05-10
### Added
- **Initial MVP Release:** CoreFirst reference implementation of Pillar I (Human Bilingual Education).
- **Transform Mode:** Discover CFLT on any sentence with ad-hoc structured rewriting.
- **Course Mode:** Generated lesson packages with scenario, dialogue, and audio/image assets.
- **Roleplay Mode:** Multi-turn AI dialogue with per-turn CFLT compliance feedback.
- **Voice Challenge:** Speech-to-text recording with pronunciation and prosodic scoring.
- **Logic Transformer Engine:** Central processing for CFLT sequence enforcement.
- **Courseware Generator:** Automated creation of `.corefirst` ZIP packages.
- **Stats Dashboard:** Initial Recharts-powered progress tracking.
