# Storage Design — CoreFirst

> Version: 2.0.0 | Status: Active | Last Updated: 2026-05-10  
> Companion documents: `docs/tech-design.md`, `docs/package-format.md`, `docs/prd.md`

---

## 1. Overview

CoreFirst follows a **Local-first storage model**. Persistence is handled through a hybrid architecture that separates structured learning data from heavy media assets.

To support multi-device synchronization and SaaS interoperability, CoreFirst uses **PouchDB** as its primary engine for structured data and the **Local Filesystem** for binary media.

### 1.1 Storage Architecture V2 (Local-first & CAS)

The system is decoupled into two specialized stores:

| Store Type | Implementation | Data Nature | Synchronization |
| :--- | :--- | :--- | :--- |
| **DataStore** | PouchDB (LevelDB) | Progress, Logs, SRS, and Sessions. | **Native Sync**: Bidirectional with CouchDB/SaaS. |
| **BlobStore** | Filesystem | MP3 audio and WebP images (CAS). | **Lazy Pull**: Download from CDN by hash if missing. |

### Design Principles

1.  **Conflict-Free by Design.** By using PouchDB, every record carries a revision history (`_rev`). Concurrent updates (e.g., studying on two devices offline) can be merged safely without data loss.
2.  **Append-only Logs.** Learning events (Voice attempts, Roleplay turns) are appended to history arrays. The `append` logic includes retry mechanisms to handle PouchDB update conflicts automatically.
3.  **Content-Addressable Storage (CAS) for Media.** Media assets are identified by the **SHA-256 hash** of their content. This ensures zero-cost deduplication across different courses.
4.  **Database-backed structured data.** Personal data is no longer stored in plain JSON files but in managed database segments (LevelDB on Desktop/Node, IndexedDB in Browser).
5.  **Environment Agnostic.** A `StorageAdapter` interface abstracts the underlying engine, allowing the same code to run in Node.js (via `pouchdb-node`) and the browser.

---

## 2. Data Collections (PouchDB)

Data is organized into three primary collections (databases).

### 2.1 `states` — Progress Tracking
Contains the learner's personal progress for specific course packages.
*   **ID**: `packageSlug` (e.g., `it-english-adult`).
*   **Schema**: `CFStateSchema`.
*   **Contents**: Lesson completion status, last studied timestamp.

### 2.2 `logs` — Event History
Contains heavy, append-only history. Separated from `states` to maintain high performance for UI state lookups.
*   **ID**: `packageSlug` or `global`.
*   **Schema**: `CFLogSchema`.
*   **Contents**: Voice attempts, Transform history, and Roleplay chat sessions.

### 2.3 `srs` — Spaced Repetition
Global vocabulary mastery data.
*   **ID**: `user`.
*   **Schema**: `CFSRSSchema`.
*   **Contents**: Vocabulary tokens, intervals, ease factors, and next review dates.

---

## 3. Media Storage (BlobStore)

Binary media (Audio/Images) is stored in the `data/media/` directory.

*   **Naming**: Files are named by their SHA-256 hash (e.g., `a1b2c3d4...mp3`).
*   **Persistence**: Once saved, blobs are immutable.
*   **Package Bundling**: `.corefirst` ZIP packages contain a subset of these blobs for portable, offline-ready course distribution.

---

## 4. Directory Structure

All application data lives under the `data/` directory:

```
<app>/
└── data/
    ├── packages/    # *.corefirst (ZIP) and *.json (Manifest)
    ├── media/       # [hash].mp3 and [hash].webp (BlobStore)
    └── records/     # Managed by PouchDB
        ├── db_states/  # LevelDB segments for states
        ├── db_logs/    # LevelDB segments for logs
        └── db_srs/     # LevelDB segments for SRS
```

---

## 5. Naming & ID Conventions

### Internal IDs
PouchDB IDs must not start with an underscore (reserved for internal use). 
*   **Package Specific**: Use the slug (e.g., `healthcare-japanese-teen`).
*   **Global History**: Use the string `global` (formerly `_global` in V1).

### Slug Formula
`{industry}-{targetLang}-{ageGroup}` (lowercased, alphanumeric and hyphens only).

---

## 6. [Roadmap] Multi-Device Synchronization via SaaS Registry

While the current implementation provides the PouchDB infrastructure required for synchronization (revisions, conflict detection), the actual automated sync service is planned for a future phase.

### 6.1 Planned Role of the Registry
The SaaS Registry is designed to act as the orchestration and identity hub:
1.  **Identity Mapping**: Associates multiple devices (Mobile, Desktop, Web) with a single learner account.
2.  **Discovery**: Provides authorized client devices with the correct database endpoints and access tokens for synchronization.
3.  **Media CDN**: While structured data syncs via the Registry Hub, large media assets are served via a global CDN indexed by the same hashes used locally.

### 6.2 Planned Replication Flow
Once the Registry is active, synchronization will be incremental:
1.  **Handshake**: The client authenticates with the Registry to discover its assigned sync endpoint.
2.  **Bidirectional Sync**: The client triggers a native PouchDB replication session:
    ```typescript
    db.sync('https://hub.corefirst.world/user-123', {
      live: true,
      retry: true
    });
    ```
3.  **Delta Transfer**: Only changed documents (e.g., a new voice attempt or an updated SRS interval) are transmitted, minimizing bandwidth.

### 6.3 Conflict Management Policy
The Registry will enforce a "Local-First, Global-Consistent" policy. Since every document carries a revision history, conflicts occurring during offline study are resolved on the next sync using deterministic merging logic or user-defined preferences managed by the Registry.

---

## 7. Migration from V1 (File-based)

CoreFirst includes an automated migration script (`src/lib/storage/migrate-to-pouch.ts`) that:
1.  Scans `data/records/` for `.cfstate`, `.cflog`, and `.cfsrs` files.
2.  Maps `_global` IDs to `global`.
3.  Ingests data into PouchDB collections.
4.  Renames original files to `.bak` for safety.
