import * as fs from 'fs/promises';
import * as path from 'path';
import { BlobStore } from './adapter';
import { mediaDir, DEFAULT_USER_ID } from './paths';

export class FileSystemBlobStore implements BlobStore {
  private baseDir: string;

  constructor(userId: string = DEFAULT_USER_ID) {
    this.baseDir = mediaDir(userId);
  }

  async save(filename: string, data: Buffer | Blob): Promise<string> {
    const fullPath = path.join(this.baseDir, filename);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    if (data && typeof (data as any).arrayBuffer === 'function') {
      const arrayBuffer = await (data as any).arrayBuffer();
      await fs.writeFile(fullPath, new Uint8Array(arrayBuffer));
    } else {
      await fs.writeFile(fullPath, new Uint8Array(data as Buffer));
    }
    return filename;
  }

  async read(filename: string): Promise<Buffer | null> {
    const fullPath = path.join(this.baseDir, filename);
    try {
      return await fs.readFile(fullPath);
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async exists(filename: string): Promise<boolean> {
    const fullPath = path.join(this.baseDir, filename);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  getUrl(filename: string): string {
    // Maps to /api/media/[filename]; the route resolves userId from the request.
    return `/api/media/${filename}`;
  }
}
