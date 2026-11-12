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

/**
 * Normalize a path for equality / containment compares.
 * Windows is case-insensitive; Linux and others keep case.
 */
export function normalizePathForCompare(target, platform = process.platform) {
  const normalized = canonicalize(target).replace(/\\/g, '/');
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/** True when candidate equals root or is a real descendant (after normalizePathForCompare). */
export function pathIsWithinRoot(candidate, root, platform = process.platform) {
  const child = normalizePathForCompare(candidate, platform);
  const base = normalizePathForCompare(root, platform);
  if (child === base) return true;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return child.startsWith(prefix);
}

export function lockPath(libraryRoot) {
  return path.join(canonicalize(libraryRoot), LOCK_FILE);
}

export function migrateJournalPath(libraryRoot) {
  return path.join(canonicalize(libraryRoot), MIGRATE_JOURNAL);
}
