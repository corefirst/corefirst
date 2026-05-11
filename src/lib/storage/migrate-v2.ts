import * as fs from 'fs/promises';
import * as path from 'path';
import { unzip, strFromU8 } from 'fflate';
import {
  packagesDir,
  recordsDir,
  packagePath,
  manifestPath,
  recordPath,
  logPath,
  ensureDataDirs,
  DEFAULT_USER_ID,
} from './paths';

async function migratePackages(userId: string) {
  const dir = packagesDir(userId);
  const files = await fs.readdir(dir).catch(() => []);

  for (const file of files) {
    if (file.endsWith('.corefirst')) {
      const slug = path.basename(file, '.corefirst');
      console.log(`Slimming ZIP package: ${slug}`);
      try {
        const pkgPath = packagePath(userId, slug);
        const buf = new Uint8Array(await fs.readFile(pkgPath));
        const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
          unzip(buf, (err, data) => (err ? reject(err) : resolve(data)));
        });
        const manifest = JSON.parse(strFromU8(entries['manifest.json']));
        upgradeManifest(manifest);
        await fs.writeFile(manifestPath(userId, slug), JSON.stringify(manifest, null, 2));
        await fs.unlink(pkgPath);
      } catch (err) {
        console.error(`  Failed to slim ZIP:`, (err as Error).message);
      }
    } else if (file.endsWith('.json')) {
      const slug = path.basename(file, '.json');
      console.log(`Upgrading JSON manifest: ${slug}`);
      try {
        const mPath = manifestPath(userId, slug);
        const manifest = JSON.parse(await fs.readFile(mPath, 'utf-8'));
        upgradeManifest(manifest);
        await fs.writeFile(mPath, JSON.stringify(manifest, null, 2));
        console.log(`  Upgraded ${slug} to audioFile/imageFile format.`);
      } catch (err) {
        console.error(`  Failed to upgrade JSON:`, (err as Error).message);
      }
    }
  }
}

function upgradeManifest(manifest: any) {
  for (const lesson of manifest.lessons) {
    for (const script of lesson.scripts) {
      if (script.audioHash && !script.audioFile) {
        script.audioFile = `${script.audioHash}.mp3`;
      }
      delete script.audioHash;
      if (script.videoHash && !script.videoFile) {
        script.videoFile = `${script.videoHash}.mp4`;
      }
      delete script.videoHash;
    }
    if (lesson.imageHash && !lesson.imageFile) {
      lesson.imageFile = `${lesson.imageHash}.webp`;
    }
    delete lesson.imageHash;
    if (lesson.videoHash && !lesson.videoFile) {
      lesson.videoFile = `${lesson.videoHash}.mp4`;
    }
    delete lesson.videoHash;
  }
}

async function migrateRecords(userId: string) {
  const dir = recordsDir(userId);
  const files = await fs.readdir(dir).catch(() => []);

  for (const file of files) {
    if (!file.endsWith('.cfrecord')) continue;
    const slug = path.basename(file, '.cfrecord');
    console.log(`Migrating record: ${slug}`);

    try {
      const oldPath = path.join(dir, file);
      const data = JSON.parse(await fs.readFile(oldPath, 'utf-8'));

      const state = {
        packageId: data.packageId,
        packageSlug: data.packageSlug,
        lastStudiedAt: data.lastStudiedAt || new Date().toISOString(),
        lessons: data.lessons || [],
      };

      const logAttempts: any[] = [];
      if (data.lessons) {
        for (const l of data.lessons) {
          if (!l.scripts) continue;
          for (const s of l.scripts) {
            if (!s.attempts) continue;
            for (const a of s.attempts) {
              logAttempts.push({
                lessonIndex: l.lessonIndex,
                scriptIndex: s.scriptIndex,
                data: a,
              });
            }
          }
        }
      }

      const log = {
        packageId: data.packageId,
        packageSlug: data.packageSlug,
        transforms: data.transforms || [],
        roleplaySessions: data.roleplaySessions || [],
        attempts: logAttempts,
      };

      await fs.writeFile(recordPath(userId, slug), JSON.stringify(state, null, 2));
      await fs.writeFile(logPath(userId, slug), JSON.stringify(log, null, 2));
      await fs.unlink(oldPath);
      console.log(`  Split ${slug} into .cfstate and .cflog`);
    } catch (err) {
      console.error(`  Failed record ${slug}:`, (err as Error).message);
    }
  }
}

async function main() {
  const userId = process.argv[2] || DEFAULT_USER_ID;
  await ensureDataDirs(userId);
  await migratePackages(userId);
  await migrateRecords(userId);
  console.log('Migration complete!');
}

if (require.main === module) {
  main().catch(console.error);
}
