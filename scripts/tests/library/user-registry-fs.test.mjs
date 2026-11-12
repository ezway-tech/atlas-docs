import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {
  rememberSuccessfulOpen,
  renameLibraryEntry,
  removeLibraryEntry,
  loadUserRegistry,
  libraryIdentityKey,
  defaultLibraryParentDir,
} from '../../../app/src/library/user-registry.mjs';
import {assertWithinAllowedRoots, resolveAllowedRoots} from '../../../app/src/library/fs-policy.mjs';
import {createLibrary, inspectOpenTarget, previewCreateLibrary} from '../../../app/src/library/library-ops.mjs';
import {writeProjectConfig, readProjectConfig} from '../../../app/src/library/project-config.mjs';
import {initEmptyLibrary} from '../../../app/src/library/init.mjs';

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
