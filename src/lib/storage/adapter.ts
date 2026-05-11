import { z } from 'zod';

/**
 * Generic storage adapter interface for JSON document storage.
 * Designed to abstract differences between PouchDB, FileSystem, and SaaS APIs.
 */
export interface DataStore {
  /** Read a single document (null on 404). */
  get<T>(collection: string, id: string): Promise<T | null>;

  /**
   * Overwrite a document. Internally retries on revision conflict (409), but
   * the input `data` is NOT re-merged against the latest revision — only the
   * `_rev` is refreshed. Use only when the write is idempotent (e.g.
   * setting a boolean flag) OR when the caller does not race with other
   * writers. For read-modify-write where another writer may also mutate the
   * same document, use `mutate()` instead.
   */
  put<T>(collection: string, id: string, data: T): Promise<void>;

  /**
   * Read-modify-write with proper conflict handling. The mutator receives the
   * latest revision of the document (or null if it doesn't exist yet) and
   * returns the new value. On 409 conflicts the mutator runs again against
   * the refreshed document, so concurrent writers compose instead of
   * clobbering. This is the safe choice for any non-idempotent update.
   */
  mutate<T>(
    collection: string,
    id: string,
    mutator: (current: T | null) => T,
  ): Promise<T>;

  /**
   * Append an entry to an array field on a document. Equivalent to
   * `mutate(c, id, doc => ({...doc, [field]: [...(doc?.[field] ?? []), entry]}))`
   * but kept as a first-class method because PouchDB providers can optimize it.
   */
  append<T>(collection: string, id: string, field: string, entry: T): Promise<void>;

  /** Retrieve all documents in a collection. */
  list(collection: string): Promise<any[]>;

  /**
   * List documents whose `_id` starts with the given prefix. Used for the
   * per-event document pattern (id = `<slug>:<type>:<isoTime>:<rand>`) so a
   * single course's events can be enumerated without scanning the whole
   * collection.
   */
  listByPrefix(collection: string, prefix: string): Promise<any[]>;

  /**
   * Remove a document. Idempotent — a missing document is treated as a
   * successful removal so multi-device races don't surface as errors.
   */
  remove(collection: string, id: string): Promise<void>;

  /** Batch removal — single round-trip when the backend supports it. */
  removeMany(collection: string, ids: string[]): Promise<void>;
}

/**
 * Binary storage interface specifically for media assets.
 */
export interface BlobStore {
  save(filename: string, data: Buffer | Blob): Promise<string>;
  read(filename: string): Promise<Buffer | Blob | null>;
  exists(filename: string): Promise<boolean>;
  getUrl(filename: string): string;
}
