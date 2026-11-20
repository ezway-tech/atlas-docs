import {createHash, randomUUID} from 'node:crypto';
import {access, mkdir, open, readFile, rename, unlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AtlasError} from './errors.mjs';
import {canonicalize, normalizePathForCompare} from './paths.mjs';

export const REGISTRY_FILE = 'libraries.json';
export const REGISTRY_VERSION = 1;

/**
 * Resolve the durable registry directory (outside any library).
 * Override with ATLAS_DOCS_REGISTRY_DIR for tests and Docker mounts.
 */
export function resolveRegistryDir(env = process.env, platform = process.platform) {
  const override = env.ATLAS_DOCS_REGISTRY_DIR;
  if (override != null && String(override).trim() !== '') {
    return path.resolve(String(override).trim());
  }
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'atlas-docs');
  }
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg != null && String(xdg).trim() !== '') {
    return path.join(path.resolve(String(xdg).trim()), 'atlas-docs');
  }
  return path.join(os.homedir(), '.config', 'atlas-docs');
}

export function registryPath(env = process.env, platform = process.platform) {
  return path.join(resolveRegistryDir(env, platform), REGISTRY_FILE);
}

/** Stable identity for a library path (case-insensitive only on Windows). */
export function libraryIdentityKey(libraryRoot, platform = process.platform) {
  const normalized = normalizePathForCompare(libraryRoot, platform);
  return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
}

function emptyRegistry() {
  return {
    version: REGISTRY_VERSION,
    recentId: null,
    libraries: [],
  };
}

async function ensureDir(dir) {
  await mkdir(dir, {recursive: true});
}

async function readRaw(file) {
  try {
    const text = await readFile(file, 'utf8');
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new AtlasError('registry.invalid', `Library registry is not a valid object: ${file}`, {file});
    }
    return data;
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyRegistry();
    if (error instanceof AtlasError) throw error;
    if (error instanceof SyntaxError) {
      throw new AtlasError('registry.invalid', `Library registry is not valid JSON: ${file}`, {file});
    }
    throw new AtlasError('registry.unreadable', `Cannot read library registry: ${file}`, {file, cause: error.code});
  }
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.id !== 'string' || !entry.id) return null;
  if (typeof entry.path !== 'string' || !entry.path.trim()) return null;
  return {
    id: entry.id,
    path: canonicalize(entry.path),
    displayName: typeof entry.displayName === 'string' && entry.displayName.trim()
      ? entry.displayName.trim()
      : path.basename(entry.path) || 'Library',
    lastOpenedAt: typeof entry.lastOpenedAt === 'string' ? entry.lastOpenedAt : null,
    identityKey: typeof entry.identityKey === 'string' ? entry.identityKey : libraryIdentityKey(entry.path),
  };
}

function normalizeRegistry(raw) {
  const base = emptyRegistry();
  base.version = Number.isInteger(raw.version) ? raw.version : REGISTRY_VERSION;
  const libraries = [];
  const seen = new Set();
  for (const item of Array.isArray(raw.libraries) ? raw.libraries : []) {
    const entry = normalizeEntry(item);
    if (!entry) continue;
    if (seen.has(entry.identityKey)) continue;
    seen.add(entry.identityKey);
    libraries.push(entry);
  }
  base.libraries = libraries;
  const recent = typeof raw.recentId === 'string' ? raw.recentId : null;
  if (recent && libraries.some(l => l.id === recent)) {
    base.recentId = recent;
  } else if (recent) {
    // Stale id after remove — fall back to the newest listed project.
    base.recentId = libraries[0]?.id || null;
  } else {
    // Explicit null means no recent project yet (e.g. registered companion only).
    base.recentId = null;
  }
  return base;
}

async function withRegistryLock(file, fn) {
  const dir = path.dirname(file);
  await ensureDir(dir);
  const lockFile = `${file}.lock`;
  let handle;
  const started = Date.now();
  for (;;) {
    try {
      handle = await open(lockFile, 'wx');
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() - started > 10_000) {
        throw new AtlasError('registry.busy', 'Library registry is busy. Try again.', {file});
      }
      await new Promise(resolve => setTimeout(resolve, 25 + Math.floor(Math.random() * 40)));
      try {
        const stale = await readFile(lockFile, 'utf8');
        const meta = JSON.parse(stale);
        if (meta?.pid && meta.pid !== process.pid) {
          try {
            process.kill(meta.pid, 0);
          } catch {
            await unlink(lockFile).catch(() => {});
          }
        }
      } catch {
        // ignore parse / race
      }
    }
  }
  try {
    await handle.writeFile(JSON.stringify({pid: process.pid, at: new Date().toISOString()}), 'utf8');
    return await fn();
  } finally {
    await handle.close().catch(() => {});
    await unlink(lockFile).catch(() => {});
  }
}

async function writeAtomic(file, data) {
  const dir = path.dirname(file);
  await ensureDir(dir);
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  const body = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(temp, body, 'utf8');
  await rename(temp, file);
}

/**
 * Load registry. Corrupt files throw; callers may recover by rewriting empty.
 */
export async function loadUserRegistry(env = process.env, platform = process.platform) {
  const file = registryPath(env, platform);
  return {file, ...normalizeRegistry(await readRaw(file))};
}

/**
 * Safe load: invalid registry returns empty + recovery hint instead of crashing the app.
 */
export async function loadUserRegistrySafe(env = process.env, platform = process.platform) {
  const file = registryPath(env, platform);
  try {
    return {file, recovery: null, ...normalizeRegistry(await readRaw(file))};
  } catch (error) {
    if (error instanceof AtlasError && (error.code === 'registry.invalid' || error.code === 'registry.unreadable')) {
      return {
        file,
        recovery: {
          code: error.code,
          message: error.message,
          action: 'Registry will be rewritten when a library opens successfully. Existing library folders were not changed.',
        },
        ...emptyRegistry(),
      };
    }
    throw error;
  }
}

export async function updateUserRegistry(mutator, env = process.env, platform = process.platform) {
  const file = registryPath(env, platform);
  return withRegistryLock(file, async () => {
    let current;
    try {
      current = normalizeRegistry(await readRaw(file));
    } catch (error) {
      if (error instanceof AtlasError && (error.code === 'registry.invalid' || error.code === 'registry.unreadable')) {
        current = emptyRegistry();
      } else {
        throw error;
      }
    }
    const next = normalizeRegistry(await mutator({...current, libraries: current.libraries.map(l => ({...l}))}) || current);
    await writeAtomic(file, next);
    return {file, ...next};
  });
}

/** Record a successful open. Only call after the runtime is ready. */
export async function rememberSuccessfulOpen(libraryRoot, {displayName, env = process.env, platform = process.platform} = {}) {
  const root = canonicalize(libraryRoot);
  const identityKey = libraryIdentityKey(root);
  const now = new Date().toISOString();
  return updateUserRegistry(reg => {
    const existing = reg.libraries.find(l => l.identityKey === identityKey);
    if (existing) {
      existing.path = root;
      existing.lastOpenedAt = now;
      if (displayName && displayName.trim()) existing.displayName = displayName.trim();
      reg.recentId = existing.id;
      return reg;
    }
    const entry = {
      id: randomUUID(),
      path: root,
      displayName: (displayName && displayName.trim()) || path.basename(root) || 'Library',
      lastOpenedAt: now,
      identityKey,
    };
    reg.libraries.unshift(entry);
    reg.recentId = entry.id;
    return reg;
  }, env, platform);
}

/** Persist manual project list order (all registry ids, Example kept first by callers/API). */
export async function reorderLibraryEntries(ids, env = process.env, platform = process.platform) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) {
    throw new AtlasError('registry.invalidOrder', 'Order must list each project once.', {});
  }
  return updateUserRegistry(reg => {
    const byId = new Map(reg.libraries.map(l => [l.id, l]));
    if (ids.length !== byId.size || ids.some(id => !byId.has(id))) {
      throw new AtlasError('registry.invalidOrder', 'Order must contain every registered project.', {});
    }
    reg.libraries = ids.map(id => byId.get(id));
    return reg;
  }, env, platform);
}

export async function renameLibraryEntry(id, displayName, env = process.env, platform = process.platform) {
  const name = String(displayName || '').trim();
  if (!name || name.length > 120) {
    throw new AtlasError('registry.invalidName', 'Display name must be 1–120 characters.', {id});
  }
  return updateUserRegistry(reg => {
    const entry = reg.libraries.find(l => l.id === id);
    if (!entry) throw new AtlasError('registry.missing', 'Library is not in recent list.', {id});
    entry.displayName = name;
    return reg;
  }, env, platform);
}

/** Remove from recent only — never deletes library files. */
export async function removeLibraryEntry(id, env = process.env, platform = process.platform) {
  return updateUserRegistry(reg => {
    reg.libraries = reg.libraries.filter(l => l.id !== id);
    if (reg.recentId === id) reg.recentId = reg.libraries[0]?.id || null;
    return reg;
  }, env, platform);
}

/**
 * Point an existing registry entry at a new folder path after the user re-selects it.
 * Does not move or copy project files.
 */
export async function relocateLibraryEntry(id, newPath, env = process.env, platform = process.platform) {
  const root = canonicalize(newPath);
  const identityKey = libraryIdentityKey(root, platform);
  return updateUserRegistry(reg => {
    const entry = reg.libraries.find(l => l.id === id);
    if (!entry) throw new AtlasError('registry.missing', 'Project is not in the list.', {id});
    const clash = reg.libraries.find(l => l.identityKey === identityKey && l.id !== id);
    if (clash) {
      throw new AtlasError(
        'registry.pathTaken',
        `Another project entry already uses this folder: ${root}`,
        {id, path: root, otherId: clash.id},
      );
    }
    entry.path = root;
    entry.identityKey = identityKey;
    return reg;
  }, env, platform);
}

/**
 * Ensure a path appears in the registry without making it the recent project.
 * Used to keep an existing repo data/ project listed beside Example.
 */
export async function ensureRegistered(libraryRoot, {displayName, env = process.env, platform = process.platform} = {}) {
  const root = canonicalize(libraryRoot);
  const identityKey = libraryIdentityKey(root, platform);
  const name = (displayName && String(displayName).trim()) || path.basename(root) || 'Project';
  return updateUserRegistry(reg => {
    const existing = reg.libraries.find(l => l.identityKey === identityKey);
    if (existing) {
      existing.path = root;
      if (displayName && String(displayName).trim()) existing.displayName = String(displayName).trim();
      return reg;
    }
    reg.libraries.push({
      id: randomUUID(),
      path: root,
      displayName: name,
      lastOpenedAt: null,
      identityKey,
    });
    return reg;
  }, env, platform);
}

export async function getRecentLibrary(env = process.env, platform = process.platform) {
  const reg = await loadUserRegistrySafe(env, platform);
  if (!reg.recentId) return {registry: reg, entry: null};
  const entry = reg.libraries.find(l => l.id === reg.recentId) || null;
  return {registry: reg, entry};
}

/** Default parent folder suggested when creating a new library. */
export function defaultLibraryParentDir(env = process.env, platform = process.platform) {
  const override = env.ATLAS_DOCS_LIBRARIES_DIR;
  if (override != null && String(override).trim() !== '') {
    return path.resolve(String(override).trim());
  }
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'atlas-docs', 'libraries');
  }
  const xdgData = env.XDG_DATA_HOME;
  if (xdgData != null && String(xdgData).trim() !== '') {
    return path.join(path.resolve(String(xdgData).trim()), 'atlas-docs', 'libraries');
  }
  return path.join(os.homedir(), '.local', 'share', 'atlas-docs', 'libraries');
}

export async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}
