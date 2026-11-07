import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, rename} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {emptyDatabase} from '../schema.mjs';
import {prepareImportStage} from '../import-schema.mjs';
import {migrateLibrary, recoverInterruptedMigration} from '../migrate/run.mjs';
import {MIGRATE_JOURNAL} from '../paths.mjs';
import {initEmptyLibrary} from '../init.mjs';
import {inspectLibrary} from '../inspect.mjs';

async function temp() {
  return mkdtemp(path.join(tmpdir(), 'atlas-migrate-'));
}

test('import stage migrates legacy and rejects newer schema without writing target', async () => {
  const root = await temp();
  try {
    const stage = path.join(root, 'stage');
    await mkdir(stage);
    const legacy = emptyDatabase();
    delete legacy.schemaVersion;
    await writeFile(path.join(stage, 'db.json'), JSON.stringify(legacy));
    const result = await prepareImportStage(stage);
    assert.equal(result.migrated, true);
    assert.equal(JSON.parse(await readFile(path.join(stage, 'db.json'), 'utf8')).schemaVersion, 1);

    const newer = path.join(root, 'newer');
    await mkdir(newer);
    await writeFile(path.join(newer, 'db.json'), JSON.stringify({...emptyDatabase(), schemaVersion: 99}));
    const snap = await readFile(path.join(newer, 'db.json'), 'utf8');
    await assert.rejects(() => prepareImportStage(newer), /newer/);
    assert.equal(await readFile(path.join(newer, 'db.json'), 'utf8'), snap);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('interrupted migration journal recovers from upgrade backup', async () => {
  const root = await temp();
  try {
    const lib = path.join(root, 'lib');
    await mkdir(path.join(lib, 'docs'), {recursive: true});
    await mkdir(path.join(lib, 'uploads'), {recursive: true});
    await mkdir(path.join(lib, 'history'), {recursive: true});
    const legacy = emptyDatabase();
    delete legacy.schemaVersion;
    legacy.comments = [{id: 'c1', docId: 'a/b', content: 'keep-me', quote: '', blockId: '', createdAt: '2020-01-01T00:00:00.000Z', resolved: false}];
    await writeFile(path.join(lib, 'db.json'), JSON.stringify(legacy, null, 2));

    // Simulate mid-migration: backup exists, journal present, db partially stamped then reverted
    const backupParent = path.join(root, 'backups');
    const migrated = await migrateLibrary(lib, {confirm: true, backupParentDir: backupParent, log() {}});
    assert.equal(migrated.migrated, true);

    // Reintroduce journal and corrupt db to schema missing while backup remains
    await writeFile(path.join(lib, MIGRATE_JOURNAL), JSON.stringify({
      status: 'running',
      from: null,
      to: 1,
      backupDir: migrated.backupDir,
      completedSteps: [],
      startedAt: new Date().toISOString(),
    }));
    await writeFile(path.join(lib, 'db.json'), JSON.stringify(legacy, null, 2));
    assert.equal((await inspectLibrary(lib)).state, 'interrupted');

    const recovery = await recoverInterruptedMigration(lib);
    assert.equal(recovery.recovered, true);
    const db = JSON.parse(await readFile(path.join(lib, 'db.json'), 'utf8'));
    // Backup was taken after migration completed in this simulation path — restore brings schema 1 copy.
    assert.equal(db.comments[0].content, 'keep-me');
    assert.equal((await inspectLibrary(lib)).state !== 'interrupted', true);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('fixture-only future migration is not in production registry', async () => {
  const {planMigration, listMigrations} = await import('../migrate/registry.mjs');
  assert.equal(listMigrations().some(m => m.to === 2), false);
  const fake = {
    id: '1-to-2-test',
    from: 1,
    to: 2,
    async precheck() {},
    async apply(root) {
      const file = path.join(root, 'db.json');
      const db = JSON.parse(await readFile(file, 'utf8'));
      db.schemaVersion = 2;
      await writeFile(file, JSON.stringify(db));
    },
    async verify(root) {
      const db = JSON.parse(await readFile(path.join(root, 'db.json'), 'utf8'));
      if (db.schemaVersion !== 2) throw new Error('expected 2');
    },
  };
  const steps = planMigration(1, 2, [fake]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].id, '1-to-2-test');

  const lib = await temp();
  try {
    await initEmptyLibrary(lib);
    await fake.apply(lib);
    await fake.verify(lib);
  } finally {
    await rm(lib, {recursive: true, force: true});
  }
});
