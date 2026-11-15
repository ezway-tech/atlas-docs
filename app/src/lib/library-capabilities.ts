import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadCore} from './load-core';
import {appRuntime} from './app-runtime';
import {DATA_ROOT} from './data-root';

export type LibraryMode = 'manager' | 'library' | 'fixed';

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
  if (mode === 'fixed') return 'fixed';
  if (mode === 'library') return 'library';
  // Source/Docker without manager: fixed to DATA_DIR / default data root.
  if (env('ATLAS_LIBRARY_MANAGER') === '1') return 'library';
  return 'fixed';
}

export function isManagerMode() {
  return libraryMode() === 'manager';
}

export function canManageLibraries() {
  const mode = libraryMode();
  if (mode === 'fixed') return false;
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
    canReveal: desktop,
    canPickFolder: desktop && mode !== 'fixed',
    canBrowse: mode !== 'fixed',
    canCreate: mode !== 'fixed',
    canSwitch: switchable,
    canOpen: mode !== 'fixed',
    canDemo: mode !== 'fixed',
    canRenameRecent: mode !== 'fixed',
    canRemoveRecent: mode !== 'fixed',
    canRelocateRecent: mode !== 'fixed',
    canUseForProject: mode !== 'fixed',
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
