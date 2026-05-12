# Feature Overview

> Feature spec index for CoreFirst.
> Updated: 2026-05-12

## Features

| Feature | Description | Dependencies | Status |
|---------|-------------|--------------|--------|
| [User Identity](./user-identity.md) | UUID-based user identity, middleware auto-assignment, household profile switcher | none | shipped |
| [Settings & AI Config](./settings-ai-config.md) | In-app provider/key/URL configuration, BYOK, per-request model overrides for all AI routes | user-identity | shipped |
| [Logic Transformer](./logic-transformer.md) | Core AI engine for CFLT restructuring | none | shipped |
| [History & Storage](./history-storage.md) | Per-user PouchDB partitioning & sync-safe event storage | user-identity | shipped |
| [Voice Challenge](./voice-challenge.md) | Audio recording & CFLT-aware speech evaluation; BYOK headers; 401 key-error surface | none | shipped |
| [Transform Mode](./transform-mode.md) | Ad-hoc restructuring + Cover & Recall self-test + Phonetic Bridge + post-result CTAs | logic-transformer, voice-challenge | shipped |
| [Courseware Generator](./courseware-generator.md) | AI lesson generation with SSE real-time progress streaming | logic-transformer | shipped |
| [Course Mode](./course-mode.md) | Learn/Practice/Voice flow with server-persisted puzzle completion state | courseware-generator, voice-challenge | shipped |
| [Roleplay Coach](./roleplay-coach.md) | Multi-turn AI coach with CFLT Build Mode pre-production scaffold | voice-challenge | shipped |
| [Progress Analytics](./progress-analytics.md) | Dashboard + SRS Vocabulary Review modal + Cross-Tab usage analytics | history-storage | shipped |

## Execution Order

The following order represents the foundational-to-applied dependency chain of the CoreFirst system:

1. **User Identity** — Assigns stable UUIDs per browser/device; foundation for all per-user storage and settings.
2. **Settings & AI Config** — Lets users configure providers and keys in-app; sits above identity, below all AI features.
3. **History & Storage** — Provides the persistent layer for all user events and partitioning.
4. **Logic Transformer** — The central pedagogical engine used by all other modes.
5. **Voice Challenge** — The production-layer component used by Transform, Course, and Roleplay.
6. **Transform Mode** — The first application of the Logic Transformer for ad-hoc learning.
7. **Courseware Generator** — Leverages the Transformer to build structured content.
8. **Course Mode** — The structured practice UI for generated courseware.
9. **Roleplay Coach** — The open-ended output stage of the learning journey.
10. **Progress Analytics** — Aggregates data from all the above for long-term tracking.
