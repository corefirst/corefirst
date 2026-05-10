import * as fs from 'fs/promises';
import * as path from 'path';
import { BlobStore } from './adapter';
import { mediaDir } from './paths';

export class FileSystemBlobStore implements BlobStore {
  constructor(private baseDir: string = mediaDir()) {}

  async save(filename: string, data: Buffer | Blob): Promise<string> {
    const fullPath = path.join(this.baseDir, filename);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    
    if (data instanceof Blob) {
      const arrayBuffer = await data.arrayBuffer();
      await fs.writeFile(fullPath, Buffer.from(arrayBuffer));
    } else {
      await fs.writeFile(fullPath, data);
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
    // In Next.js applications, this typically maps to /api/media/[filename]
    return `/api/media/${filename}`;
  }
}
