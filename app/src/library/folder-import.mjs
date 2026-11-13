import path from 'node:path';
import {lstat, readdir, open, mkdir, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertWithinAllowedRoots} from './fs-policy.mjs';
import {previewCreateLibrary} from './library-ops.mjs';
import {initEmptyLibrary} from './init.mjs';
import {pathIsWithinRoot} from './paths.mjs';
import {acquireLibraryLock} from './lock.mjs';

const MAX_BYTES = 140 * 1024 * 1024;
const MAX_ENTRIES = 12000;
const validFolder = /^[a-z0-9][a-z0-9_ -]*$/;
const validFile = /^[a-z0-9][a-z0-9_ -]*\.(md|yaml|yml|sql|json)$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function readSourceFile(source, relative, remaining = MAX_BYTES) {
  let current = source;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw Error('Source changed to a symbolic link. Review it again.');
  }
  await assertWithinAllowedRoots(current, [source], {mustExist: true});
  const handle = await open(current, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > remaining) throw Error('Documents exceed the import limit.');
    const content = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < content.length) {
      const {bytesRead} = await handle.read(content, offset, content.length - offset, offset);
      if (!bytesRead) throw Error('Source changed. Review it again.');
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw Error('Source changed. Review it again.');
    return content;
  } finally {await handle.close();}
}

export async function previewFolderImport({source, name, parentDir, allowedRoots}) {
  if ((await lstat(source)).isSymbolicLink()) throw Error('Choose a real folder, not a symbolic link.');
  source = await assertWithinAllowedRoots(source, allowedRoots, {mustExist: true});
  if (!(await lstat(source)).isDirectory()) throw Error('Choose a folder.');
  // A broken Atlas library must never be mistaken for ordinary documents.
  const names = await readdir(source);
  if (names.includes('db.json') || names.includes('.atlas-migrate-journal.json') || names.includes('.import-journal.json')) {
    throw Error('This is an Atlas library. Repair or open it instead of importing it.');
  }
  const destination = await previewCreateLibrary({name, parentDir, allowedRoots});
  if (destination.exists) throw Error('The destination already exists. Choose another name.');
  if (pathIsWithinRoot(destination.path, source)) throw Error('The copy must be saved outside the source folder.');
  const files = [], skipped = [], targets = new Set();
  let bytes = 0, count = 0;
  async function walk(dir, prefix = '') {
    const entries = (await readdir(dir, {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++count > MAX_ENTRIES) throw Error('Too many entries (maximum 12000). Choose a smaller folder.');
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {skipped.push({path: relative, reason: 'link'}); continue;}
      if (entry.isDirectory()) {
        if (relative.split('/').length > 3 || !validFolder.test(entry.name)) {
          skipped.push({path: relative + '/', reason: 'path'}); continue;
        }
        await assertWithinAllowedRoots(full, [source], {mustExist: true});
        await walk(full, relative);
      } else if (entry.isFile()) {
        if (!validFile.test(entry.name)) {skipped.push({path: relative, reason: 'format'}); continue;}
        const target = prefix ? relative : `documents/${entry.name}`;
        if (targets.has(target)) throw Error(`Two files would have the same destination: ${target}`);
        await assertWithinAllowedRoots(full, [source], {mustExist: true});
        const content = await readSourceFile(source, relative, MAX_BYTES - bytes);
        bytes += content.length;
        files.push({path: relative, target, size: content.length, hash: hash(content)});
        targets.add(target);
      } else skipped.push({path: relative, reason: 'format'});
    }
  }
  await walk(source);
  const fingerprint = hash(JSON.stringify({source, destination: destination.path, files, skipped}));
  return {source, destination: destination.path, name: destination.displayName, files, skipped, bytes, fingerprint};
}

export async function importFolderCopy(options) {
  const preview = await previewFolderImport(options);
  if (!preview.files.length) throw Error('No supported documents to import.');
  if (preview.fingerprint !== options.fingerprint) throw Error('The source changed. Review the preview again.');
  await mkdir(path.dirname(preview.destination), {recursive: true});
  await mkdir(preview.destination); // Exclusive reservation; never merge with an existing library.
  const lock = await acquireLibraryLock(preview.destination, 'folder-import');
  try {
    for (const file of preview.files) {
      const original = path.join(preview.source, file.path);
      await assertWithinAllowedRoots(original, [preview.source], {mustExist: true});
      if (!(await lstat(original)).isFile() || (await lstat(original)).isSymbolicLink()) throw Error('Source changed. Review it again.');
      const content = await readSourceFile(preview.source, file.path, file.size);
      if (hash(content) !== file.hash) throw Error('Source changed. Review it again.');
      const target = path.join(preview.destination, 'docs', file.target);
      await mkdir(path.dirname(target), {recursive: true});
      await writeFile(target, content, {flag: 'wx'});
    }
    await initEmptyLibrary(preview.destination);
    await lock.release();
    return {root: preview.destination, displayName: preview.name};
  } catch (error) {
    await lock.release();
    // Only the exclusively-created destination belongs to this operation.
    if (!pathIsWithinRoot(preview.destination, path.dirname(preview.destination)) || pathIsWithinRoot(preview.source, preview.destination)) throw error;
    await rm(preview.destination, {recursive: true, force: true});
    throw error;
  }
}
