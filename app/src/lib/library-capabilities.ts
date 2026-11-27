import {canRevealFolder} from './reveal-folder';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadCore} from './load-core';
import {appRuntime} from './app-runtime';
import {DATA_ROOT} from './data-root';

export type LibraryMode = 'manager' | 'library';

function env(name: string) {
  return process.env[JSON.parse(JSON.stringify(name)) as string];
}

function identityFromRoot(root: string) {
  let normalized = path.resolve(root).replace(/\\/g, '/');
  if (process.platform === 'win32') normalized = normalized.toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
}

export function libraryMode(): LibraryMode {
  const mode = env('ATLAS_LIBRARY_MODE');
  if (mode === 'manager') return 'manager';
  if (mode === 'library') return 'library';
  return env('DATA_DIR') ? 'library' : 'manager';
}

export function isManagerMode() {
  return libraryMode() === 'manager';
}

export function canManageLibraries() {
  const mode = libraryMode();
  return appRuntime().managed || mode === 'manager';
}

export async function libraryCapabilities() {
  const core = await loadCore();
  const mode = libraryMode();
  const managed = appRuntime().managed;
  const switchable = canManageLibraries() && managed;
  const allowedRoots = core.resolveAllowedRoots(process.env, process.platform);
  const roots = await core.listAllowedRootInfos(allowedRoots);
  const defaultParent = core.defaultLibraryParentDir(process.env, process.platform);
  const registryDir = core.resolveRegistryDir(process.env, process.platform);
  const desktop = env('ATLAS_LOCAL_DESKTOP') === '1';
  return {
    mode,
    managed,
    storageLocation: 'server' as const,
    canReveal: canRevealFolder(),
    canPickFolder: desktop,
    canBrowse: true,
    canCreate: true,
    canSwitch: switchable,
    canOpen: true,
    canDemo: true,
    canRenameRecent: true,
    canRemoveRecent: true,
    canRelocateRecent: true,
    canUseForProject: true,
    allowedRoots: roots,
    defaultParentDir: defaultParent,
    defaultBrowseDir: roots.find((root: {available: boolean}) => root.available)?.path || defaultParent,
    registryDir,
    librariesRoot: env('ATLAS_LIBRARIES_ROOT') || null,
  };
}

export function runtimeIdentity() {
  const mode = libraryMode();
  if (mode === 'manager') {
    return {
      runtimeId: env('ATLAS_RUNTIME_ID') || 'dev',
      libraryId: 'manager',
      libraryRoot: null as string | null,
      mode,
    };
  }
  const dataDir = env('DATA_DIR');
  const libraryRoot = dataDir ? path.resolve(dataDir) : DATA_ROOT;
  return {
    runtimeId: env('ATLAS_RUNTIME_ID') || 'dev',
    libraryId: env('ATLAS_LIBRARY_ID') || identityFromRoot(libraryRoot),
    libraryRoot,
    mode,
  };
}
