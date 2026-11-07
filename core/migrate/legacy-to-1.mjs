import {readFile, writeFile, rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {AtlasError} from '../errors.mjs';
import {assertDatabaseShape, CURRENT_SCHEMA_VERSION} from '../schema.mjs';

export const migration = {
  id: 'legacy-to-1',
  from: null,
  to: 1,
  description: 'Add schemaVersion: 1 to a valid legacy library database.',

  async precheck(libraryRoot) {
    const file = path.join(libraryRoot, 'db.json');
    const db = JSON.parse(await readFile(file, 'utf8'));
    assertDatabaseShape(db);
    if (db.schemaVersion != null) {
      throw new AtlasError('migrate.alreadyVersioned', `Database already has schemaVersion ${db.schemaVersion}.`);
    }
    return db;
  },

  async apply(libraryRoot) {
    const file = path.join(libraryRoot, 'db.json');
    const db = await this.precheck(libraryRoot);
    const next = {...db, schemaVersion: CURRENT_SCHEMA_VERSION};
    assertDatabaseShape(next);
    if (next.schemaVersion !== 1) throw new AtlasError('migrate.verifyFailed', 'Expected schemaVersion 1 after migration.');
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, {flag: 'wx'});
    await rename(tmp, file);
    return next;
  },

  async verify(libraryRoot) {
    const db = JSON.parse(await readFile(path.join(libraryRoot, 'db.json'), 'utf8'));
    assertDatabaseShape(db);
    if (db.schemaVersion !== 1) {
      throw new AtlasError('migrate.verifyFailed', 'Migration verify expected schemaVersion 1.');
    }
    return db;
  },
};
