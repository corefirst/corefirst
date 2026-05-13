# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
