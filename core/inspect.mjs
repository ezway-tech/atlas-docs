import {readdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {AtlasError} from './errors.mjs';
import {IMPORT_JOURNAL, MIGRATE_JOURNAL, canonicalize} from './paths.mjs';
import {CURRENT_SCHEMA_VERSION, DATA_DIRS, assertDatabaseShape, isSupportedSchema, readSchemaVersion} from './schema.mjs';

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function dirHasEntries(dir) {
  try {
    const names = await readdir(dir);
    return names.length > 0;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readDbFile(root) {
  const file = path.join(root, 'db.json');
  if (!(await exists(file))) return {present: false, db: null, raw: null};
  const raw = await readFile(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {present: true, db: null, raw, parseError: true};
  }
  return {present: true, db: parsed, raw};
}

/**
 * Read-only classification of a library directory.
 * @returns {{
 *   state: 'missing'|'empty'|'ready'|'legacy'|'newer'|'unknown'|'interrupted',
 *   root: string,
 *   schemaVersion: number|null,
 *   message?: string,
 *   db?: object|null,
 * }}
 */
export async function inspectLibrary(libraryRoot) {
  const root = canonicalize(libraryRoot);
  const rootExists = await exists(root);
  if (!rootExists) {
    return {state: 'missing', root, schemaVersion: null};
  }

  const names = await readdir(root);
  const migrateJournal = names.includes(MIGRATE_JOURNAL);
  const importJournal = names.includes(IMPORT_JOURNAL);
  if (migrateJournal || importJournal) {
    return {
      state: 'interrupted',
      root,
      schemaVersion: null,
      message: migrateJournal
        ? 'A schema migration was interrupted. Restore from the upgrade backup or finish recovery before opening.'
        : 'An import was interrupted. The next safe open recovers the import journal.',
      interrupted: migrateJournal ? 'migrate' : 'import',
    };
  }

  const dbInfo = await readDbFile(root);
  const hasDataDirs = {};
  for (const name of DATA_DIRS) hasDataDirs[name] = await exists(path.join(root, name));
  const anyDataContent =
    (await dirHasEntries(path.join(root, 'docs'))) ||
    (await dirHasEntries(path.join(root, 'uploads'))) ||
    (await dirHasEntries(path.join(root, 'history')));

  const knownFiles = new Set(['db.json', ...DATA_DIRS, 'AGENTS.md', '.atlas', '.atlas-docs.lock', '.git', '.gitignore']);
  const unexpected = names.filter(n => !knownFiles.has(n) && !n.startsWith('.'));

  if (!dbInfo.present && !Object.values(hasDataDirs).some(Boolean) && unexpected.length === 0) {
    // Empty directory or only ignored/dot files → treat as empty candidate.
    if (names.length === 0 || names.every(n => n.startsWith('.') || n === 'AGENTS.md' || n === '.atlas')) {
      return {state: 'empty', root, schemaVersion: null};
    }
  }

  if (!dbInfo.present) {
    if (anyDataContent || unexpected.length || Object.values(hasDataDirs).some(Boolean)) {
      return {state: 'unknown', root, schemaVersion: null, message: 'Directory has files but no db.json.'};
    }
    return {state: 'empty', root, schemaVersion: null};
  }

  if (dbInfo.parseError) {
    return {state: 'unknown', root, schemaVersion: null, message: 'db.json is not valid JSON.', db: null};
  }

  try {
    assertDatabaseShape(dbInfo.db);
  } catch (error) {
    return {
      state: 'unknown',
      root,
      schemaVersion: null,
      message: error instanceof AtlasError ? error.message : 'db.json failed structural checks.',
      db: dbInfo.db,
    };
  }

  const version = readSchemaVersion(dbInfo.db);
  const emptyDb =
    dbInfo.db.assets.length === 0 &&
    dbInfo.db.folders.length === 0 &&
    dbInfo.db.comments.length === 0 &&
    !anyDataContent;

  if (version == null) {
    // Legacy: valid shape, no schemaVersion.
    if (emptyDb && !Object.values(hasDataDirs).every(Boolean)) {
      // Missing dirs but empty legacy db — still legacy/ready for init fill.
    }
    return {state: 'legacy', root, schemaVersion: null, db: dbInfo.db};
  }

  if (version > CURRENT_SCHEMA_VERSION || !isSupportedSchema(version)) {
    if (version > CURRENT_SCHEMA_VERSION) {
      return {
        state: 'newer',
        root,
        schemaVersion: version,
        message: `Library schema ${version} is newer than this app (supports ${CURRENT_SCHEMA_VERSION}).`,
        db: dbInfo.db,
      };
    }
    return {
      state: 'unknown',
      root,
      schemaVersion: version,
      message: `Library schema ${version} is not supported by this app.`,
      db: dbInfo.db,
    };
  }

  if (emptyDb && names.filter(n => !n.startsWith('.') && n !== 'AGENTS.md' && n !== 'db.json' && !DATA_DIRS.includes(n)).length === 0) {
    // Valid current schema, no user content — still ready (already initialized).
  }

  return {state: 'ready', root, schemaVersion: version, db: dbInfo.db};
}

export async function assertOpenable(inspection) {
  if (inspection.state === 'newer') {
    throw new AtlasError('library.newerSchema', inspection.message, {schemaVersion: inspection.schemaVersion});
  }
  if (inspection.state === 'unknown') {
    throw new AtlasError('library.unknown', inspection.message || 'Directory is not a recognized Atlas Docs library.', {root: inspection.root});
  }
  return inspection;
}
