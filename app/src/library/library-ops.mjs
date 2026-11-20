import {access, lstat, mkdir, readdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {AtlasError} from './errors.mjs';
import {inspectLibrary} from './inspect.mjs';
import {initEmptyLibrary} from './init.mjs';
import {canonicalize, normalizePathForCompare} from './paths.mjs';
import {assertWithinAllowedRoots, isDriveRoot} from './fs-policy.mjs';
import {isLockStale, readLibraryLock} from './lock.mjs';
import {
  defaultLibraryParentDir,
  libraryIdentityKey,
  loadUserRegistry,
  removeLibraryEntry,
} from './user-registry.mjs';

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
 * Empty folders need explicit confirmation via initializeEmptyProject.
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
      canInitialize: true,
      error: {
        code: 'library.emptyFolder',
        message: `Folder is empty and is not an Atlas Docs project yet: ${root}. Confirm to create a project here.`,
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
        message:
          inspection.message ||
          `This folder is not an Atlas Docs project (expected docs/, uploads/, history/, and db.json). Nothing was changed: ${root}`,
      },
    };
  }
  // ready | legacy | interrupted — openable (prepare handles migrate / recover)
  return {root, inspection, openable: true, error: null};
}

/**
 * Initialize an empty folder as a project in place. Refuses non-empty or unknown content.
 * Call only after the user confirms.
 * Optional displayName is validated; otherwise the folder basename is used.
 */
export async function initializeEmptyProject(targetPath, allowedRoots, {displayName} = {}) {
  const inspected = await inspectOpenTarget(targetPath, allowedRoots);
  const resolvedName = displayName != null && String(displayName).trim()
    ? validateDisplayName(displayName)
    : path.basename(inspected.root) || 'Project';
  if (inspected.inspection.state === 'empty' && inspected.canInitialize) {
    const names = await readdir(inspected.root);
    const meaningful = names.filter(n => n !== '.gitkeep');
    if (meaningful.length > 0) {
      throw new AtlasError(
        'library.createConflict',
        `Cannot initialize project: folder is not empty: ${inspected.root}`,
        {path: inspected.root},
      );
    }
    await initEmptyLibrary(inspected.root);
    return {
      root: inspected.root,
      displayName: resolvedName,
    };
  }
  if (inspected.openable) {
    return {
      root: inspected.root,
      displayName: resolvedName,
      alreadyReady: true,
    };
  }
  throw new AtlasError(
    inspected.error?.code || 'library.unknown',
    inspected.error?.message || `Cannot initialize project at ${inspected.root}`,
    {path: inspected.root, state: inspected.inspection?.state},
  );
}

export async function uniqueDemoPath(parentDir, allowedRoots, env = process.env) {
  const parent = canonicalize(parentDir || defaultLibraryParentDir(env));
  await assertWithinAllowedRoots(parent, allowedRoots, {mustExist: false});
  await mkdir(parent, {recursive: true});
  const base = 'Example';
  for (let i = 0; i < 50; i++) {
    const name = i === 0 ? base : `${base}-${i}`;
    const target = path.join(parent, name);
    try {
      await access(target);
    } catch {
      await assertWithinAllowedRoots(target, allowedRoots, {mustExist: false});
      return {
        path: canonicalize(target),
        displayName: i === 0 ? 'Example' : `Example ${i}`,
      };
    }
  }
  throw new AtlasError('library.demoBusy', 'Could not find a free Example project folder name.');
}

/**
 * Delete a registered project folder on disk, then remove it from the registry.
 * Never deletes Example, the current session library, drive roots, or an allowed root itself.
 * Registry is only updated after a successful rm.
 */
export async function deleteLibraryOnDisk({
  id,
  allowedRoots,
  currentRoot = null,
  examplePath = null,
  env = process.env,
  platform = process.platform,
} = {}) {
  const entryId = String(id || '').trim();
  if (!entryId) {
    throw new AtlasError('registry.missing', 'Library is not in recent list.', {id: entryId});
  }
  const reg = await loadUserRegistry(env, platform);
  const entry = reg.libraries.find(item => item.id === entryId);
  if (!entry) {
    throw new AtlasError('registry.missing', 'Library is not in recent list.', {id: entryId});
  }

  if (examplePath) {
    const exampleKey = libraryIdentityKey(examplePath, platform);
    if (entry.identityKey === exampleKey || libraryIdentityKey(entry.path, platform) === exampleKey) {
      throw new AtlasError(
        'library.deleteExample',
        'The Example project cannot be deleted from disk.',
        {id: entryId, path: entry.path},
      );
    }
  }

  const root = await assertWithinAllowedRoots(entry.path, allowedRoots, {mustExist: true, platform});
  if (isDriveRoot(root, platform)) {
    throw new AtlasError(
      'library.deleteProtected',
      `Refusing to delete a drive root: ${root}`,
      {id: entryId, path: root},
    );
  }
  for (const allowed of allowedRoots || []) {
    if (normalizePathForCompare(root, platform) === normalizePathForCompare(allowed, platform)) {
      throw new AtlasError(
        'library.deleteProtected',
        `Refusing to delete an allowed storage root: ${root}`,
        {id: entryId, path: root},
      );
    }
  }

  if (currentRoot) {
    if (libraryIdentityKey(root, platform) === libraryIdentityKey(currentRoot, platform)) {
      throw new AtlasError(
        'library.deleteCurrent',
        'Cannot delete the project that is open in this session. Switch to another project first.',
        {id: entryId, path: root},
      );
    }
  }

  const lock = await readLibraryLock(root);
  if (lock && !isLockStale(lock)) {
    throw new AtlasError(
      'library.locked',
      `Project is in use by another process and cannot be deleted: ${root}`,
      {id: entryId, path: root, pid: lock.pid},
    );
  }

  const st = await lstat(root);
  if (!st.isDirectory()) {
    throw new AtlasError('fs.notDirectory', `Not a directory: ${root}`, {path: root});
  }

  await rm(root, {recursive: true, force: true});
  return removeLibraryEntry(entryId, env, platform);
}
