import {cp, mkdir, readdir, readFile, stat, writeFile, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {AtlasError} from './errors.mjs';
import {canonicalize} from './paths.mjs';
import {DATA_DIRS} from './schema.mjs';

const SKIP_NAMES = new Set(['.atlas-docs.lock', '.atlas-migrate-journal.json']);

async function walkFiles(root, relative = '') {
  const dir = path.join(root, relative);
  const entries = await readdir(dir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name)) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    const full = path.join(root, rel);
    if (entry.isSymbolicLink()) {
      files.push({relative: rel, kind: 'symlink'});
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, rel));
      continue;
    }
    if (entry.isFile()) {
      const info = await stat(full);
      files.push({relative: rel, kind: 'file', size: info.size});
    } else {
      files.push({relative: rel, kind: 'other'});
    }
  }
  return files;
}

async function hashFile(file) {
  const bytes = await readFile(file);
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Full filesystem backup of a library for schema upgrades.
 * Destination must be outside the library tree. Not limited by UI ZIP ceilings.
 */
export async function createFullBackup(libraryRoot, backupParentDir) {
  const root = canonicalize(libraryRoot);
  const parent = canonicalize(backupParentDir);
  if (parent === root || parent.startsWith(root + path.sep)) {
    throw new AtlasError('backup.nested', 'Upgrade backup must be stored outside the library being backed up.');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(parent, `atlas-upgrade-backup-${stamp}`);
  await mkdir(dest, {recursive: true});

  const listed = await walkFiles(root);
  const unsafe = listed.filter(f => f.kind === 'symlink' || f.kind === 'other');
  if (unsafe.length) {
    const names = unsafe.map(f => f.relative).join(', ');
    throw new AtlasError(
      'backup.unsafeEntries',
      `Cannot safely back up these library entries: ${names}`,
      {entries: unsafe.map(f => f.relative)},
    );
  }

  for (const item of listed) {
    const from = path.join(root, item.relative);
    const to = path.join(dest, item.relative);
    await mkdir(path.dirname(to), {recursive: true});
    await cp(from, to, {errorOnExist: true, recursive: false});
  }

  // Verify file counts and checksums for core data paths + db.json.
  const hashes = {};
  for (const item of listed) {
    hashes[item.relative] = await hashFile(path.join(dest, item.relative));
    const original = await hashFile(path.join(root, item.relative));
    if (hashes[item.relative] !== original) {
      throw new AtlasError('backup.verifyFailed', `Backup checksum mismatch for ${item.relative}`);
    }
  }

  const manifest = {
    format: 'atlas-docs-upgrade-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    source: root,
    files: hashes,
    dataDirs: [...DATA_DIRS],
  };
  await writeFile(path.join(dest, 'atlas-upgrade-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // Ensure destination is readable.
  await access(path.join(dest, 'atlas-upgrade-manifest.json'));

  return {backupDir: dest, manifest, fileCount: listed.length};
}

export async function verifyFullBackup(backupDir) {
  const dest = canonicalize(backupDir);
  const manifest = JSON.parse(await readFile(path.join(dest, 'atlas-upgrade-manifest.json'), 'utf8'));
  if (manifest.format !== 'atlas-docs-upgrade-backup' || manifest.version !== 1) {
    throw new AtlasError('backup.invalid', 'Upgrade backup manifest is invalid.');
  }
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const actual = await hashFile(path.join(dest, relative));
    if (actual !== expected) throw new AtlasError('backup.verifyFailed', `Backup checksum mismatch for ${relative}`);
  }
  return manifest;
}
