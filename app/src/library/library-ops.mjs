import {access, mkdir, readdir} from 'node:fs/promises';
import path from 'node:path';
import {AtlasError} from './errors.mjs';
import {inspectLibrary} from './inspect.mjs';
import {initEmptyLibrary} from './init.mjs';
import {canonicalize} from './paths.mjs';
import {assertWithinAllowedRoots} from './fs-policy.mjs';
import {defaultLibraryParentDir} from './user-registry.mjs';

const NAME_RE = /^[^<>:"/\\|?*\u0000-\u001f]+$/u;

export function slugifyLibraryName(name) {
  const trimmed = String(name || '').trim();
  const safe = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .slice(0, 80);
  return safe || 'library';
}

export function validateDisplayName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.length > 120) {
    throw new AtlasError('library.invalidName', 'Library name must be 1–120 characters.');
  }
  if (!NAME_RE.test(trimmed)) {
    throw new AtlasError('library.invalidName', 'Library name contains unsupported characters.');
  }
  return trimmed;
}

/**
 * Preview the final create path: parentDir / slug(name).
 * Does not create anything.
 */
export async function previewCreateLibrary({name, parentDir, allowedRoots, env = process.env}) {
  const displayName = validateDisplayName(name);
  const parent = canonicalize(parentDir || defaultLibraryParentDir(env));
  await assertWithinAllowedRoots(parent, allowedRoots, {mustExist: false});
  const folderName = slugifyLibraryName(displayName);
  const target = canonicalize(path.join(parent, folderName));
  await assertWithinAllowedRoots(target, allowedRoots, {mustExist: false});
  let exists = false;
  let state = 'missing';
  try {
    await access(target);
    exists = true;
    state = (await inspectLibrary(target)).state;
  } catch {
    exists = false;
  }
  return {displayName, parentDir: parent, folderName, path: target, exists, state};
}

async function assertCreatableFolder(target) {
  try {
    await access(target);
  } catch {
    return; // missing — OK
  }
  const inspection = await inspectLibrary(target);
  if (inspection.state === 'empty') {
    const names = await readdir(target);
    const meaningful = names.filter(n => n !== '.gitkeep');
    if (meaningful.length === 0) return;
  }
  if (inspection.state === 'missing') return;
  throw new AtlasError(
    'library.createConflict',
    `Cannot create library: folder is not empty or is already a library (${inspection.state}): ${target}`,
    {path: target, state: inspection.state},
  );
}

/**
 * Create a new empty library. Refuses non-empty or unknown directories.
 */
export async function createLibrary({name, parentDir, allowedRoots, env = process.env}) {
  const preview = await previewCreateLibrary({name, parentDir, allowedRoots, env});
  await assertCreatableFolder(preview.path);
  await mkdir(preview.path, {recursive: true});
  await initEmptyLibrary(preview.path);
  return {root: preview.path, displayName: preview.displayName};
}

/**
 * Classify a path the user wants to open. Never initializes.
 * Empty folders are not opened as libraries — use Create instead.
 */
export async function inspectOpenTarget(targetPath, allowedRoots) {
  let root;
  try {
    root = await assertWithinAllowedRoots(targetPath, allowedRoots, {mustExist: false});
  } catch (error) {
    return {
      root: canonicalize(path.resolve(targetPath)),
      inspection: {state: 'forbidden', root: path.resolve(targetPath)},
      openable: false,
      error: {code: error.code || 'fs.outsideRoots', message: error.message},
    };
  }
  const inspection = await inspectLibrary(root);
  if (inspection.state === 'missing') {
    return {
      root,
      inspection,
      openable: false,
      error: {code: 'library.missing', message: `Path does not exist: ${root}`},
    };
  }
  if (inspection.state === 'empty') {
    return {
      root,
      inspection,
      openable: false,
      error: {
        code: 'library.emptyFolder',
        message: `Folder is empty and is not an Atlas Docs library yet: ${root}. Use Create to initialize it.`,
      },
    };
  }
  if (inspection.state === 'newer') {
    return {
      root,
      inspection,
      openable: false,
      error: {code: 'library.newerSchema', message: inspection.message},
    };
  }
  if (inspection.state === 'unknown') {
    return {
      root,
      inspection,
      openable: false,
      error: {
        code: 'library.unknown',
        message: inspection.message || 'Directory is not a recognized Atlas Docs library.',
      },
    };
  }
  // ready | legacy | interrupted — openable (prepare handles migrate / recover)
  return {root, inspection, openable: true, error: null};
}

export async function uniqueDemoPath(parentDir, allowedRoots, env = process.env) {
  const parent = canonicalize(parentDir || defaultLibraryParentDir(env));
  await assertWithinAllowedRoots(parent, allowedRoots, {mustExist: false});
  await mkdir(parent, {recursive: true});
  const base = 'Little-Cafe-Demo';
  for (let i = 0; i < 50; i++) {
    const name = i === 0 ? base : `${base}-${i}`;
    const target = path.join(parent, name);
    try {
      await access(target);
    } catch {
      await assertWithinAllowedRoots(target, allowedRoots, {mustExist: false});
      return {
        path: canonicalize(target),
        displayName: i === 0 ? 'Little Café (demo)' : `Little Café (demo ${i})`,
      };
    }
  }
  throw new AtlasError('library.demoBusy', 'Could not find a free demo library folder name.');
}
