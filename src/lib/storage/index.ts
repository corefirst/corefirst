export {
  packagePath,
  recordPath,
  globalRecordPath,
  packagesDir,
  recordsDir,
  buildSlug,
  ensureDataDirs,
} from './paths';

export {
  PackageManifestSchema,
  PACKAGE_FORMAT_VERSION,
  type PackageManifest,
  type PackageLesson,
  type PackageScript,
  type CFRecord,
  type AttemptRecord,
  type TransformRecord,
  type RoleplaySessionRecord,
  type RoleplayMessage,
} from './schema';

export {
  writePackage,
  readPackageManifest,
  readPackageAudio,
  readPackageImage,
  listPackages,
  PackageNotFoundError,
  PackageCorruptError,
  type WritePackageInput,
  type WritePackageResult,
} from './package';

export {
  readRecord,
  readGlobalRecord,
  appendAttempt,
  completePuzzle,
  appendTransform,
  upsertRoleplaySession,
  readAllProgress,
  captureVocabulary,
  RecordCorruptError,
  db, // PouchDB 实例
  type AttemptInput,
  type RoleplayUpsertInput,
} from './record';

export { migrateFilesToPouch } from './migrate-to-pouch';
