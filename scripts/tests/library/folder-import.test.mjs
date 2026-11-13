import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, symlink, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {previewFolderImport, importFolderCopy, ensureDemoLibrary, initEmptyLibrary} from '../../../app/src/library/index.mjs';

test('folder preview and copy preserve source bytes, explain skipped files, and reject stale previews', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-folder-copy-'));
  try {
    const source = path.join(root, 'source'), parentDir = path.join(root, 'libraries');
    await mkdir(path.join(source, 'guide'), {recursive: true});
    await writeFile(path.join(source, 'welcome.md'), '# Hello');
    await writeFile(path.join(source, 'guide', 'api.yaml'), 'openapi: 3.0.0');
    await writeFile(path.join(source, 'photo.png'), 'untouched');
    const options = {source, parentDir, name: 'Copy', allowedRoots: [root]};
    const preview = await previewFolderImport(options);
    assert.equal(preview.files.length, 2);
    assert.deepEqual(preview.skipped, [{path: 'photo.png', reason: 'format'}]);
    assert.equal(preview.files.find(f => f.path === 'welcome.md').target, 'documents/welcome.md');
    await assert.rejects(readFile(path.join(preview.destination, 'db.json')), {code: 'ENOENT'});
    await writeFile(path.join(source, 'welcome.md'), '# Changed');
    await assert.rejects(importFolderCopy({...options, fingerprint: preview.fingerprint}), /changed/);
    const fresh = await previewFolderImport(options);
    const created = await importFolderCopy({...options, fingerprint: fresh.fingerprint});
    assert.equal(await readFile(path.join(created.root, 'docs/documents/welcome.md'), 'utf8'), '# Changed');
    assert.equal(await readFile(path.join(source, 'welcome.md'), 'utf8'), '# Changed');
    assert.deepEqual((await readdir(source)).sort(), ['guide', 'photo.png', 'welcome.md']);
    await assert.rejects(importFolderCopy({...options, fingerprint: fresh.fingerprint}), /already exists/);
    await assert.rejects(previewFolderImport({...options, parentDir: source, name: 'nested'}), /outside/);
    await assert.rejects(previewFolderImport({...options, allowedRoots: [parentDir]}));
  } finally {await rm(root, {recursive: true, force: true});}
});

test('empty folders, invalid names, deep trees and junctions cannot become hidden imports', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-folder-skip-'));
  try {
    const source = path.join(root, 'source');
    await mkdir(path.join(source, 'a/b/c/d'), {recursive: true});
    await writeFile(path.join(source, 'a/b/c/d/hidden.md'), 'skip');
    await writeFile(path.join(source, 'UPPER.md'), 'skip');
    await symlink(path.join(source, 'a'), path.join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const options = {source, name: 'Copy', parentDir: path.join(root, 'copies'), allowedRoots: [root]};
    const preview = await previewFolderImport(options);
    assert.equal(preview.files.length, 0);
    assert.ok(preview.skipped.some(f => f.reason === 'link'));
    assert.ok(preview.skipped.some(f => f.path === 'a/b/c/d/'));
    await assert.rejects(importFolderCopy({...options, fingerprint: preview.fingerprint}), /No supported/);
    await assert.rejects(readdir(path.join(root, 'copies')), {code: 'ENOENT'});
    await writeFile(path.join(source, 'db.json'), 'broken');
    await assert.rejects(previewFolderImport(options), /Atlas library/);
  } finally {await rm(root, {recursive: true, force: true});}
});

test('demo is reused and keeps edits', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-demo-reuse-'));
  try {
    const env = {ATLAS_DOCS_REGISTRY_DIR: path.join(root, 'registry'), ATLAS_DOCS_LIBRARIES_DIR: path.join(root, 'libraries')};
    let seeds = 0;
    const options = {env, allowedRoots: [root], seed: async target => {seeds++; await initEmptyLibrary(target);}};
    const first = await ensureDemoLibrary(options);
    await writeFile(path.join(first.path, 'docs', 'edited.md'), 'keep');
    const second = await ensureDemoLibrary(options);
    assert.equal(first.path, second.path);
    assert.equal(seeds, 1);
    assert.equal(await readFile(path.join(second.path, 'docs', 'edited.md'), 'utf8'), 'keep');
  } finally {await rm(root, {recursive: true, force: true});}
});
