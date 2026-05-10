import PouchDB from 'pouchdb';
// @ts-ignore
import PouchDBNode from 'pouchdb-node';
import * as path from 'path';
import { DataStore } from './adapter';
import { recordsDir } from './paths';

/**
 * PouchDB Storage Provider.
 * Uses pouchdb-node in Node.js environments to ensure native modules load correctly.
 */
export class PouchDBProvider implements DataStore {
  private dbs = new Map<string, any>();
  private DB_CTOR: any;

  constructor(private baseDir: string = recordsDir()) {
    // Detect environment and select the appropriate constructor.
    // Use pouchdb-node for Next.js server-side, standard pouchdb for client-side.
    this.DB_CTOR = typeof window === 'undefined' ? PouchDBNode : PouchDB;
  }

  private getDb(collection: string): any {
    if (!this.dbs.has(collection)) {
      // Each collection corresponds to a subdirectory in Node environments.
      const dbPath = path.join(this.baseDir, `db_${collection}`);
      // pouchdb-node uses leveldown by default; no need for manual plugin registration.
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
    
    const attemptUpdate = async (): Promise<void> => {
      try {
        const existing: any = await db.get(id).catch(() => null);
        const doc = {
          ...data,
          _id: id,
          _rev: existing?._rev,
          updatedAt: new Date().toISOString(),
        };
        await db.put(doc);
      } catch (err: any) {
        if (err.status === 409) {
          // Conflict detected, retry update.
          return attemptUpdate();
        }
        throw err;
      }
    };

    await attemptUpdate();
  }

  async append<T>(collection: string, id: string, field: string, entry: T): Promise<void> {
    const db = this.getDb(collection);

    const attemptAppend = async (): Promise<void> => {
      try {
        const doc: any = (await db.get(id).catch(() => ({
          _id: id,
          createdAt: new Date().toISOString(),
          [field]: [],
        }))) as any;

        if (!Array.isArray(doc[field])) {
          doc[field] = [];
        }
        doc[field].push(entry);
        doc.updatedAt = new Date().toISOString();
        
        await db.put(doc);
      } catch (err: any) {
        if (err.status === 409) {
          // Conflict detected, retry append.
          return attemptAppend();
        }
        throw err;
      }
    };

    await attemptAppend();
  }

  async list(collection: string): Promise<any[]> {
    const db = this.getDb(collection);
    const result = await db.allDocs({ include_docs: true });
    return result.rows.map(row => row.doc);
  }

  async remove(collection: string, id: string): Promise<void> {
    const db = this.getDb(collection);
    const doc = await db.get(id);
    await db.remove(doc);
  }

  async closeAll(): Promise<void> {
    for (const db of this.dbs.values()) {
      await db.close();
    }
    this.dbs.clear();
  }
}
