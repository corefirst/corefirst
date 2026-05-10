import * as fs from 'fs/promises';
import * as path from 'path';
import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import { 
  packagesDir, 
  recordsDir, 
  packagePath, 
  manifestPath,
  recordPath, 
  logPath,
  mediaPath,
  ensureDataDirs 
} from './paths';
import { contentHash } from './hash';
import { CFStateSchema, CFLogSchema, PackageManifestSchema } from './schema';

async function migratePackages() {
  const dir = packagesDir();
  const files = await fs.readdir(dir).catch(() => []);
  
  for (const file of files) {
    if (file.endsWith('.corefirst')) {
      const slug = path.basename(file, '.corefirst');
      console.log(`Slimming down ZIP package: ${slug}`);
      // ... (ZIP migration logic as before, just use audioFile)
      try {
        const pkgPath = packagePath(slug);
        const buf = new Uint8Array(await fs.readFile(pkgPath));
        const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
          unzip(buf, (err, data) => err ? reject(err) : resolve(data));
        });
        const manifest = JSON.parse(strFromU8(entries['manifest.json']));
        upgradeManifest(manifest);
        await fs.writeFile(manifestPath(slug), JSON.stringify(manifest, null, 2));
        await fs.unlink(pkgPath);
      } catch (err) {
        console.error(`  Failed to slim down ZIP:`, (err as Error).message);
      }
    } else if (file.endsWith('.json')) {
      const slug = path.basename(file, '.json');
      console.log(`Upgrading JSON manifest: ${slug}`);
      try {
        const mPath = manifestPath(slug);
        const manifest = JSON.parse(await fs.readFile(mPath, 'utf-8'));
        upgradeManifest(manifest);
        await fs.writeFile(mPath, JSON.stringify(manifest, null, 2));
        console.log(`  Successfully upgraded ${slug} to audioFile/imageFile format.`);
      } catch (err) {
        console.error(`  Failed to upgrade JSON:`, (err as Error).message);
      }
    }
  }
}

function upgradeManifest(manifest: any) {
  for (const lesson of manifest.lessons) {
    for (const script of lesson.scripts) {
      // Audio
      if (script.audioHash && !script.audioFile) {
        script.audioFile = `${script.audioHash}.mp3`;
      }
      delete script.audioHash;
      
      // Script-level Video (Pre-emptive)
      if (script.videoHash && !script.videoFile) {
        script.videoFile = `${script.videoHash}.mp4`;
      }
      delete script.videoHash;
    }
    
    // Lesson-level Image
    if (lesson.imageHash && !lesson.imageFile) {
      lesson.imageFile = `${lesson.imageHash}.webp`;
    }
    delete lesson.imageHash;

    // Lesson-level Video (Pre-emptive)
    if (lesson.videoHash && !lesson.videoFile) {
      lesson.videoFile = `${lesson.videoHash}.mp4`;
    }
    delete lesson.videoHash;
  }
}

async function migrateRecords() {
  const dir = recordsDir();
  const files = await fs.readdir(dir).catch(() => []);
  
  for (const file of files) {
    if (!file.endsWith('.cfrecord')) continue;
    const slug = path.basename(file, '.cfrecord');
    console.log(`Migrating record: ${slug}`);
    
    try {
      const oldPath = path.join(dir, file);
      const data = JSON.parse(await fs.readFile(oldPath, 'utf-8'));
      
      // 1. Create State
      const state = {
        packageId: data.packageId,
        packageSlug: data.packageSlug,
        lastStudiedAt: data.lastStudiedAt || new Date().toISOString(),
        lessons: data.lessons || []
      };
      
      // 2. Create Log
      const logAttempts: any[] = [];
      if (data.lessons) {
        data.lessons.forEach((l: any) => {
          if (l.scripts) {
            l.scripts.forEach((s: any) => {
              if (s.attempts) {
                s.attempts.forEach((a: any) => {
                  logAttempts.push({
                    lessonIndex: l.lessonIndex,
                    scriptIndex: s.scriptIndex,
                    data: a
                  });
                });
              }
            });
          }
        });
      }
      
      const log = {
        packageId: data.packageId,
        packageSlug: data.packageSlug,
        transforms: data.transforms || [],
        roleplaySessions: data.roleplaySessions || [],
        attempts: logAttempts
      };
      
      // 3. Write new files
      await fs.writeFile(recordPath(slug), JSON.stringify(state, null, 2));
      await fs.writeFile(logPath(slug), JSON.stringify(log, null, 2));
      
      // 4. Cleanup old record
      await fs.unlink(oldPath);
      console.log(`  Successfully split ${slug} into .cfstate and .cflog`);
    } catch (err) {
      console.error(`  Failed to migrate record ${slug}:`, (err as Error).message);
    }
  }
}

async function main() {
  await ensureDataDirs();
  await migratePackages();
  await migrateRecords();
  console.log('Migration complete!');
}

main().catch(console.error);
