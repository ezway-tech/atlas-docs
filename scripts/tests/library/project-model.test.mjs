import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ensureDemoLibrary,
  readExampleProject,
  ensureRegistered,
  initializeEmptyProject,
  inspectOpenTarget,
  initEmptyLibrary,
  loadUserRegistrySafe,
  relocateLibraryEntry,
  rememberSuccessfulOpen,
  removeLibraryEntry,
  resolveManagedStartupProject,
} from '../../../app/src/library/index.mjs';

test('Example stays registered without stealing recent selection; broken pointers stay visible', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-example-list-'));
  const env = {ATLAS_DOCS_REGISTRY_DIR: path.join(root, 'registry'), ATLAS_DOCS_LIBRARIES_DIR: path.join(root, 'projects')};
  try {
    const own = path.join(root, 'own');
    await initEmptyLibrary(own);
    await rememberSuccessfulOpen(own, {env});
    const before = await loadUserRegistrySafe(env);
    const example = await ensureDemoLibrary({env, allowedRoots: [root], seed: initEmptyLibrary, remember: false});
    const after = await loadUserRegistrySafe(env);
    assert.equal(after.recentId, before.recentId);
    assert.ok(after.libraries.some(entry => entry.path === example.path));
    const state = await readExampleProject({env, allowedRoots: [root]});
    assert.equal(state.path, example.path);
    assert.equal(state.error, null);
    await writeFile(path.join(example.path, 'db.json'), 'invalid fixture');
    const broken = await readExampleProject({env, allowedRoots: [root]});
    assert.equal(broken.path, example.path);
    assert.ok(broken.error);
    await assert.rejects(ensureDemoLibrary({env, allowedRoots: [root], seed: initEmptyLibrary, remember: false}));
    assert.equal(await readFile(path.join(example.path, 'db.json'), 'utf8'), 'invalid fixture');
  } finally {await rm(root, {recursive: true, force: true});}
});

test('Example seeds once and keeps edits', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-example-'));
  try {
    const env = {
      ATLAS_DOCS_REGISTRY_DIR: path.join(root, 'registry'),
      ATLAS_DOCS_LIBRARIES_DIR: path.join(root, 'libraries'),
    };
    let seeds = 0;
    const options = {
      env,
      allowedRoots: [root],
      seed: async target => {
        seeds++;
        await initEmptyLibrary(target);
      },
    };
    const first = await ensureDemoLibrary(options);
    assert.equal(first.displayName, 'Example');
    assert.match(first.path, /Example$/);
    await writeFile(path.join(first.path, 'docs', 'edited.md'), 'keep');
    const second = await ensureDemoLibrary(options);
    assert.equal(first.path, second.path);
    assert.equal(seeds, 1);
    assert.equal(await readFile(path.join(second.path, 'docs', 'edited.md'), 'utf8'), 'keep');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('initialize empty project in place; unknown folder is not mutated', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-init-empty-'));
  try {
    const empty = path.join(root, 'empty');
    await mkdir(empty, {recursive: true});
    const created = await initializeEmptyProject(empty, [root]);
    assert.equal(created.root, path.resolve(empty));
    assert.equal(created.displayName, 'empty');
    assert.ok(await readFile(path.join(empty, 'db.json'), 'utf8'));

    const named = path.join(root, 'named-folder');
    await mkdir(named, {recursive: true});
    const withName = await initializeEmptyProject(named, [root], {displayName: 'My Library'});
    assert.equal(withName.root, path.resolve(named));
    assert.equal(withName.displayName, 'My Library');

    const junk = path.join(root, 'junk');
    await mkdir(junk, {recursive: true});
    await writeFile(path.join(junk, 'file.txt'), 'stay');
    const inspected = await inspectOpenTarget(junk, [root]);
    assert.equal(inspected.openable, true);
    assert.equal(inspected.inspection.state, 'folder');
    await assert.rejects(() => initializeEmptyProject(junk, [root]), /files but no db\.json|not an Atlas Docs project|not a recognized|Cannot initialize/i);
    assert.equal(await readFile(path.join(junk, 'file.txt'), 'utf8'), 'stay');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('relocate updates registry path without deleting files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-relocate-'));
  try {
    const env = {ATLAS_DOCS_REGISTRY_DIR: path.join(root, 'registry')};
    const first = path.join(root, 'one');
    const second = path.join(root, 'two');
    await initEmptyLibrary(first);
    await initEmptyLibrary(second);
    await rememberSuccessfulOpen(first, {displayName: 'One', env});
    const reg = await loadUserRegistrySafe(env);
    const entry = reg.libraries.find(l => l.displayName === 'One');
    await relocateLibraryEntry(entry.id, second, env);
    const next = await loadUserRegistrySafe(env);
    const moved = next.libraries.find(l => l.id === entry.id);
    assert.equal(moved.path, path.resolve(second));
    assert.ok(await readFile(path.join(first, 'db.json'), 'utf8'));
    await removeLibraryEntry(entry.id, env);
    assert.ok(await readFile(path.join(second, 'db.json'), 'utf8'));
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('managed startup opens Example first, then recent; companion data stays listed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-startup-'));
  try {
    const env = {
      ATLAS_DOCS_REGISTRY_DIR: path.join(root, 'registry'),
      ATLAS_DOCS_LIBRARIES_DIR: path.join(root, 'libraries'),
      ATLAS_DOCS_ALLOWED_ROOTS: root,
    };
    const companion = path.join(root, 'data');
    await initEmptyLibrary(companion);
    let seeds = 0;
    const seed = {
      seedDemo: async target => {
        seeds++;
        await initEmptyLibrary(target);
        await writeFile(path.join(target, 'docs', 'welcome.md'), '# Example');
      },
    };
    const first = await resolveManagedStartupProject({
      env,
      companionDataRoot: companion,
      seed,
    });
    assert.equal(first.source, 'example');
    assert.equal(first.displayName, 'Example');
    assert.equal(seeds, 1);
    const reg = await loadUserRegistrySafe(env);
    assert.ok(reg.libraries.some(l => l.path === path.resolve(companion)));
    assert.ok(reg.libraries.some(l => l.displayName === 'Example'));

    const user = path.join(root, 'user-project');
    await initEmptyLibrary(user);
    await rememberSuccessfulOpen(user, {displayName: 'User', env});
    const second = await resolveManagedStartupProject({env, companionDataRoot: companion, seed});
    assert.equal(second.source, 'recent');
    assert.equal(second.root, path.resolve(user));
    assert.equal(seeds, 1);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('registry env isolation does not use machine default when override is set', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-reg-iso-'));
  try {
    const env = {ATLAS_DOCS_REGISTRY_DIR: path.join(root, 'registry')};
    const lib = path.join(root, 'lib');
    await initEmptyLibrary(lib);
    await ensureRegistered(lib, {displayName: 'Isolated', env});
    const reg = await loadUserRegistrySafe(env);
    assert.equal(reg.libraries.length, 1);
    assert.ok(reg.file.startsWith(path.resolve(root, 'registry')));
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('packaged startup seeds from bundled demo directory, without global environment mutation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-packaged-example-'));
  try {
    const packageRoot = path.join(root, 'package');
    const bundled = path.join(packageRoot, 'demo', 'little-cafe');
    await mkdir(bundled, {recursive: true});
    await writeFile(path.join(packageRoot, 'demo', 'seed-demo.mjs'),
      'export const demoRoot="/wrong/source/path"; export async function seedDemo(root,sample){if(!sample.endsWith("little-cafe"))throw Error("wrong sample");const fs=await import("node:fs/promises");await fs.mkdir(root,{recursive:true});await fs.writeFile(root+"/sample-path",sample);}'
    );
    const env = {ATLAS_DOCS_REGISTRY_DIR:path.join(root,'registry'),ATLAS_DOCS_LIBRARIES_DIR:path.join(root,'libraries'),ATLAS_DOCS_ALLOWED_ROOTS:root};
    const selected = await resolveManagedStartupProject({packageRoot,env});
    assert.equal(await readFile(path.join(selected.root,'sample-path'),'utf8'), bundled);
  } finally { await rm(root, {recursive:true,force:true}); }
});
