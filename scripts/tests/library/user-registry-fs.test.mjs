import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access, mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {
  rememberSuccessfulOpen,
  renameLibraryEntry,
  reorderLibraryEntries,
  removeLibraryEntry,
  loadUserRegistry,
  libraryIdentityKey,
  defaultLibraryParentDir,
} from '../../../app/src/library/user-registry.mjs';
import {assertWithinAllowedRoots, resolveAllowedRoots} from '../../../app/src/library/fs-policy.mjs';
import {
  createLibrary,
  deleteLibraryOnDisk,
  inspectOpenTarget,
  previewCreateLibrary,
} from '../../../app/src/library/library-ops.mjs';
import {summarizeLibraryProject} from '../../../app/src/library/summarize.mjs';
import {writeProjectConfig, readProjectConfig} from '../../../app/src/library/project-config.mjs';
import {initEmptyLibrary} from '../../../app/src/library/init.mjs';
import {acquireLibraryLock} from '../../../app/src/library/lock.mjs';

async function temp() {
  return mkdtemp(path.join(tmpdir(), 'atlas-registry-'));
}

test('registry remembers opens, renames, removes, and dedups paths', async () => {
  const root = await temp();
  const env = {ATLAS_DOCS_REGISTRY_DIR: path.join(root, 'reg')};
  try {
    const lib = path.join(root, 'Lib One');
    await initEmptyLibrary(lib);
    await rememberSuccessfulOpen(lib, {displayName: 'Lib One', env});
    await rememberSuccessfulOpen(lib, {displayName: 'Lib One', env});
    let reg = await loadUserRegistry(env);
    assert.equal(reg.libraries.length, 1);
    assert.equal(reg.libraries[0].displayName, 'Lib One');
    assert.equal(reg.libraries[0].identityKey, libraryIdentityKey(lib));

    await renameLibraryEntry(reg.libraries[0].id, 'Renamed', env);
    reg = await loadUserRegistry(env);
    assert.equal(reg.libraries[0].displayName, 'Renamed');
    assert.equal(reg.libraries[0].path, path.resolve(lib));

    await removeLibraryEntry(reg.libraries[0].id, env);
    reg = await loadUserRegistry(env);
    assert.equal(reg.libraries.length, 0);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('create refuses nonempty folders; open refuses empty; fs containment works', async () => {
  const root = await temp();
  try {
    const allowed = [root];
    const parent = path.join(root, 'libs');
    await mkdir(parent, {recursive: true});
    const preview = await previewCreateLibrary({name: 'Project A', parentDir: parent, allowedRoots: allowed});
    assert.match(preview.path.replace(/\\/g, '/'), /Project-A$/);

    const created = await createLibrary({name: 'Project A', parentDir: parent, allowedRoots: allowed});
    await assert.rejects(
      () => createLibrary({name: 'Project A', parentDir: parent, allowedRoots: allowed}),
      /already|not empty|createConflict/i,
    );

    const openReady = await inspectOpenTarget(created.root, allowed);
    assert.equal(openReady.openable, true);

    const emptyDir = path.join(parent, 'blank');
    await mkdir(emptyDir);
    const openEmpty = await inspectOpenTarget(emptyDir, allowed);
    assert.equal(openEmpty.openable, false);
    assert.equal(openEmpty.error.code, 'library.emptyFolder');

    await assert.rejects(
      () => assertWithinAllowedRoots(path.join(root, '..', 'outside'), allowed, {mustExist: false}),
      /outside/,
    );
    assert.ok(resolveAllowedRoots({ATLAS_DOCS_ALLOWED_ROOTS: root}).includes(path.resolve(root)));
    assert.ok(defaultLibraryParentDir({ATLAS_DOCS_LIBRARIES_DIR: parent}).includes('libs') || defaultLibraryParentDir({ATLAS_DOCS_LIBRARIES_DIR: parent}) === path.resolve(parent));
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('project config stores absolute path for cross-drive style absolute targets', async () => {
  const root = await temp();
  try {
    const cwd = path.join(root, 'proj');
    await mkdir(cwd);
    const absoluteLib = path.join(root, 'abs-lib');
    await initEmptyLibrary(absoluteLib);
    const written = await writeProjectConfig(cwd, absoluteLib);
    const raw = JSON.parse(await (await import('node:fs/promises')).readFile(written.configPath, 'utf8'));
    // Same volume still may be relative; ensure we never write "./C:/..." style.
    assert.equal(raw.dataDir.startsWith('./') && /^[A-Za-z]:/.test(raw.dataDir.slice(2)), false);
    const read = await readProjectConfig(written.configPath);
    assert.equal(read.dataDir, path.resolve(absoluteLib));
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('deleteLibraryOnDisk removes folder and registry; guards current, example, locked, roots', async () => {
  const root = await temp();
  const env = {ATLAS_DOCS_REGISTRY_DIR: path.join(root, 'reg')};
  const allowed = [root];
  const parent = path.join(root, 'libs');
  try {
    await mkdir(parent, {recursive: true});
    const doomed = await createLibrary({name: 'Doomed', parentDir: parent, allowedRoots: allowed, env});
    await rememberSuccessfulOpen(doomed.root, {displayName: doomed.displayName, env});
    let reg = await loadUserRegistry(env);
    const doomedId = reg.libraries[0].id;

    await deleteLibraryOnDisk({id: doomedId, allowedRoots: allowed, env});
    reg = await loadUserRegistry(env);
    assert.equal(reg.libraries.length, 0);
    await assert.rejects(() => access(doomed.root), {code: 'ENOENT'});

    const keep = await createLibrary({name: 'Keep', parentDir: parent, allowedRoots: allowed, env});
    await rememberSuccessfulOpen(keep.root, {displayName: keep.displayName, env});
    reg = await loadUserRegistry(env);
    const keepId = reg.libraries.find(item => item.path === keep.root || item.displayName === 'Keep').id;

    await assert.rejects(
      () => deleteLibraryOnDisk({id: keepId, allowedRoots: allowed, currentRoot: keep.root, env}),
      /open in this session|deleteCurrent/i,
    );
    await assert.rejects(
      () => deleteLibraryOnDisk({id: keepId, allowedRoots: allowed, examplePath: keep.root, env}),
      /Example|deleteExample/i,
    );

    const lock = await acquireLibraryLock(keep.root, 'test');
    try {
      await assert.rejects(
        () => deleteLibraryOnDisk({id: keepId, allowedRoots: allowed, env}),
        /in use|locked/i,
      );
    } finally {
      await lock.release();
    }

    await assert.rejects(
      () => deleteLibraryOnDisk({id: keepId, allowedRoots: [keep.root], env}),
      /allowed storage root|deleteProtected/i,
    );

    await assert.rejects(
      () => deleteLibraryOnDisk({id: 'missing-id', allowedRoots: allowed, env}),
      /not in recent|registry.missing/i,
    );

    reg = await loadUserRegistry(env);
    assert.equal(reg.libraries.some(item => item.id === keepId), true);
    await access(keep.root);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('registry preserves manual library order across reload', async () => {
  const root = await temp();
  const env = {ATLAS_DOCS_REGISTRY_DIR: path.join(root, 'reg')};
  try {
    const one = path.join(root, 'One');
    const two = path.join(root, 'Two');
    const three = path.join(root, 'Three');
    await initEmptyLibrary(one);
    await initEmptyLibrary(two);
    await initEmptyLibrary(three);
    await rememberSuccessfulOpen(one, {displayName: 'One', env});
    await rememberSuccessfulOpen(two, {displayName: 'Two', env});
    await rememberSuccessfulOpen(three, {displayName: 'Three', env});
    let reg = await loadUserRegistry(env);
    assert.equal(reg.libraries.length, 3);
    const ids = reg.libraries.map(item => item.id);
    const reordered = [ids[2], ids[0], ids[1]];
    await reorderLibraryEntries(reordered, env);
    reg = await loadUserRegistry(env);
    assert.deepEqual(
      reg.libraries.map(item => item.id),
      reordered,
    );
    await rememberSuccessfulOpen(one, {displayName: 'One', env});
    reg = await loadUserRegistry(env);
    assert.deepEqual(
      reg.libraries.map(item => item.id),
      reordered,
      're-open must not reshuffle manual order',
    );
    await assert.rejects(() => reorderLibraryEntries([ids[0]], env), /Order must contain|invalidOrder/i);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('summarizeLibraryProject counts docs tree and db arrays', async () => {
  const root = await temp();
  try {
    const lib = path.join(root, 'counted');
    await initEmptyLibrary(lib);
    await mkdir(path.join(lib, 'docs', 'guide'), {recursive: true});
    await mkdir(path.join(lib, 'docs', 'guide', 'nested'), {recursive: true});
    await writeFile(
      path.join(lib, 'docs', 'guide', 'note.md'),
      '---\ntitle: Note\n---\n\n# Note\n',
    );
    await writeFile(path.join(lib, 'docs', 'guide', 'nested', 'deep.md'), '---\ntitle: Deep\n---\n\n# Deep\n');
    const dbPath = path.join(lib, 'db.json');
    const db = JSON.parse(await readFile(dbPath, 'utf8'));
    db.comments = [{id: 'c1', docId: 'guide/note', content: 'hi'}];
    db.assets = [{id: 'a1', storedName: 'pic.png', mimeType: 'image/png'}];
    await writeFile(dbPath, JSON.stringify(db, null, 2));

    const summary = await summarizeLibraryProject(lib);
    assert.equal(summary.state, 'ready');
    assert.equal(summary.schemaVersion, 1);
    assert.deepEqual(summary.counts, {
      docs: 2,
      folders: 2,
      topics: 1,
      comments: 1,
      assets: 1,
    });

    const missing = await summarizeLibraryProject(path.join(root, 'no-such'));
    assert.equal(missing.state, 'missing');
    assert.equal(missing.counts, null);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
