/**
 * Initialize or verify the library using shared core rules.
 * Does not migrate without ATLAS_DOCS_MIGRATE_YES=1 (or interactive confirm when used via CLI).
 */
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.ATLAS_CORE_PATH,
  path.resolve(here, '../../app/src/library/index.mjs'),
  path.resolve(process.cwd(), 'lib/index.mjs'),
  path.resolve(process.cwd(), '../lib/index.mjs'),
  path.resolve(here, '../core/index.mjs'),
].filter(Boolean);

let core;
for (const candidate of candidates) {
  try {
    core = await import(pathToFileURL(candidate).href);
    break;
  } catch {
    // try next
  }
}
if (!core) throw new Error(`Atlas Docs core not found. Searched:\n${candidates.join('\n')}`);

const root = process.env.DATA_DIR
  ? core.canonicalize(path.resolve(process.env.DATA_DIR))
  : core.resolveAppDataRoot(process.env, process.cwd());

const migrateYes = process.env.ATLAS_DOCS_MIGRATE_YES === '1' || process.env.ATLAS_DOCS_MIGRATE_YES === 'true';

// Bootstrap is a short-lived process: prepare then release the lock so the server can acquire it.
await core.prepareLibrary({
  libraryRoot: root,
  appVersion: process.env.ATLAS_APP_VERSION || '',
  allowInit: true,
  allowMigrate: true,
  autoConfirmMigrate: migrateYes,
  holdLock: false,
  log: console.log,
});

console.log('[Atlas Docs] data:', root);
