import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  recordsDir, 
  recordPath, 
  logPath, 
  globalLogPath, 
  globalSRSPath 
} from './paths';
import { db } from './record';
import { CFStateSchema, CFLogSchema, CFSRSSchema } from './schema';

const COL = {
  STATE: 'states',
  LOG: 'logs',
  SRS: 'srs'
};

/**
 * Migrates existing .cfstate, .cflog, and .cfsrs files to PouchDB.
 * Once migration is successful, original files are renamed to .bak.
 */
export async function migrateFilesToPouch() {
  const dir = recordsDir();
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch (err) {
    console.log('[migration] No records directory found, skipping.');
    return;
  }

  console.log(`[migration] Starting migration from files to PouchDB in ${dir}...`);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    
    // 1. Process .cfstate (Progress)
    if (file.endsWith('.cfstate')) {
      let slug = path.basename(file, '.cfstate');
      // Normalize slug: PouchDB does not allow IDs starting with underscore
      if (slug.startsWith('_')) slug = slug.substring(1); // e.g. _global -> global
      
      try {
        const raw = await fs.readFile(fullPath, 'utf-8');
        const data = CFStateSchema.parse(JSON.parse(raw));
        await db.put(COL.STATE, slug, data);
        await backupFile(fullPath);
        console.log(`[migration] Migrated state: ${slug}`);
      } catch (err) {
        console.error(`[migration] Failed to migrate state ${file}:`, (err as Error).message);
      }
    }

    // 2. Process .cflog (Logs)
    else if (file.endsWith('.cflog')) {
      let slug = path.basename(file, '.cflog');
      if (slug.startsWith('_')) slug = slug.substring(1); 
      
      try {
        const raw = await fs.readFile(fullPath, 'utf-8');
        const data = CFLogSchema.parse(JSON.parse(raw));
        await db.put(COL.LOG, slug, data);
        await backupFile(fullPath);
        console.log(`[migration] Migrated log: ${slug}`);
      } catch (err) {
        console.error(`[migration] Failed to migrate log ${file}:`, (err as Error).message);
      }
    }

    // 3. Process .cfsrs (SRS data)
    else if (file === 'user.cfsrs') {
      try {
        const raw = await fs.readFile(fullPath, 'utf-8');
        const data = CFSRSSchema.parse(JSON.parse(raw));
        await db.put(COL.SRS, 'user', data);
        await backupFile(fullPath);
        console.log(`[migration] Migrated SRS: user`);
      } catch (err) {
        console.error(`[migration] Failed to migrate SRS:`, (err as Error).message);
      }
    }
    
    // 4. Handle legacy .cfrecord (if any)
    else if (file.endsWith('.cfrecord')) {
       console.log(`[migration] Found legacy .cfrecord: ${file}. Please run migrate-v2.ts first or handle manually.`);
    }
  }

  console.log('[migration] Migration to PouchDB complete.');
}

async function backupFile(filePath: string) {
  const bakPath = `${filePath}.bak`;
  await fs.rename(filePath, bakPath);
}

// Manual execution entry point
if (require.main === module) {
  migrateFilesToPouch().catch(console.error).finally(() => db.closeAll());
}
