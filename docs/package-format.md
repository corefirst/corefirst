# Package Format Specification — CoreFirst

> Software version: 0.2.0 | Status: Active | Last Updated: 2026-05-11
> Companion documents: `docs/storage-design.md`, `docs/tech-design.md`

---

## 1. Overview

This document specifies the on-disk shapes for CoreFirst persistence:

1. **`<slug>.json`** — Lite manifest (V3 primary form) — the source of truth for course content
2. **`<slug>.corefirst`** — Full ZIP package (V3 optional export form) — embeds the manifest + media for offline distribution
3. **PouchDB collections** — Per-user learner records (state, events, SRS)
4. **CAS media pool** — Hash-named blobs in `data/users/<userId>/media/`

V1 and V2 legacy formats (inline-audio ZIP, plain `.cfrecord` JSON, single-doc `cflog`) are read-only-compatible; on first run migration scripts upgrade them in place.

For the high-level architecture story see `docs/storage-design.md`.

---

## 2. Course Package — Lite Manifest (`<slug>.json`)

The **Lite manifest** is the V3 primary form: a single JSON file under `data/users/<userId>/packages/<slug>.json` containing the entire `PackageManifest`. Media is referenced by hash (`audioFile` / `imageFile` fields) and lives in the per-user CAS pool, not inside the manifest.

### 2.1 Top-Level Object

```json
{
  "packageId": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "it-english-adult-networking",
  "topic": "Business Networking",
  "ageGroup": "adult",
  "industry": "IT",
  "sourceLang": "Chinese",
  "targetLang": "English",
  "createdAt": "2026-05-11T10:00:00.000Z",
  "version": "1",
  "lessons": [ ... ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `packageId` | string (UUID v4) | Yes | Canonical identifier. Immutable after generation. |
| `slug` | string | Yes | Filename base and join key for every state/event doc. Derived from `industry + targetLang + ageGroup + topic` (see §2.5). |
| `topic` | string | Yes | Course topic. Editable via `PATCH /api/courses/[slug]` — the slug is **not** regenerated when topic changes. |
| `ageGroup` | string | Yes | Age persona. |
| `industry` | string | Yes | Industry context. |
| `sourceLang` | string | Yes | Learner's native language. |
| `targetLang` | string | Yes | Target language. |
| `createdAt` | string (ISO 8601) | Yes | Package creation timestamp. |
| `version` | string | Yes | Format version. Current: `"1"`. |
| `lessons` | array of `LessonSchema` | Yes | Ordered lessons (min 1). |

### 2.2 `LessonSchema`

```json
{
  "lessonIndex": 0,
  "title": "Breaking the Ice at a Tech Conference",
  "scenario_desc": "...",
  "vocabulary_focus": [
    { "token": "leverage", "meaning": "to use something to its maximum advantage" }
  ],
  "visual_generation_prompts": ["..."],
  "imageFile": "a1b2c3d4e5f6a7b8.webp",
  "scripts": [ ... ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lessonIndex` | integer ≥ 0 | Yes | Position; matches state/event doc references. |
| `title` | string | Yes | |
| `scenario_desc` | string | Yes | |
| `vocabulary_focus` | array `{token, meaning}` | Yes | Captured into SRS on practice. |
| `visual_generation_prompts` | string[] | Yes | First prompt feeds image generation. |
| `imageFile` | string | No | Hash filename of the lesson image (`<hash>.webp`). Resolved from the per-user CAS pool. Absent when image generation was skipped or failed. |
| `videoFile` | string | No | Forward-compat slot for lesson video. |
| `scripts` | array of `ScriptSchema` | Yes | Dialogue lines. |

### 2.3 `ScriptSchema`

```json
{
  "scriptIndex": 0,
  "speaker": "User",
  "cfltL1": "[Core: 没出门] [Reason: 因为下雨] [Space: 在家] [Time: 昨天下午]",
  "cfltL2": "[Core: I didn't go out] [Reason: because it rained] [Space: at home] [Time: yesterday afternoon]",
  "standardL2": "I didn't go out yesterday afternoon because it rained.",
  "standardL1": "昨天下午下雨我就没出门。",
  "ssml": "<speak>...</speak>",
  "audioFile": "deadbeef12345678.mp3"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scriptIndex` | integer ≥ 0 | Yes | Position within the lesson. |
| `speaker` | string | Yes | Role label (e.g. `"User"`, `"AI Coach"`). |
| `cfltL1` | string | Yes | CRST-restructured sentence in the source language. |
| `cfltL2` | string | Yes | Token-swapped CRST in the target language. |
| `standardL2` | string | Yes | Polished idiomatic target sentence. Shown after Practice mode unlocks. |
| `standardL1` | string | No (default `""`) | Natural source-language rendering. Used by **Learn mode** to anchor the CRST decomposition demo. Optional — older packages predate this field; UI falls back to `standardL2` when empty. Backfilled by the orchestrator's audit pass. |
| `ssml` | string | Yes | SSML with prosody on `[Core]`. Hashes into `audioFile`. |
| `audioFile` | string | No | Hash filename of the audio (`<hash>.mp3`). Resolved from the CAS pool. Absent when TTS generation failed. |
| `videoFile` | string | No | Forward-compat slot. |

### 2.4 CAS Media Pool

Media for the Lite manifest lives at `data/users/<userId>/media/<hash>.<ext>`:

* `<hash>` is `sha256(content).slice(0, 16)` — 16 hex chars from `src/lib/storage/hash.ts`
  * Audio: `sha256(script.ssml)`
  * Image: `sha256(lesson.visual_generation_prompts[0])`
* Same content across two courses ⇒ one file on disk (zero-cost dedup)
* `pruneOrphanMedia(userId)` reclaims unreferenced hashes — runs after every `writePackage` and `deletePackage`
* HTTP-served at `/api/media/<filename>` (validates filename against `/^[a-f0-9]{16}\.(mp3|webp|mp4|webm)$/` to prevent path traversal)

### 2.5 Slug Formula

```
slug = asciiSlug(industry) + '-' + asciiSlug(targetLang) + '-' + asciiSlug(ageGroup) + '-' + asciiSlug(topic)
```

Where `asciiSlug(s) = s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')`.

When `topic` contains only non-ASCII characters (e.g. Chinese topic for a Chinese learner), `asciiSlug(topic)` is empty; the formula falls back to `'t' + shortHash(topic)` where `shortHash` is a 32-bit FNV-1a in base 36.

**Collision handling**: `resolveUniqueSlug(userId, baseSlug, packageId)`:
* Slug free → returns `baseSlug`
* Slug owned by the same `packageId` (re-save) → returns `baseSlug`
* Slug owned by a *different* `packageId` → appends `-2`, `-3`, … until free

**Slug validation at API boundaries**: every route handler that consumes `[slug]` rejects anything outside `/^[a-z0-9-]+$/` with HTTP 400 before any storage call. This blocks `..` traversal via the URL.

---

## 3. Course Package — Full ZIP (`<slug>.corefirst`)

Optional sharing/export format. Created when `writePackage(userId, {…, saveFull: true})` is called. The Lite manifest is always written alongside; the ZIP is for portability.

### 3.1 Container Structure

```
<slug>.corefirst (ZIP, level 0 — MP3/WebP are already compressed)
├── manifest.json        # Identical content to <slug>.json
└── media/
    ├── <hash>.mp3       # Inline audio referenced by manifest.lessons[*].scripts[*].audioFile
    └── <hash>.webp      # Inline image referenced by manifest.lessons[*].imageFile
```

The ZIP is purely a transport — when imported on a fresh device, the reader extracts the manifest, places it in `data/users/<userId>/packages/<slug>.json`, and populates the CAS pool from `media/`.

### 3.2 Legacy V1 ZIP Format

V1 packages used positional filenames `audio/l<i>s<j>.mp3` and `images/l<i>.webp`. The reader still recognizes this form as a fallback when neither Lite manifest nor V3 `media/` entries are present — see `readPackageAudio` / `readPackageImage` in `src/lib/storage/package.ts`. New packages always emit V3.

---

## 4. Learner Records — PouchDB Collections

Per-user PouchDB instances under `data/users/<userId>/records/db_<collection>/`. Three collections:

### 4.1 `states` collection

One doc per slug (plus `'global'` for the ad-hoc no-course context). Stores lesson/script progress flags.

```json
{
  "_id": "it-english-adult-networking",
  "_rev": "1-...",
  "packageId": "550e8400-...",
  "packageSlug": "it-english-adult-networking",
  "lastStudiedAt": "2026-05-11T14:30:00.000Z",
  "lessons": [
    {
      "lessonIndex": 0,
      "scripts": [
        { "scriptIndex": 0, "puzzleCompleted": true }
      ]
    }
  ]
}
```

Schema: `CFStateSchema` (`src/lib/storage/schema.ts`). Updates go through `mutate()` because `puzzleCompleted = true` is idempotent and concurrent practice across devices is expected.

### 4.2 `events` collection — Per-event documents

Each learner event is its own document, ID-prefixed by slug for efficient `listByPrefix` enumeration. **This is the V3 conflict-free pattern**: distinct doc IDs cannot collide under multi-device replication.

| Event Type | ID Convention | Body Schema |
|---|---|---|
| Transform | `<slug>:transform:<isoTime>:<rand>` | `TransformEventSchema` |
| Voice attempt | `<slug>:attempt:<lesson>:<script>:<isoTime>:<rand>` | `AttemptEventSchema` |
| Roleplay session metadata | `<slug>:roleplay-session:<sessionId>` | `RoleplaySessionEventSchema` |
| Roleplay message | `<slug>:roleplay-msg:<sessionId>:<isoTime>:<rand>` | `RoleplayMessageEventSchema` |

Common fields on every event doc: `type`, `slug`, `createdAt`. Type-specific:

**Transform event** (`TransformEventSchema`):

```json
{
  "_id": "global:transform:2026-05-11T09:15:00.123Z:a1b2c3",
  "type": "transform",
  "slug": "global",
  "createdAt": "2026-05-11T09:15:00.123Z",
  "data": {
    "inputText": "...",
    "sourceLang": "Chinese",
    "targetLang": "English",
    "cfltL1": "...",
    "cfltL2": "...",
    "standardL2": "...",
    "createdAt": "2026-05-11T09:15:00.123Z"
  }
}
```

**Attempt event** (`AttemptEventSchema`):

```json
{
  "_id": "it-english-adult-networking:attempt:0:0:2026-05-11T14:31:00.000Z:f0e1d2",
  "type": "attempt",
  "slug": "it-english-adult-networking",
  "lessonIndex": 0,
  "scriptIndex": 0,
  "createdAt": "2026-05-11T14:31:00.000Z",
  "data": {
    "createdAt": "2026-05-11T14:31:00.000Z",
    "transcription": "...",
    "overallScore": 87,
    "pronunciation": 91,
    "logicStress": 83,
    "feedback": "...",
    "scoreCoreAction": null,
    "scoreCondition": null,
    "scoreSpaceContext": null,
    "scoreTime": null
  }
}
```

The four nullable `score*` fields are Phase 2 per-CRST-slot scoring; null in Phase 1.

**Roleplay session metadata** (`RoleplaySessionEventSchema`):

```json
{
  "_id": "global:roleplay-session:11111111-2222-4333-8444-555555555555",
  "type": "roleplay-session",
  "slug": "global",
  "sessionId": "11111111-...",
  "context": "Job interview at a startup",
  "sourceLang": "Chinese",
  "targetLang": "English",
  "createdAt": "2026-05-11T11:00:00.000Z"
}
```

The session metadata doc holds the editable `context` (renameable via `PATCH /api/history/roleplay/sessions/[sessionId]`). Cascade-deleted with all messages by `deleteRoleplaySession`.

**Roleplay message** (`RoleplayMessageEventSchema`):

```json
{
  "_id": "global:roleplay-msg:11111111-...:2026-05-11T11:00:45.000Z:9a8b7c",
  "type": "roleplay-msg",
  "slug": "global",
  "sessionId": "11111111-...",
  "createdAt": "2026-05-11T11:00:45.000Z",
  "data": {
    "role": "user",
    "content": "I have five years of experience.",
    "createdAt": "2026-05-11T11:00:45.000Z",
    "audioFile": "<hash>.webm",
    "correctedAudioFile": "<hash>.mp3",
    "userAnalysis": { ... },
    "coachAnalysis": { ... },
    "feedback": null
  }
}
```

`userAnalysis` and `coachAnalysis` are present only when CRST analysis was enabled at the time of the turn — see `data.userAnalysis` / `data.coachAnalysis` shapes in `src/lib/storage/schema.ts`.

### 4.3 `srs` collection — Spaced Repetition

Single doc keyed `'user'`. Holds the entire per-user vocabulary deck.

```json
{
  "_id": "user",
  "_rev": "...",
  "updatedAt": "2026-05-11T14:31:00.000Z",
  "vocabulary": [
    {
      "token": "leverage",
      "meaning": "to use something to its maximum advantage",
      "targetLang": "English",
      "mastery": 60,
      "interval": 4,
      "easeFactor": 2.5,
      "nextReviewAt": "2026-05-15T00:00:00.000Z",
      "reviewCount": 3,
      "lapseCount": 0,
      "firstSeenIn": {
        "slug": "it-english-adult-networking",
        "lessonIndex": 0,
        "scriptIndex": 0
      }
    }
  ]
}
```

* **Uniqueness**: composite key `(targetLang, token)`. Same surface form in different target languages tracked independently.
* **`firstSeenIn`**: reverse link to the script that introduced the token. Cleared by `orphanVocabularyForSlug` when the source course is deleted — the entry stays (mastery is real cognitive progress), only the back-link is broken.
* **Updates**: `mutate()`.

### 4.4 Legacy `.cfrecord` shape (read-only compatibility)

The V2 unified `.cfrecord` schema (`CFRecordSchema`) is still exposed by `readRecord` for backward compatibility with code that hasn't migrated to the per-event readers (`listTransformEvents`, `listRoleplaySessions`). The legacy shape is synthesized from `states` + `events` + `srs` at read time:

```json
{
  "packageId": "...",
  "packageSlug": "...",
  "lastStudiedAt": "...",
  "lessons": [ { "lessonIndex": 0, "scripts": [ ... ] } ],
  "vocabulary": [],
  "transforms": [ ... ],
  "roleplaySessions": [ ... ]
}
```

`vocabulary` is always empty on the legacy shape — the SRS deck is global and lives in the `srs` collection.

---

## 5. Package Generation Flow

Implemented by `buildAndWritePackage` in `src/generator/package-builder.ts`.

### Stage 1 — Generate CoursewareManifest

LLM produces the `CoursewareManifest` per `CoursewareManifestSchema` in `src/types/courseware.ts`. A `packageId` UUID is minted. The slug is computed via `buildSlug(industry, targetLang, ageGroup, topic)` then run through `resolveUniqueSlug(userId, baseSlug, packageId)` to handle collisions.

The orchestrator runs an audit pass over every script through `CFLTTransformer` to backfill `standard_l1` from `standard_l2` when the generator didn't produce it.

### Stage 2 — Render Audio via CAS

For each script:

```
hash = sha256(script.ssml).slice(0, 16)
script.audioFile = `${hash}.mp3`
poolFile = data/users/<userId>/media/<hash>.mp3

if poolFile exists:
  reuse                                  # CAS hit — same SSML across courses
else:
  audio = TTS.synthesize(script.ssml)
  fs.writeFile(poolFile, audio)
```

### Stage 3 — Render Images via CAS

Same pattern: `hash = sha256(visual_generation_prompts[0]).slice(0,16)`; `lesson.imageFile = '<hash>.webp'`. Image generation is optional — failures are logged and the manifest writes without `imageFile`.

### Stage 4 — Write Manifest and Optional ZIP

`writePackage(userId, input)`:

1. Always writes `<slug>.json` (the Lite manifest)
2. When `input.saveFull` is true, also bundles a `<slug>.corefirst` ZIP with the manifest and inline media

After write, `pruneOrphanMedia(userId)` runs in the background to reclaim hashes dropped by the new manifest (re-generating a course no longer leaks the old TTS files).

---

## 6. Package Import Flow

`readPackageManifest(userId, slug)`:

1. Try Lite manifest at `<slug>.json` (fast path)
2. Fall back to Full ZIP at `<slug>.corefirst` and read the embedded `manifest.json` (sharing path)
3. Throw `PackageNotFoundError` if neither exists

Audio/image readers (`readPackageAudio`, `readPackageImage`) prefer the per-user CAS pool, fall back to ZIP-embedded media, and finally to the V1 positional filename fallback (`audio/l<i>s<j>.mp3`).

Learner records do not need to be imported — they live in PouchDB and are created on first write.

---

## 7. Delete and Rename Operations

### 7.1 Course (`<slug>.json` + everything keyed by slug)

`deletePackage(userId, slug)` cascade (see `docs/storage-design.md` §6.5 for per-step details):

| Step | Action |
|---|---|
| `manifest` | `fs.unlink` the Lite JSON + Full ZIP if present |
| `state` | `db.remove` the `states/<slug>` doc |
| `events` | `listByPrefix(EVENTS, '<slug>:')` then `removeMany` (single `bulkDocs` round-trip) |
| `vocab` | `mutate(SRS, 'user')` clears `firstSeenIn` for entries from this slug. Entries themselves preserved. |
| `media` | `pruneOrphanMedia(userId)` reclaims orphaned hashes |

Returns `{ok, steps[], errors[]}`. The HTTP route returns `207 Multi-Status` on partial failure so the cascade is observable end-to-end.

`renamePackageTopic(userId, slug, newTopic)`:
* Reads the Lite manifest, replaces `topic`, writes it back
* **Slug stays unchanged** — every event doc and state doc keys on slug; renaming would orphan everything

### 7.2 Roleplay session

`deleteRoleplaySession(userId, slug, sessionId)`:
* Lists `<slug>:roleplay-msg:<sessionId>:` prefix → batch tombstone all message docs + the session metadata doc

`renameRoleplaySession(userId, slug, sessionId, newContext)`:
* `mutate()` the `<slug>:roleplay-session:<sessionId>` doc to update `context`

### 7.3 Individual events

`deleteHistoryEvent(userId, eventId)` — tombstones one doc by its full PouchDB `_id`. Used for single transform delete and single roleplay-message delete.

All deletes are **idempotent** (404 → success) so concurrent multi-device deletes don't error.

---

## 8. Format Versioning

| Version | Format |
|---------|--------|
| `"1"` | V1: ZIP-only, positional audio filenames, inline media (legacy) |
| `"1"` | V2: Lite JSON + Full ZIP, CAS hashes, separate `audio_hash`/`image_hash` fields (legacy) |
| `"1"` | V3 (current): Lite + Full, `audioFile`/`imageFile` strings, multi-user partitioning |

The on-disk `version` field is still `"1"` because all three iterations are forward/backward compatible at the manifest level — the differences are layout-level (where files live, where media live) and handled by the readers.

When the **manifest schema** itself breaks, the field will increment.

---

## 9. Migration Scripts

Located in `src/lib/storage/`:

| Script | What it does |
|---|---|
| `migrate-v2.ts` | V1 positional-audio ZIPs → V2 Lite manifest + CAS pool (`audioHash` → `audioFile`). Run as `npx tsx src/lib/storage/migrate-v2.ts <userId>`. |
| `migrate-to-pouch.ts` | V2 `.cfstate` / `.cflog` / `.cfsrs` JSON files → PouchDB collections. **Also splits the legacy single-doc `logs` collection into per-event docs in the `events` collection.** Original files renamed to `.bak`. Run as `npx tsx src/lib/storage/migrate-to-pouch.ts <userId>`. |

V3 multi-user partitioning is currently a manual one-time move: `mkdir -p data/users/local && mv data/{packages,records,media} data/users/local/`. Migration scripts then run per-user.

---

## 10. Related Documents

- `docs/storage-design.md` — Architecture overview, sync model, naming conventions
- `docs/tech-design.md` — System modules, API routes
- `docs/prd.md` — Product features and KPIs
- `docs/features/courseware-generator.md` — Generator feature spec
- `src/types/courseware.ts` — `CoursewareManifestSchema`
- `src/lib/storage/schema.ts` — All persistence schemas (state, events, SRS, package)
- `src/lib/storage/package.ts` — Manifest IO, slug resolution, CAS pool, GC
- `src/lib/storage/record.ts` — Event readers/writers, mutate-based RMW, cascade deletes
