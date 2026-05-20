# Storage Design — CoreFirst

> Software version: 0.2.0 | Status: Active | Last Updated: 2026-05-11
> Companion documents: `docs/tech-design.md`, `docs/package-format.md`, `docs/prd.md`

---

## 1. Overview

CoreFirst follows a **local-first storage model** with **per-user partitioning**. Persistence is handled through a hybrid architecture that separates structured learning data (PouchDB) from heavy media assets (filesystem CAS pool). All data is partitioned by `userId` so multiple learners sharing a device — or sharing a server in cloud mode — never see each other's records.

### 1.1 Storage Architecture V3 (multi-user + per-event docs)

The system is decoupled into three specialized stores, each owned by a single `userId`:

| Store Type | Implementation | Data Nature | Synchronization |
| :--- | :--- | :--- | :--- |
| **DataStore** | PouchDB (LevelDB) | Per-user state, events, SRS | **Native Sync**: bidirectional with CouchDB/cloud via PouchDB replication protocol |
| **BlobStore** | Filesystem (CAS) | MP3 audio and WebP images, hash-named | **Lazy Pull**: download from CDN by hash when missing (planned) |
| **PackageStore** | Filesystem (`.json` + optional `.corefirst` ZIP) | Course manifest content | Out-of-band (sharing model, not personal data) |

### Design Principles

1. **Multi-user isolation.** Every storage call takes a `userId` argument; all paths and PouchDB instances are scoped under `data/users/<userId>/`. A request handler resolves `userId` from `X-User-Id` header → `cf_user_id` cookie → `COREFIRST_DEFAULT_USER` env → `local`. The id is normalized through a whitelist (`/[a-z0-9_-]/`) so an attacker cannot path-traverse out of their own namespace.
2. **Conflict-free under multi-device sync.** Append-only events (transforms, attempts, roleplay messages) are stored as **per-event documents** with stable unique IDs like `<slug>:transform:<isoTime>:<rand>`. Two devices writing concurrently produce distinct doc IDs that merge naturally — no PouchDB `_conflicts` to resolve, no "lost write" risk.
3. **Safe read-modify-write.** Documents that ARE shared between writers (state flags, SRS deck) go through a `mutate(collection, id, mutator)` primitive that retries the mutator on PouchDB 409, so concurrent updates compose instead of clobbering.
4. **Content-addressable media.** Audio/image filenames are SHA-256 hashes (truncated to 16 chars) of the source content. Same SSML across two courses ⇒ one MP3 on disk. A `pruneOrphanMedia(userId)` sweep reclaims hashes that no manifest references — invoked after every package rewrite and on demand.
5. **Hard delete via PouchDB tombstones.** `remove()` creates `_deleted: true` tombstone docs; the canonical sync-safe delete. Other replicas apply the removal during replication. No soft-delete `deletedAt` filter complexity.
6. **Environment agnostic.** A `DataStore` interface abstracts the underlying engine (PouchDB via `pouchdb-node` on the server, plain `pouchdb` in the browser, future HTTP adapter for cloud).
7. **userId is a filesystem namespace only — never embedded in data files.** Document IDs, package slugs, media filenames, and all other stored values must not reference the owning `userId`. The directory path `data/users/<userId>/` is the sole binding. This guarantees that any user's entire dataset can be migrated by a plain directory copy (`fs.cp`) or rename — no content patching required. This applies equally to local profiles and future cloud accounts: local-to-cloud migration is `cp data/users/<localId>/ data/users/<cloudId>/`.

---

## 2. Data Collections (PouchDB)

Each user has their own LevelDB instance under `data/users/<userId>/records/db_<collection>/`. Three collections:

### 2.1 `states` — Lesson Progress Flags

Per-package learning state. Doc ID = `slug` (or `global` for the no-package context).

* **Schema**: `CFStateSchema`
* **Contents**: `packageId`, `packageSlug`, `lastStudiedAt`, `lessons[].scripts[].puzzleCompleted`
* **Update pattern**: `mutate()` — idempotent flag flips, concurrent-safe

### 2.2 `events` — Append-only Event Stream

Every learner event is its own document. Doc IDs encode the sort key inside the prefix, so a single course's history enumerates cheaply via `listByPrefix`.

| Event Type | Doc ID Pattern | Schema |
| :--- | :--- | :--- |
| Transform | `<slug>:transform:<isoTime>:<rand>` | `TransformEventSchema` |
| Voice Attempt | `<slug>:attempt:<lesson>:<script>:<isoTime>:<rand>` | `AttemptEventSchema` |
| Roleplay Session | `<slug>:roleplay-session:<sessionId>` | `RoleplaySessionEventSchema` |
| Roleplay Message | `<slug>:roleplay-msg:<sessionId>:<isoTime>:<rand>` | `RoleplayMessageEventSchema` |

* **`<slug>`** is `global` for ad-hoc usage outside a course
* **`<rand>`** is 6 hex chars from `crypto.randomBytes(3)` — prevents collision on same-millisecond bursts
* **Listing**: `listByPrefix(EVENTS, '<slug>:')` for a whole course, `listByPrefix(EVENTS, '<slug>:roleplay-msg:<sessionId>:')` for one session's messages

### 2.3 `srs` — Spaced Repetition Deck

Per-user global vocabulary. Doc ID = `user`.

* **Schema**: `CFSRSSchema`
* **Contents**: `vocabulary[]` with `(targetLang, token)` composite uniqueness, `firstSeenIn: {slug, lessonIndex, scriptIndex}` back-link
* **Update pattern**: `mutate()` — adding tokens is RMW

---

## 3. Media Storage (BlobStore)

Binary media lives per user at `data/users/<userId>/media/<hash>.<ext>`.

* **Naming**: SHA-256 of the source content (SSML for audio, prompt for image), truncated to 16 hex chars
* **Persistence**: write-once, immutable. Same content ⇒ same filename ⇒ one file on disk
* **Garbage collection**: `pruneOrphanMedia(userId)` enumerates referenced filenames across every manifest and deletes the rest. Invoked after every `writePackage` and `deletePackage`; safe to run on demand
* **Package bundling**: when `saveFull: true`, `.corefirst` ZIP archives include `media/<hash>.<ext>` entries inline for offline distribution (no compression — MP3/WebP are already compressed)

---

## 4. Directory Structure

```
<app>/
└── data/
    └── users/
        └── <userId>/
            ├── packages/    # <slug>.json (Lite manifest) + optional <slug>.corefirst (Full ZIP)
            ├── media/       # <hash>.mp3 and <hash>.webp (CAS pool)
            └── records/     # PouchDB instances per collection
                ├── db_states/    # LevelDB segments
                ├── db_events/    # LevelDB segments
                └── db_srs/       # LevelDB segments
```

The single-user `local` userId is the default — installs that don't wire up auth/cookies stay at `data/users/local/...` and the layout is invisible to the learner.

---

## 5. Naming & ID Conventions

### 5.1 userId

Resolved from request via `getUserId(request)` (`src/lib/auth/user.ts`):

1. `X-User-Id` request header (highest priority — cloud edge proxies)
2. `cf_user_id` cookie (browser persistence)
3. `COREFIRST_DEFAULT_USER` env (server-side override)
4. `local` (default)

Normalized through `/[a-z0-9_-]/` whitelist — empty after normalization falls back to `local`. Path traversal attempts are neutralized at this layer.

### 5.2 Slug Formula

`{industry}-{targetLang}-{ageGroup}-{topic}` — all four components, all lower-case ASCII with whitespace replaced by hyphens. When `topic` contains only non-ASCII characters (e.g. Chinese topic for a Chinese learner), ASCII-stripping would empty it; we fall back to a short FNV-1a hash of the original topic to preserve uniqueness.

If the resulting slug is already owned by a *different* `packageId` (genuine collision), `resolveUniqueSlug` appends `-2`, `-3`, … until free. Re-saving the same `packageId` reuses the existing slug — overwrite is intentional in that case.

**Slug validation at API boundaries**: every route handler that consumes `[slug]` from the URL rejects anything outside `/^[a-z0-9-]+$/` with a 400, blocking path-traversal attempts before any filesystem call.

### 5.3 PouchDB Document IDs

PouchDB reserves IDs starting with `_`. The `toId(slug)` helper:
* `null` / `'global'` / `'_global'` → `'global'`
* Other slugs with leading `_` → strip the leading underscore
* Otherwise pass through unchanged (slug regex already excludes `_`)

### 5.4 Event Doc IDs

`<slug>:<type>:<discriminator>:<isoTime>:<rand>` — the prefix is sort-friendly (ISO time is lexicographically orderable), the suffix `<rand>` prevents same-millisecond collisions. The discriminator slot lets attempt events carry their `<lesson>:<script>` indices and roleplay messages carry their `<sessionId>`.

---

## 6. Operations

### 6.1 Append (transforms, attempts, roleplay messages)

Each event is written as a brand-new doc via `db.put(EVENTS, newId, ...)`. No RMW, no conflict surface. Listed via `listByPrefix` or `list` + filter.

### 6.2 Mutate (state flags, SRS deck, session metadata, course rename)

`provider.mutate(collection, id, mutator)` re-runs the mutator on every 409 conflict against the freshly-read document. Up to 10 retries. Idempotent mutators (e.g. `puzzleCompleted = true`) compose trivially; non-idempotent mutators (e.g. `srs.vocabulary.push`) compose because the read-mutate sequence reruns against the latest revision each time.

### 6.3 Delete

PouchDB hard delete via tombstone (`_deleted: true`). Idempotent — 404 on a missing doc is treated as success. Replication carries the tombstone to other devices, where the local copy is removed.

**Cascade deletes**:

| Operation | What's removed |
| :--- | :--- |
| `deleteHistoryEvent(userId, eventId)` | One event doc |
| `deleteRoleplaySession(userId, slug, sessionId)` | Session metadata doc + every message doc via `listByPrefix` + `removeMany` (single `bulkDocs` round-trip) |
| `deletePackage(userId, slug)` | Five-step cascade (see §6.5) |

### 6.4 Rename

* `renameRoleplaySession(userId, slug, sessionId, newContext)` — `mutate()` on the session metadata doc; sessionId and slug never change
* `renamePackageTopic(userId, slug, newTopic)` — read/edit/write the manifest JSON file; slug is **immutable** because it's the join key for every state doc, event doc, and media reference

### 6.5 deletePackage cascade

The five-step best-effort cascade with per-step error capture:

| Step | What it does | Failure mode |
| :--- | :--- | :--- |
| `manifest` | `fs.unlink` Lite JSON + optional Full ZIP | ENOENT is success; other IO errors recorded |
| `state` | `db.remove(STATE, slug)` | Idempotent (404 → success); recorded on transient PouchDB error |
| `events` | `listByPrefix` + `removeMany` for every doc with the slug prefix | Recorded; failed events become orphans, picked up by next list-time filter (no UI surface) |
| `vocab` | `mutate(SRS, 'user')` clears `firstSeenIn` for entries pointing at the deleted slug. Mastery progress preserved — the learner already learned those words | Skipped when no SRS doc exists yet |
| `media` | `pruneOrphanMedia(userId)` sweeps unreferenced hash files | Recorded; orphans linger until next sweep |

Returns `{ok, steps[], errors[]}`. The HTTP route surfaces `207 Multi-Status` with the structured result when `ok === false` — partial failures are observable in logs and the response body.

---

## 7. Sync Model (current and roadmap)

### 7.1 Current state

* PouchDB infrastructure is in place per-user (revisions, conflicts, tombstones)
* Per-event docs eliminate the worst conflict class (concurrent appends to the same array)
* No active replication endpoint shipped yet

### 7.2 Planned replication

Once a cloud registry is online:

1. **Handshake** — client authenticates with the registry, receives the per-user CouchDB endpoint and an access token
2. **Bidirectional `db.sync`** — three streams in parallel: `states`, `events`, `srs`
   ```typescript
   for (const col of ['states', 'events', 'srs']) {
     getDb(col).sync(`${endpoint}/${userId}-${col}`, { live: true, retry: true });
   }
   ```
3. **Media CDN** — package manifests and media files are out-of-band; the registry serves a content-addressed CDN URL `https://cdn.corefirst.world/media/<hash>.<ext>` and the client lazy-pulls into its local pool on cache miss
4. **Conflict handling** — for per-event docs there are no application-level conflicts (distinct IDs). For shared docs (`states/<slug>`, `srs/user`), PouchDB picks a winner deterministically; future work may surface `_conflicts` arrays to the application for explicit resolution

### 7.3 Multi-user on the same registry

Each `userId` owns three databases on the registry (`states`, `events`, `srs`). Cross-user isolation is enforced at the registry's auth layer; the client side already partitions on the filesystem.

---

## 8. Migration History

CoreFirst includes idempotent migration scripts under `src/lib/storage/`:

| Migration | What it does |
| :--- | :--- |
| `migrate-v2.ts` | V1 inline-audio ZIPs → V2 Lite-manifest + CAS pool (`audioHash` → `audioFile`) |
| `migrate-to-pouch.ts` | V2 `.cfstate` / `.cflog` / `.cfsrs` JSON files → PouchDB collections. Also splits the legacy single-doc `logs` collection into per-event docs in the `events` collection. Original files renamed to `.bak`. Run as `npx tsx src/lib/storage/migrate-to-pouch.ts <userId>` |

V3 (multi-user partitioning) data lives directly under `data/users/<userId>/`; migrating an existing single-user install to V3 is a manual `mv data/{packages,records,media} data/users/local/` operation, which the migration scripts then operate on per-user.
