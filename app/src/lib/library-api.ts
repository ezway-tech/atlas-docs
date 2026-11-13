import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import type {NextRequest} from 'next/server';
import {AppError} from './http';
import {loadCore} from './load-core';
import {appRuntime} from './app-runtime';
import {libraryCapabilities, libraryMode, runtimeIdentity} from './library-capabilities';
import {assertLocalAppRequest, runtimeHeaderMismatch} from './local-request';
import {ensureLibraryPrepared} from './runtime-prepare';

function json(x: unknown, status = 200) {
  return Response.json(x, {
    status,
    headers: {'Cache-Control': 'no-store'},
  });
}

async function loadSeedDemo() {
  const {access} = await import('node:fs/promises');
  const packageRoot = process.env.ATLAS_PACKAGE_ROOT;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.ATLAS_SEED_DEMO,
    packageRoot ? path.join(packageRoot, 'demo', 'seed-demo.mjs') : null,
    path.resolve(process.cwd(), 'scripts/seed-demo.mjs'),
    path.resolve(process.cwd(), '../scripts/setup/seed-demo.mjs'),
    path.resolve(here, '../../../scripts/setup/seed-demo.mjs'),
  ].filter(Boolean) as string[];
  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      const href = pathToFileURL(candidate).href;
      return await import(/* webpackIgnore: true */ href);
    } catch (error) {
      errors.push(`${candidate}: ${(error as Error).message}`);
    }
  }
  throw new Error(`Demo seed module not found. Tried:\n${errors.join('\n')}`);
}

function requireManage(req: NextRequest) {
  if (!assertLocalAppRequest(req, 'x-atlas-library-api', '1')) {
    throw new AppError('errors.library.forbidden', 403);
  }
}

function requireRuntimeSession(req: NextRequest) {
  if (!process.env.ATLAS_RUNTIME_ID || !process.env.ATLAS_LIBRARY_ID) return;
  const stale = runtimeHeaderMismatch(req);
  if (!stale) return;
  const err = new AppError('errors.library.staleRuntime', 409);
  err.message =
    stale === 'missing'
      ? 'Missing runtime session headers. Reload the page.'
      : stale.message;
  throw err;
}

async function requestManagedSwitch(payload: Record<string, unknown>) {
  const send = process.send;
  if (!send || !process.connected) throw Error('CLI supervisor is unavailable');
  const {beginShutdown, cancelShutdown, drainLibraryWrites} = await import('./store');
  // Finish admitted writes before asking the parent to stop this runtime.
  beginShutdown();
  const drained = await drainLibraryWrites({timeoutMs: 8000});
  if (!drained.ok) {
    cancelShutdown();
    throw Error('Library is still saving. Switch cancelled; keep this tab open and try again.');
  }
  return new Promise<{id: string}>((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      cleanup();
      reject(Error('Library supervisor did not respond'));
    }, 15_000);
    const cleanup = () => {
      clearTimeout(timer);
      process.off('message', receive);
    };
    const receive = (message: unknown) => {
      const value = message as {type?: string; requestId?: string; id?: string; error?: string};
      if (value?.type !== 'atlas:library-switch-ack' || value.requestId !== id) return;
      cleanup();
      if (value.error) {
        // Parent refused; reopen admits so the user can keep working.
        cancelShutdown();
        reject(Error(value.error));
      } else resolve({id: value.id || id});
    };
    process.on('message', receive);
    send.call(process, {type: 'atlas:library-switch', requestId: id, ...payload}, (error: Error | null) => {
      if (error) {
        cleanup();
        cancelShutdown();
        reject(error);
      }
    });
  });
}

async function entryStatus(core: Awaited<ReturnType<typeof loadCore>>, libraryRoot: string) {
  const inspection = await core.inspectLibrary(libraryRoot);
  let lock = null;
  try {
    lock = await core.readLibraryLock(libraryRoot);
  } catch {
    lock = null;
  }
  const stale = lock ? core.isLockStale(lock) : false;
  let status: 'available' | 'missing' | 'in_use' | 'unavailable' | 'newer' | 'unknown' | 'empty' | 'legacy' | 'interrupted' =
    'unavailable';
  if (inspection.state === 'missing') status = 'missing';
  else if (inspection.state === 'empty') status = 'empty';
  else if (inspection.state === 'newer') status = 'newer';
  else if (inspection.state === 'unknown') status = 'unknown';
  else if (inspection.state === 'legacy') status = 'legacy';
  else if (inspection.state === 'interrupted') status = 'interrupted';
  else if (inspection.state === 'ready') status = 'available';
  if (lock && !stale) status = 'in_use';
  return {inspection, lock: lock && !stale ? {pid: lock.pid, purpose: lock.purpose} : null, status, stale};
}

let libraryOperationBusy = false;
export async function handleLibraryApi(req: NextRequest, seg: string[], method: string) {
  const exclusive = method === 'POST' && ['open', 'create', 'demo', 'import-folder'].includes(seg[1]);
  if (!exclusive) return handleLibraryRequest(req, seg, method);
  requireManage(req);
  requireRuntimeSession(req);
  const {isShuttingDown} = await import('./store');
  if (libraryOperationBusy || isShuttingDown()) return json({error: 'A source operation is already in progress.'}, 409);
  libraryOperationBusy = true;
  try {return await handleLibraryRequest(req, seg, method);}
  finally {libraryOperationBusy = false;}
}

async function prepareSource<T>(run: () => Promise<T>) {
  const {withLibraryLock} = await import('./store');
  return withLibraryLock(run);
}

async function handleLibraryRequest(req: NextRequest, seg: string[], method: string) {
  const core = await loadCore();
  const caps = await libraryCapabilities();
  const identity = runtimeIdentity();
  const body = () => req.json();

  if (seg[1] === 'capabilities' && method === 'GET') {
    return json({...caps, ...identity, switchError: process.env.ATLAS_LIBRARY_SWITCH_ERROR || null});
  }

  if (seg[1] === 'session' && method === 'GET') {
    let displayName: string | null = null;
    let libraryRoot = identity.libraryRoot;
    if (libraryRoot && libraryMode() !== 'manager') {
      const reg = await core.loadUserRegistrySafe(process.env);
      const key = core.libraryIdentityKey(libraryRoot);
      displayName = reg.libraries.find((l: {identityKey: string}) => l.identityKey === key)?.displayName || path.basename(libraryRoot);
    }
    return json({
      ...identity,
      displayName,
      appVersion: appRuntime().version,
      switchError: process.env.ATLAS_LIBRARY_SWITCH_ERROR || null,
    });
  }

  if (seg[1] === 'ready' && method === 'GET') {
    if (libraryMode() === 'manager') {
      return json({ok: true, mode: 'manager', libraryId: 'manager', root: null});
    }
    const prepared = await ensureLibraryPrepared();
    return json({
      ok: true,
      mode: libraryMode(),
      libraryId: identity.libraryId,
      root: prepared.root || identity.libraryRoot,
    });
  }

  // Remaining library routes require a matching runtime session when ids are published.
  requireRuntimeSession(req);

  if (seg[1] === 'reveal' && method === 'POST') {
    requireManage(req);
    if (!caps.canReveal || !identity.libraryRoot) throw new AppError('errors.library.forbidden', 403);
    // The client cannot supply a path or command. Only reveal this process's active library.
    const {spawn} = await import('node:child_process');
    const root = await core.assertWithinAllowedRoots(identity.libraryRoot, [identity.libraryRoot], {mustExist: true});
    const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, [root], {shell: false, windowsHide: true, stdio: 'ignore'});
      child.once('error', reject);
      child.once('spawn', () => {child.unref(); resolve();});
    });
    return json({ok: true});
  }

  if (['preview-import', 'import-folder'].includes(seg[1]) && method === 'POST') {
    requireManage(req);
    if (!caps.canCreate || !caps.canSwitch) throw new AppError('errors.library.fixedMode', 409);
    const o = await body();
    const options = {source: String(o.source || ''), name: String(o.name || ''),
      parentDir: o.parentDir ? String(o.parentDir) : undefined,
      allowedRoots: core.resolveAllowedRoots(process.env, process.platform), fingerprint: String(o.fingerprint || '')};
    if (seg[1] === 'preview-import') return json(await core.previewFolderImport(options));
    const created: {root: string; displayName: string} = await prepareSource(() => core.importFolderCopy(options));
    const libraryId = core.libraryIdentityKey(created.root);
    const result = await requestManagedSwitch({action: 'open', path: created.root, displayName: created.displayName});
    return json({...created, libraryId, switch: result}, 202);
  }

  if (seg[1] === 'recent' && method === 'GET') {
    requireManage(req);
    if (!caps.canBrowse && libraryMode() === 'fixed') {
      return json({libraries: [], capabilities: caps});
    }
    const reg = await core.loadUserRegistrySafe(process.env);
    const currentKey = identity.libraryRoot ? core.libraryIdentityKey(identity.libraryRoot) : null;
    const libraries = [];
    for (const entry of reg.libraries) {
      const status = await entryStatus(core, entry.path);
      libraries.push({
        id: entry.id,
        path: entry.path,
        displayName: entry.displayName,
        lastOpenedAt: entry.lastOpenedAt,
        current: currentKey === entry.identityKey,
        ...status,
      });
    }
    return json({
      libraries,
      recentId: reg.recentId,
      registryFile: reg.file,
      recovery: reg.recovery,
      capabilities: caps,
    });
  }

  if (seg[1] === 'browse' && method === 'GET') {
    requireManage(req);
    if (!caps.canBrowse) throw new AppError('errors.library.fixedMode', 409);
    const target = req.nextUrl.searchParams.get('path') || caps.defaultParentDir;
    const allowed = core.resolveAllowedRoots(process.env, process.platform);
    return json(await core.listBrowsableDir(target, allowed));
  }

  if (seg[1] === 'inspect' && method === 'POST') {
    requireManage(req);
    if (!caps.canOpen) throw new AppError('errors.library.fixedMode', 409);
    const o = await body();
    const allowed = core.resolveAllowedRoots(process.env, process.platform);
    return json(await core.inspectOpenTarget(String(o.path || ''), allowed));
  }

  if (seg[1] === 'preview-create' && method === 'POST') {
    requireManage(req);
    if (!caps.canCreate) throw new AppError('errors.library.fixedMode', 409);
    const o = await body();
    const allowed = core.resolveAllowedRoots(process.env, process.platform);
    return json(
      await core.previewCreateLibrary({
        name: String(o.name || ''),
        parentDir: o.parentDir ? String(o.parentDir) : undefined,
        allowedRoots: allowed,
      }),
    );
  }

  if (seg[1] === 'create' && method === 'POST') {
    requireManage(req);
    if (!caps.canCreate || !caps.canSwitch) throw new AppError('errors.library.fixedMode', 409);
    const o = await body();
    const allowed = core.resolveAllowedRoots(process.env, process.platform);
    const created: {root: string; displayName: string} = await prepareSource(() => core.createLibrary({
      name: String(o.name || ''),
      parentDir: o.parentDir ? String(o.parentDir) : undefined,
      allowedRoots: allowed,
    }));
    const libraryId = core.libraryIdentityKey(created.root);
    const result = await requestManagedSwitch({
      action: 'open',
      path: created.root,
      displayName: created.displayName,
    });
    return json({...created, libraryId, switch: result}, 202);
  }

  if (seg[1] === 'open' && method === 'POST') {
    requireManage(req);
    if (!caps.canOpen || !caps.canSwitch) throw new AppError('errors.library.fixedMode', 409);
    const o = await body();
    const allowed = core.resolveAllowedRoots(process.env, process.platform);
    const inspected = await core.inspectOpenTarget(String(o.path || ''), allowed);
    if (!inspected.openable) {
      return json({error: inspected.error, inspection: inspected.inspection}, 409);
    }
    // Re-check lock at switch time in the supervisor; preflight here for clearer errors.
    const status = await entryStatus(core, inspected.root);
    if (status.status === 'in_use' && identity.libraryRoot && core.libraryIdentityKey(identity.libraryRoot) !== core.libraryIdentityKey(inspected.root)) {
      return json({error: {code: 'library.inUse', message: `Library is already open in another Atlas Docs process: ${inspected.root}`}}, 409);
    }
    const libraryId = core.libraryIdentityKey(inspected.root);
    const result = await requestManagedSwitch({
      action: 'open',
      path: inspected.root,
      displayName: typeof o.displayName === 'string' ? o.displayName : undefined,
    });
    return json({root: inspected.root, libraryId, inspection: inspected.inspection, switch: result}, 202);
  }

  if (seg[1] === 'demo' && method === 'POST') {
    requireManage(req);
    if (!caps.canDemo || !caps.canSwitch) throw new AppError('errors.library.fixedMode', 409);
    const allowed = core.resolveAllowedRoots(process.env, process.platform);
    const seed = await loadSeedDemo();
    const dest: {path: string; displayName: string} = await prepareSource(() => core.ensureDemoLibrary({allowedRoots: allowed, seed: seed.seedDemo}));
    const libraryId = core.libraryIdentityKey(dest.path);
    const result = await requestManagedSwitch({
      action: 'open',
      path: dest.path,
      displayName: dest.displayName,
    });
    return json({root: dest.path, libraryId, displayName: dest.displayName, demo: true, switch: result}, 202);
  }

  if (seg[1] === 'rename' && method === 'POST') {
    requireManage(req);
    if (!caps.canRenameRecent) throw new AppError('errors.library.fixedMode', 409);
    const o = await body();
    const reg = await core.renameLibraryEntry(String(o.id || ''), String(o.displayName || ''));
    return json({ok: true, libraries: reg.libraries});
  }

  if (seg[1] === 'remove' && method === 'POST') {
    requireManage(req);
    if (!caps.canRemoveRecent) throw new AppError('errors.library.fixedMode', 409);
    const o = await body();
    const reg = await core.removeLibraryEntry(String(o.id || ''));
    return json({ok: true, libraries: reg.libraries, recentId: reg.recentId});
  }

  if (seg[1] === 'use-for-project' && method === 'POST') {
    requireManage(req);
    if (!caps.canUseForProject) throw new AppError('errors.library.fixedMode', 409);
    const o = await body();
    const launchCwd = process.env.ATLAS_LAUNCH_CWD;
    if (!launchCwd || !String(launchCwd).trim()) {
      const err = new AppError('errors.library.fixedMode', 409);
      err.message = 'Project config can only be written for the directory that launched Atlas Docs (ATLAS_LAUNCH_CWD).';
      throw err;
    }
    const cwd = path.resolve(String(launchCwd).trim());
    const dataDir = String(o.path || identity.libraryRoot || '');
    if (!dataDir) throw new AppError('errors.library.required', 409);
    const allowed = core.resolveAllowedRoots(process.env, process.platform);
    await core.assertWithinAllowedRoots(dataDir, allowed, {mustExist: true});
    const written = await core.writeProjectConfig(cwd, dataDir);
    return json({ok: true, configPath: written.configPath, dataDir: written.dataDir});
  }

  return new Response('Not found', {status: 404});
}
