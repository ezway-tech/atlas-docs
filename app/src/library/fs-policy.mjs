import {access, lstat, readdir, realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AtlasError} from './errors.mjs';
import {canonicalize, pathIsWithinRoot} from './paths.mjs';
import {defaultLibraryParentDir} from './user-registry.mjs';

const MAX_BROWSE_ENTRIES = 200;

/**
 * Parse ATLAS_DOCS_ALLOWED_ROOTS (path.delimiter-separated) plus built-in defaults.
 * Docker/manager should set this explicitly to mounted roots only.
 */
export function resolveAllowedRoots(env = process.env, platform = process.platform) {
  const configured = env.ATLAS_DOCS_ALLOWED_ROOTS;
  if (configured != null && String(configured).trim() !== '') {
    return String(configured)
      .split(path.delimiter)
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => canonicalize(path.resolve(part)));
  }

  const roots = new Set();
  const add = value => {
    if (!value) return;
    try {
      roots.add(canonicalize(path.resolve(value)));
    } catch {
      // skip
    }
  };

  add(defaultLibraryParentDir(env, platform));
  add(os.homedir());
  add(process.cwd());

  if (platform === 'win32') {
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      roots.add(path.resolve(`${letter}:\\`));
    }
  }

  const librariesMount = env.ATLAS_LIBRARIES_ROOT || env.ATLAS_DOCS_LIBRARIES_DIR;
  if (librariesMount) add(librariesMount);

  // Extra roots: ATLAS_DOCS_ALLOWED_ROOTS (above) or append via that env when narrowing Docker mounts.
  return [...roots];
}

function isDriveRoot(target, platform = process.platform) {
  if (platform !== 'win32') return target === path.parse(target).root;
  const parsed = path.win32.parse(target);
  return parsed.root === target || parsed.root.replace(/\\/g, '/') === target.replace(/\\/g, '/');
}

/**
 * Canonical containment: candidate must equal root or be a real descendant.
 * Uses realpath when available to resist symlink/junction escapes.
 */
export async function assertWithinAllowedRoots(
  targetPath,
  allowedRoots,
  {mustExist = false, platform = process.platform} = {},
) {
  const absolute = path.resolve(targetPath);
  let candidate;
  try {
    candidate = await realpath(absolute);
  } catch (error) {
    if (mustExist || error.code !== 'ENOENT') {
      throw new AtlasError('fs.notFound', `Path does not exist: ${absolute}`, {path: absolute});
    }
    // For paths being created: check the nearest existing ancestor.
    let probe = absolute;
    for (;;) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      try {
        candidate = path.join(await realpath(parent), path.relative(parent, absolute));
        break;
      } catch {
        probe = parent;
      }
    }
    if (!candidate) candidate = canonicalize(absolute);
  }

  const resolvedCandidate = canonicalize(candidate);
  for (const root of allowedRoots) {
    let rootReal;
    try {
      rootReal = await realpath(root);
    } catch {
      rootReal = canonicalize(root);
    }
    if (pathIsWithinRoot(resolvedCandidate, rootReal, platform)) {
      return resolvedCandidate;
    }
  }
  throw new AtlasError(
    'fs.outsideRoots',
    `Path is outside allowed roots: ${absolute}`,
    {path: absolute, allowedRoots},
  );
}

export async function listBrowsableDir(targetPath, allowedRoots, {limit = MAX_BROWSE_ENTRIES} = {}) {
  const root = await assertWithinAllowedRoots(targetPath, allowedRoots, {mustExist: true});
  const st = await lstat(root);
  if (!st.isDirectory()) {
    throw new AtlasError('fs.notDirectory', `Not a directory: ${root}`, {path: root});
  }

  let entries;
  try {
    entries = await readdir(root, {withFileTypes: true});
  } catch (error) {
    throw new AtlasError('fs.permission', `Cannot read directory: ${root}`, {path: root, cause: error.code});
  }

  const directories = [];
  let truncated = false;
  const sorted = entries
    .filter(e => e.isDirectory() || e.isSymbolicLink())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));

  for (const entry of sorted) {
    if (directories.length >= limit) {
      truncated = true;
      break;
    }
    const child = path.join(root, entry.name);
    let realChild = child;
    let kind = 'directory';
    try {
      if (entry.isSymbolicLink()) {
        realChild = await realpath(child);
        const childStat = await lstat(realChild);
        if (!childStat.isDirectory()) continue;
        kind = 'symlink';
      }
      // Containment for listed children (skip escapes from this root).
      await assertWithinAllowedRoots(realChild, allowedRoots, {mustExist: true});
    } catch {
      continue;
    }
    directories.push({
      name: entry.name,
      path: canonicalize(child),
      kind,
    });
  }

  const parent = path.dirname(root);
  let parentPath = null;
  if (parent !== root) {
    try {
      parentPath = await assertWithinAllowedRoots(parent, allowedRoots, {mustExist: true});
    } catch {
      parentPath = null;
    }
  }

  const crumbs = [];
  let cursor = root;
  for (;;) {
    crumbs.unshift({name: path.basename(cursor) || cursor, path: cursor});
    const next = path.dirname(cursor);
    if (next === cursor) break;
    try {
      await assertWithinAllowedRoots(next, allowedRoots, {mustExist: true});
      cursor = next;
    } catch {
      break;
    }
  }

  return {
    path: root,
    parent: parentPath,
    breadcrumbs: crumbs,
    directories,
    truncated,
    limit,
    isDriveRoot: isDriveRoot(root),
  };
}

export async function listAllowedRootInfos(allowedRoots) {
  const result = [];
  for (const root of allowedRoots) {
    try {
      await access(root);
      result.push({path: canonicalize(root), available: true});
    } catch {
      // Skip missing Windows drive letters from the default probe list.
      if (/^[a-z]:\\$/i.test(root) || /^[a-z]:\/$/i.test(root)) continue;
      result.push({path: canonicalize(root), available: false});
    }
  }
  return result;
}
