import PouchDB from 'pouchdb';
// @ts-ignore
import PouchDBNode from 'pouchdb-node';
import * as path from 'path';
import { mkdirSync } from 'fs';
import { DataStore } from './adapter';
import { recordsDir, normalizeUserId, DEFAULT_USER_ID } from './paths';

const RETRY_LIMIT = 10;

/**
 * PouchDB Storage Provider, per-user. Each instance owns a userId; PouchDB
 * databases live under `<dataRoot>/users/<userId>/records/db_<collection>/`
 * so two learners on the same machine never share documents.
 */
export class PouchDBProvider implements DataStore {
  private dbs = new Map<string, any>();
  private DB_CTOR: any;
  readonly userId: string;
  private baseDir: string;

  constructor(userId: string = DEFAULT_USER_ID) {
    this.userId = normalizeUserId(userId);
    this.baseDir = recordsDir(this.userId);
    this.DB_CTOR = typeof window === 'undefined' ? PouchDBNode : PouchDB;
  }

  private getDb(collection: string): any {
    if (!this.dbs.has(collection)) {
      // LevelDB doesn't reliably create the full ancestor chain (the user
      // records dir didn't exist yet on a fresh install). Ensure it before
      // opening so the first write doesn't crash with ENOENT on LOCK.
      try {
        mkdirSync(this.baseDir, { recursive: true });
      } catch {
        /* ignore — best effort */
      }
      const dbPath = path.join(this.baseDir, `db_${collection}`);
      const db = new this.DB_CTOR(dbPath);
      this.dbs.set(collection, db);
    }
    return this.dbs.get(collection)!;
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    const db = this.getDb(collection);
    try {
      const doc = await db.get(id);
      return doc as unknown as T;
    } catch (err: any) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  async put<T>(collection: string, id: string, data: any): Promise<void> {
    const db = this.getDb(collection);
    const attempt = async (retries = 0): Promise<void> => {
      try {
        const existing: any = await db.get(id).catch(() => null);
        await db.put({
          ...data,
          _id: id,
          _rev: existing?._rev,
          updatedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        if (err.status === 409 && retries < RETRY_LIMIT) return attempt(retries + 1);
        throw err;
      }
    };
    await attempt();
  }

  /**
   * Read-modify-write with conflict-safe retry. The mutator is re-run on every
   * 409 against the freshly-read document, so concurrent callers compose
   * instead of clobbering each other.
   */
  async mutate<T>(
    collection: string,
    id: string,
    mutator: (current: T | null) => T,
  ): Promise<T> {
    const db = this.getDb(collection);
    let lastResult: T | null = null;
    const attempt = async (retries = 0): Promise<void> => {
      const existing: any = await db.get(id).catch(() => null);
      const current = existing
        ? (stripPouchFields(existing) as T)
        : null;
      const next = mutator(current);
      lastResult = next;
      try {
        await db.put({
          ...next,
          _id: id,
          _rev: existing?._rev,
          updatedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        if (err.status === 409 && retries < RETRY_LIMIT) return attempt(retries + 1);
        throw err;
      }
    };
    await attempt();
    return lastResult as T;
  }

  async append<T>(collection: string, id: string, field: string, entry: T): Promise<void> {
    await this.mutate<any>(collection, id, (current) => {
      const doc: any = current ?? { [field]: [] };
      const list: any[] = Array.isArray(doc[field]) ? [...doc[field]] : [];
      list.push(entry);
      return { ...doc, [field]: list };
    });
  }

  async list(collection: string): Promise<any[]> {
    const db = this.getDb(collection);
    const result = await db.allDocs({ include_docs: true });
    return result.rows.map((row: { doc?: unknown }) => row.doc);
  }

  async listByPrefix(collection: string, prefix: string): Promise<any[]> {
    const db = this.getDb(collection);
    // PouchDB ranges: startkey/endkey + the ￰ trick is the canonical
    // way to query "all ids starting with prefix" without a custom view.
    const result = await db.allDocs({
      include_docs: true,
      startkey: prefix,
      endkey: prefix + '￰',
    });
    return result.rows.map((row: { doc?: unknown }) => row.doc);
  }

  /**
   * Hard-delete a document. Internally PouchDB creates a tombstone
   * (`_deleted: true`) — that's the canonical sync-safe delete: other replicas
   * see the tombstone during replication and apply the removal locally. 404
   * is treated as success (idempotent delete) so retries / multi-device races
   * don't surface as errors.
   */
  async remove(collection: string, id: string): Promise<void> {
    const db = this.getDb(collection);
    try {
      const doc = await db.get(id);
      await db.remove(doc);
    } catch (err: any) {
      if (err.status === 404) return; // already gone — nothing to do
      throw err;
    }
  }

  /**
   * Batch delete via PouchDB's `_bulk_docs` with `_deleted` flags. Single
   * round-trip + atomic per-doc tombstones that replicate cleanly. Skips
   * documents that no longer exist (idempotent).
   */
  async removeMany(collection: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = this.getDb(collection);
    const fetched: any = await db.allDocs({ keys: ids, include_docs: true });
    const rows: any[] = fetched.rows ?? [];
    const docs = rows
      .filter((r) => r.doc && !r.error)
      .map((r) => ({ ...r.doc, _deleted: true }));
    if (docs.length > 0) await db.bulkDocs(docs);
  }

  async closeAll(): Promise<void> {
    for (const db of this.dbs.values()) {
      await db.close();
    }
    this.dbs.clear();
  }
}

function stripPouchFields(doc: any): any {
  const { _id, _rev, _conflicts, updatedAt, ...rest } = doc;
  return rest;
}

// --- per-user provider registry ---
//
// Most callers don't care about userId; they just want "the storage for the
// current request." We keep one PouchDBProvider per userId and hand it out on
// demand. Provider creation is cheap (PouchDB is lazy about opening DBs); the
// registry keeps revisited userIds fast.

const providers = new Map<string, PouchDBProvider>();

export function providerFor(userId: string = DEFAULT_USER_ID): PouchDBProvider {
  const id = normalizeUserId(userId);
  let p = providers.get(id);
  if (!p) {
    p = new PouchDBProvider(id);
    providers.set(id, p);
  }
  return p;
}

/** Test/teardown helper. */
export async function closeAllProviders(): Promise<void> {
  for (const p of providers.values()) await p.closeAll();
  providers.clear();
}
