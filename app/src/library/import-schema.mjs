import {readFile, writeFile, rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {AtlasError} from './errors.mjs';
import {assertDatabaseShape, CURRENT_SCHEMA_VERSION, isSupportedSchema, readSchemaVersion} from './schema.mjs';
import {planMigration} from './migrate/registry.mjs';

/**
 * Validate and normalize schema of an extracted import stage before it touches the target library.
 * Mutates stage/db.json when a legacy→supported migration is required.
 */
export async function prepareImportStage(stageDir) {
  const file = path.join(stageDir, 'db.json');
  let db;
  try {
    db = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new AtlasError('library.dbInvalid', 'Imported db.json is not valid JSON.');
  }
  assertDatabaseShape(db);
  const version = readSchemaVersion(db);

  if (version != null && version > CURRENT_SCHEMA_VERSION) {
    throw new AtlasError(
      'library.newerSchema',
      `Backup schema ${version} is newer than this app (supports ${CURRENT_SCHEMA_VERSION}). Import refused; target library unchanged.`,
      {schemaVersion: version},
    );
  }
  if (version != null && !isSupportedSchema(version)) {
    throw new AtlasError(
      'migrate.unsupported',
      `Backup schema ${version} is not supported. Import refused; target library unchanged.`,
      {schemaVersion: version},
    );
  }

  if (version === CURRENT_SCHEMA_VERSION) return {schemaVersion: version, migrated: false};

  const steps = planMigration(version, CURRENT_SCHEMA_VERSION);
  for (const step of steps) {
    await step.precheck(stageDir);
    await step.apply(stageDir);
    await step.verify(stageDir);
  }
  const next = JSON.parse(await readFile(file, 'utf8'));
  if (readSchemaVersion(next) !== CURRENT_SCHEMA_VERSION) {
    throw new AtlasError('migrate.verifyFailed', 'Import stage migration did not reach the current schema.');
  }
  return {schemaVersion: CURRENT_SCHEMA_VERSION, migrated: true};
}

/** Ensure exported/written databases carry schemaVersion without inventing it for unverified data. */
export async function ensureDbSchemaVersionFile(dbPath, version = CURRENT_SCHEMA_VERSION) {
  const db = JSON.parse(await readFile(dbPath, 'utf8'));
  assertDatabaseShape(db);
  if (db.schemaVersion === version) return false;
  if (db.schemaVersion != null && db.schemaVersion !== version) {
    throw new AtlasError('migrate.unsupported', `Refusing to stamp schemaVersion ${version} over ${db.schemaVersion}.`);
  }
  db.schemaVersion = version;
  const tmp = `${dbPath}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`);
  await rename(tmp, dbPath);
  return true;
}
