import '../helpers/environment.mjs';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadTs} from '../helpers/load-ts.mjs';

const root = await mkdtemp(path.join(tmpdir(), 'atlas-drain-'));
process.env.DATA_DIR = root;
process.env.ATLAS_LIBRARY_MODE = 'fixed';
delete process.env.ATLAS_LIBRARY_MANAGER;

await mkdir(path.join(root, 'docs'), {recursive: true});
await mkdir(path.join(root, 'uploads'), {recursive: true});
await mkdir(path.join(root, 'history'), {recursive: true});
await writeFile(
  path.join(root, 'db.json'),
  JSON.stringify({
    schemaVersion: 1,
    assets: [],
    folders: [],
    comments: [],
    navigationOrder: {},
    settings: {theme: 'dark', leftWidth: 265, rightWidth: 335, pinnedFolders: [], hiddenFolders: [], keymap: {}},
  }),
);

const store = await loadTs('src/lib/store.ts');

let releaseGate;
const gate = new Promise(resolve => {
  releaseGate = resolve;
});

const admitted = store.withLibraryLock(async () => {
  await gate;
  await store.writeDB(d => {
    d.folders.push({path: 'drain-test', title: 'Drain Test', imageId: null, icon: null});
    return true;
  });
  return 'ok';
});

for (let i = 0; i < 40 && store.inflightLibraryOpCount() === 0; i++) {
  await new Promise(r => setTimeout(r, 25));
}
assert.ok(store.inflightLibraryOpCount() > 0, 'admitted op is in flight');

store.beginShutdown();
await assert.rejects(
  () => store.withLibraryLock(async () => 'nope'),
  error => /previous library runtime|staleRuntime|stale/i.test(String(error?.message || error?.errorKey || error)),
  'new admits rejected after beginShutdown',
);

releaseGate();
assert.equal(await admitted, 'ok');
const db = JSON.parse(await readFile(path.join(root, 'db.json'), 'utf8'));
assert.ok(db.folders.some(f => f.path === 'drain-test'), 'in-flight writeDB completed during drain');

const drained = await store.drainLibraryWrites({timeoutMs: 2000});
assert.equal(drained.ok, true);

await rm(root, {recursive: true, force: true});
console.log('PASS: shutdown admits in-flight writes; rejects new locks');
