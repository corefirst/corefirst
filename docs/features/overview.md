# Feature Overview

> Auto-generated index of feature specs for CoreFirst.
> Updated: 2026-05-11

## Features

| Feature | Description | Dependencies | Status |
|---------|-------------|--------------|--------|
| [Logic Transformer](./logic-transformer.md) | Core AI engine for CRST restructuring | none | shipped |
| [History & Storage](./history-storage.md) | Multi-user partitioning & sync-safe event storage | none | shipped |
| [Voice Challenge](./voice-challenge.md) | Audio recording & CFLT-aware speech evaluation component | none | shipped |
| [Transform Mode](./transform-mode.md) | Ad-hoc sentence restructuring & practice flow | logic-transformer, voice-challenge | shipped |
| [Courseware Generator](./courseware-generator.md) | AI engine for scenario-based lesson generation | logic-transformer | shipped |
| [Course Mode](./course-mode.md) | Structured lesson flow with Learn/Practice modes | courseware-generator, voice-challenge | shipped |
| [Roleplay Coach](./roleplay-coach.md) | Multi-turn conversational AI with real-time coaching | voice-challenge | shipped |
| [Progress Analytics](./progress-analytics.md) | Visual dashboard & SRS vocabulary management | history-storage | shipped |

## Execution Order

The following order represents the foundational-to-applied dependency chain of the CoreFirst system:

1. **History & Storage** — Provides the persistent layer for all user events and partitioning.
2. **Logic Transformer** — The central pedagogical engine used by all other modes.
3. **Voice Challenge** — The production-layer component used by Transform, Course, and Roleplay.
4. **Transform Mode** — The first application of the Logic Transformer for ad-hoc learning.
5. **Courseware Generator** — Leverages the Transformer to build structured content.
6. **Course Mode** — The structured practice UI for generated courseware.
7. **Roleplay Coach** — The open-ended output stage of the learning journey.
8. **Progress Analytics** — Aggregates data from all the above for long-term tracking.
