import {realpathSync} from 'node:fs';
import path from 'node:path';

export const LOCK_FILE = '.atlas-docs.lock';
export const MIGRATE_JOURNAL = '.atlas-migrate-journal.json';
export const IMPORT_JOURNAL = '.import-journal.json';
export const PROJECT_CONFIG = 'atlas-docs.config.json';

/** Resolve to a stable absolute path; realpath when the path exists. */
export function canonicalize(target) {
  const absolute = path.resolve(target);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

export function lockPath(libraryRoot) {
  return path.join(canonicalize(libraryRoot), LOCK_FILE);
}

export function migrateJournalPath(libraryRoot) {
  return path.join(canonicalize(libraryRoot), MIGRATE_JOURNAL);
}
