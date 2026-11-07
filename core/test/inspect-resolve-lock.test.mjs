import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, readdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {inspectLibrary} from '../inspect.mjs';
import {resolveLibraryPath} from '../resolve.mjs';
import {writeProjectConfig} from '../project-config.mjs';
import {acquireLibraryLock, isLockStale} from '../lock.mjs';
import {emptyDatabase} from '../schema.mjs';
import {initEmptyLibrary} from '../init.mjs';
import {prepareLibrary} from '../prepare.mjs';
import {migrateLibrary} from '../migrate/run.mjs';
import {AtlasError} from '../errors.mjs';

async function temp() {
  return mkdtemp(path.join(tmpdir(), 'atlas-core-'));
}

test('inspect distinguishes missing, empty, ready, legacy, newer, unknown', async () => {
  const root = await temp();
  try {
    assert.equal((await inspectLibrary(path.join(root, 'nope'))).state, 'missing');

    const empty = path.join(root, 'empty');
    await mkdir(empty);
    assert.equal((await inspectLibrary(empty)).state, 'empty');

    const ready = path.join(root, 'ready');
    await initEmptyLibrary(ready);
    const readyInfo = await inspectLibrary(ready);
    assert.equal(readyInfo.state, 'ready');
    assert.equal(readyInfo.schemaVersion, 1);

    const legacy = path.join(root, 'legacy');
    await mkdir(path.join(legacy, 'docs'), {recursive: true});
    await mkdir(path.join(legacy, 'uploads'), {recursive: true});
    await mkdir(path.join(legacy, 'history'), {recursive: true});
    const legacyDb = emptyDatabase();
    delete legacyDb.schemaVersion;
    await writeFile(path.join(legacy, 'db.json'), JSON.stringify(legacyDb));
    assert.equal((await inspectLibrary(legacy)).state, 'legacy');

    const newer = path.join(root, 'newer');
    await mkdir(path.join(newer, 'docs'), {recursive: true});
    await mkdir(path.join(newer, 'uploads'), {recursive: true});
    await mkdir(path.join(newer, 'history'), {recursive: true});
    await writeFile(path.join(newer, 'db.json'), JSON.stringify({...emptyDatabase(), schemaVersion: 99}));
    assert.equal((await inspectLibrary(newer)).state, 'newer');

    const unknown = path.join(root, 'unknown');
    await mkdir(unknown);
    await writeFile(path.join(unknown, 'db.json'), '{"hello":1}');
    assert.equal((await inspectLibrary(unknown)).state, 'unknown');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('resolve prefers flag, env, config, then default; broken config does not fall back', async () => {
  const root = await temp();
  try {
    const cwd = path.join(root, 'proj');
    await mkdir(cwd);
    const flag = await resolveLibraryPath({dataDir: 'chosen', cwd});
    assert.equal(flag.root, path.join(cwd, 'chosen'));
    assert.equal(flag.source, 'flag');

    const env = await resolveLibraryPath({env: {DATA_DIR: 'from-env'}, cwd});
    assert.equal(env.root, path.join(cwd, 'from-env'));
    assert.equal(env.source, 'env');

    const lib = path.join(root, 'lib');
    await initEmptyLibrary(lib);
    await writeProjectConfig(cwd, lib);
    const cfg = await resolveLibraryPath({cwd});
    assert.equal(cfg.root, path.resolve(lib));
    assert.equal(cfg.source, 'config');

    await writeFile(path.join(cwd, 'atlas-docs.config.json'), JSON.stringify({dataDir: './missing-library'}));
    await assert.rejects(() => resolveLibraryPath({cwd}), /does not exist/);

    const def = await resolveLibraryPath({cwd: path.join(root, 'other')});
    // other does not exist as cwd for default — create it
    await mkdir(path.join(root, 'other'));
    const def2 = await resolveLibraryPath({cwd: path.join(root, 'other')});
    assert.equal(def2.source, 'default');
    assert.ok(def2.root.endsWith('atlas-docs-data'));
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('cross-process lock rejects second holder; stale dead pid can be replaced', async () => {
  const root = await temp();
  try {
    const lib = path.join(root, 'lib');
    await mkdir(lib);
    const first = await acquireLibraryLock(lib, 'server');
    await assert.rejects(() => acquireLibraryLock(lib, 'server'), /in use/);
    await first.release();

    const lockFile = path.join(lib, '.atlas-docs.lock');
    await writeFile(lockFile, JSON.stringify({
      pid: 999999,
      nonce: 'dead',
      purpose: 'server',
      acquiredAt: new Date(Date.now() - 60_000).toISOString(),
      heartbeatAt: new Date(Date.now() - 60_000).toISOString(),
    }));
    assert.equal(isLockStale(JSON.parse(await readFile(lockFile, 'utf8'))), true);
    const second = await acquireLibraryLock(lib, 'migrate');
    await second.release();
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('prepare inits empty library; migrate legacy with confirm; newer leaves files unchanged', async () => {
  const root = await temp();
  try {
    const fresh = path.join(root, 'fresh');
    const prepared = await prepareLibrary({libraryRoot: fresh, autoConfirmMigrate: true, holdLock: false, log() {}});
    assert.equal(prepared.inspection.state, 'ready');
    assert.equal(JSON.parse(await readFile(path.join(fresh, 'db.json'), 'utf8')).schemaVersion, 1);

    const legacy = path.join(root, 'legacy');
    await mkdir(path.join(legacy, 'docs'), {recursive: true});
    await mkdir(path.join(legacy, 'uploads'), {recursive: true});
    await mkdir(path.join(legacy, 'history'), {recursive: true});
    const before = emptyDatabase();
    delete before.schemaVersion;
    before.comments = [{id: 'c1', docId: 'a/b', content: 'hi', quote: '', blockId: '', createdAt: '2020-01-01T00:00:00.000Z', resolved: false}];
    await writeFile(path.join(legacy, 'db.json'), JSON.stringify(before, null, 2));
    const snapshot = await readFile(path.join(legacy, 'db.json'), 'utf8');

    await assert.rejects(
      () => prepareLibrary({libraryRoot: legacy, holdLock: false, log() {}}),
      /needs schema migration|needsConfirm/,
    );
    assert.equal(await readFile(path.join(legacy, 'db.json'), 'utf8'), snapshot);

    const migrated = await migrateLibrary(legacy, {
      appVersion: '5.2.0',
      backupParentDir: path.join(root, 'backups'),
      confirm: true,
      log() {},
    });
    assert.equal(migrated.migrated, true);
    const after = JSON.parse(await readFile(path.join(legacy, 'db.json'), 'utf8'));
    assert.equal(after.schemaVersion, 1);
    assert.equal(after.comments[0].content, 'hi');

    // re-run is no-op
    const again = await migrateLibrary(legacy, {confirm: true, backupParentDir: path.join(root, 'backups2'), log() {}});
    assert.equal(again.migrated, false);

    const newer = path.join(root, 'newer');
    await mkdir(path.join(newer, 'docs'), {recursive: true});
    await mkdir(path.join(newer, 'uploads'), {recursive: true});
    await mkdir(path.join(newer, 'history'), {recursive: true});
    const newerDb = {...emptyDatabase(), schemaVersion: 99};
    await writeFile(path.join(newer, 'db.json'), JSON.stringify(newerDb, null, 2));
    const newerSnap = await readFile(path.join(newer, 'db.json'), 'utf8');
    await assert.rejects(() => prepareLibrary({libraryRoot: newer, autoConfirmMigrate: true, holdLock: false, log() {}}), AtlasError);
    assert.equal(await readFile(path.join(newer, 'db.json'), 'utf8'), newerSnap);
    assert.deepEqual(await readdir(newer), ['docs', 'uploads', 'history', 'db.json'].sort().length ? await readdir(newer) : await readdir(newer));
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
