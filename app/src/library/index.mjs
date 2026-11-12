export {AtlasError, isAtlasError} from './errors.mjs';
export {
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_SCHEMAS,
  DATA_DIRS,
  DEFAULT_SETTINGS,
  emptyDatabase,
  assertDatabaseShape,
  isSupportedSchema,
  readSchemaVersion,
} from './schema.mjs';
export {inspectLibrary, assertOpenable} from './inspect.mjs';
export {resolveLibraryPath, resolveAppDataRoot} from './resolve.mjs';
export {findProjectConfig, readProjectConfig, writeProjectConfig} from './project-config.mjs';
export {acquireLibraryLock, readLibraryLock, isLockStale, pidAlive} from './lock.mjs';
export {createFullBackup, verifyFullBackup} from './full-backup.mjs';
export {installAgentKit, safePath} from './agent-kit.mjs';
export {initEmptyLibrary} from './init.mjs';
export {prepareLibrary} from './prepare.mjs';
export {planMigration, listMigrations, productionMigrations} from './migrate/registry.mjs';
export {
  migrateLibrary,
  recoverInterruptedMigration,
  restoreUpgradeBackup,
  MIGRATE_ABORT_EXIT,
  MIGRATE_ABORT_POINTS,
} from './migrate/run.mjs';
export {prepareImportStage, ensureDbSchemaVersionFile} from './import-schema.mjs';
export {checkForUpdate, updateCheckDisabled, updateAdvice, isNewerVersion, fetchLatestVersion} from './update/check.mjs';
export {detectInstallMethod} from './update/detect.mjs';
export {stableVersion, nodeSatisfies} from './update/npm.mjs';
export {
  LOCK_FILE,
  MIGRATE_JOURNAL,
  IMPORT_JOURNAL,
  PROJECT_CONFIG,
  canonicalize,
  normalizePathForCompare,
  pathIsWithinRoot,
} from './paths.mjs';
export {
  REGISTRY_FILE,
  REGISTRY_VERSION,
  resolveRegistryDir,
  registryPath,
  libraryIdentityKey,
  loadUserRegistry,
  loadUserRegistrySafe,
  updateUserRegistry,
  rememberSuccessfulOpen,
  renameLibraryEntry,
  removeLibraryEntry,
  getRecentLibrary,
  defaultLibraryParentDir,
  pathExists,
} from './user-registry.mjs';
export {
  resolveAllowedRoots,
  assertWithinAllowedRoots,
  listBrowsableDir,
  listAllowedRootInfos,
} from './fs-policy.mjs';
export {
  slugifyLibraryName,
  validateDisplayName,
  previewCreateLibrary,
  createLibrary,
  inspectOpenTarget,
  uniqueDemoPath,
} from './library-ops.mjs';
export {resolveManagerInitialLibrary, applyLibraryDataDir} from './manager-env.mjs';
