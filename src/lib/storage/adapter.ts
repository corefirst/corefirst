import { z } from 'zod';

/**
 * Generic storage adapter interface for JSON document storage.
 * Designed to abstract differences between PouchDB, FileSystem, and SaaS APIs.
 */
export interface DataStore {
  /**
   * Reads a single document.
   */
  get<T>(collection: string, id: string): Promise<T | null>;

  /**
   * Saves or updates a document. Supports conflict resolution via revisions (e.g., _rev).
   */
  put<T>(collection: string, id: string, data: T): Promise<void>;

  /**
   * Appends data to an array field. Highly efficient for logging and history data.
   */
  append<T>(collection: string, id: string, field: string, entry: T): Promise<void>;

  /**
   * Retrieves all documents within a specified collection.
   */
  list(collection: string): Promise<any[]>;

  /**
   * Removes a document.
   */
  remove(collection: string, id: string): Promise<void>;
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
