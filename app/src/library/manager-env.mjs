import path from 'node:path';
import {canonicalize} from './paths.mjs';

/**
 * Manager / multi-library: never treat the image default DATA_DIR=/data as a selected library.
 * Only ATLAS_OPEN_LIBRARY (when set) opens a library at startup.
 */
export function resolveManagerInitialLibrary(env = process.env) {
  const open = env.ATLAS_OPEN_LIBRARY;
  if (open != null && String(open).trim() !== '') {
    return canonicalize(path.resolve(String(open).trim()));
  }
  return null;
}

/** Child env: omit DATA_DIR entirely when no library is selected. */
export function applyLibraryDataDir(env, dataDir) {
  const next = {...env};
  if (dataDir) next.DATA_DIR = dataDir;
  else delete next.DATA_DIR;
  return next;
}
