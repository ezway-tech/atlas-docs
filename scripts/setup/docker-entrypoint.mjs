/**
 * Docker entrypoint: keep a long-lived supervisor so library switches do not
 * require restarting the container. All installations use Projects.
 */
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const coreCandidates = [
  process.env.ATLAS_CORE_PATH,
  path.join(appRoot, 'core/index.mjs'),
  path.resolve(here, '../../app/src/library/index.mjs'),
].filter(Boolean);

let core;
for (const candidate of coreCandidates) {
  try {
    core = await import(pathToFileURL(candidate).href);
    break;
  } catch {
    // try next
  }
}
if (!core) throw new Error('Atlas Docs core not found for Docker entrypoint');

if (process.env.DATA_DIR || process.env.ATLAS_LIBRARY_MODE === 'fixed') throw Error('Atlas Docs 6 uses Projects. Remove DATA_DIR / ATLAS_LIBRARY_MODE=fixed. Mount existing data under /libraries/<project> and open it from Projects. No data was changed.');
const port = process.env.PORT || '3000';
const host = process.env.HOSTNAME || '0.0.0.0';

async function prepare(libraryRoot) {
  const migrateYes = process.env.ATLAS_DOCS_MIGRATE_YES === '1' || process.env.ATLAS_DOCS_MIGRATE_YES === 'true';
  const backupParentDir = process.env.ATLAS_DOCS_UPGRADE_BACKUP_DIR
    ? core.canonicalize(path.resolve(process.env.ATLAS_DOCS_UPGRADE_BACKUP_DIR))
    : undefined;
  await core.prepareLibrary({
    libraryRoot,
    appVersion: process.env.ATLAS_APP_VERSION || '',
    allowInit: true,
    allowMigrate: true,
    autoConfirmMigrate: migrateYes,
    backupParentDir,
    agentKitPath: process.env.ATLAS_AGENT_KIT || null,
    holdLock: false,
    log: console.log,
  });
}

async function waitReady(url, {dataDir, libraryId, libraryMode}) {
  for (let i = 0; i < 300; i++) {
    try {
      const health = await fetch(`${url}/api/health`, {signal: AbortSignal.timeout(3000)});
      if (!health.ok) {
        await delay(200);
        continue;
      }
      const readyResp = await fetch(`${url}/api/libraries/ready`, {signal: AbortSignal.timeout(5000)});
      if (!readyResp.ok) {
        await delay(200);
        continue;
      }
      const ready = await readyResp.json();
      if (libraryMode === 'manager') {
        if (ready.ok && ready.mode === 'manager') return ready;
      } else if (ready.ok && ready.libraryId === libraryId) {
        if (!dataDir || !ready.root) return ready;
        const a = core.canonicalize(ready.root).replace(/\\/g, '/').toLowerCase();
        const b = core.canonicalize(dataDir).replace(/\\/g, '/').toLowerCase();
        if (a === b) return ready;
      }
    } catch {
      // retry
    }
    await delay(200);
  }
  throw new Error('Docker runtime did not become ready');
}

async function runChild({dataDir, libraryMode, switchError}) {
  const runtimeId = randomUUID();
  const libraryId = dataDir ? core.libraryIdentityKey(dataDir) : 'manager';
  const childEnv = core.applyLibraryDataDir(
    {
      ...process.env,
      HOSTNAME: host,
      PORT: String(port),
      ATLAS_RUNTIME_ID: runtimeId,
      ATLAS_LIBRARY_ID: libraryId,
      ATLAS_LIBRARY_MODE: libraryMode,
      ATLAS_LIBRARY_MANAGER: '1',
      ATLAS_CLI_MANAGED: '1',
      ATLAS_LIBRARY_SWITCH_ERROR: switchError || '',
    },
    dataDir,
  );
  const child = spawn(process.execPath, [path.join(appRoot, 'server.js')], {
    cwd: appRoot,
    env: childEnv,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });

  let stopping = false;
  let busy = false;
  let switchJob = null;
  let drainOk = true;
  const stop = () => {
    stopping = true;
    if (child.exitCode !== null) return;
    const onAck = msg => {
      if (msg?.type === 'atlas:shutdown-ack') {
        drainOk = !!msg.ok;
        child.off('message', onAck);
      }
    };
    child.on('message', onAck);
    if (child.connected) {
      try {
        child.send('atlas:shutdown');
      } catch {
        child.kill('SIGTERM');
      }
    } else child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 12000).unref?.();
  };
  const onSignal = () => stop();
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  child.on('message', async msg => {
    if (msg?.type !== 'atlas:library-switch') return;
    const reply = value => {
      if (child.connected) child.send({type: 'atlas:library-switch-ack', requestId: msg.requestId, ...value});
    };
    if (busy || stopping) {
      reply({error: 'A library switch is already in progress.'});
      return;
    }
    busy = true;
    switchJob = {path: msg.path, displayName: msg.displayName, action: msg.action || 'open'};
    reply({id: randomUUID()});
    setTimeout(stop, 200);
  });

  const ended = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code));
  });

  const url = `http://127.0.0.1:${port}`;
  try {
    if (!stopping && child.exitCode === null) {
      await waitReady(url, {dataDir, libraryId, libraryMode});
    }
  } catch (error) {
    if (!stopping) {
      stop();
      await ended;
      throw error;
    }
  }
  if (dataDir && !stopping) {
    try {
      await core.rememberSuccessfulOpen(dataDir, {displayName: undefined});
    } catch (error) {
      console.warn('[Atlas Docs] Could not update recent libraries:', error.message);
    }
  }
  console.log(`[Atlas Docs] Ready: ${url} (${libraryMode}${dataDir ? ` ${dataDir}` : ''})`);
  const code = await ended;
  if (code !== 0 && code !== null) drainOk = false;
  process.off('SIGINT', onSignal);
  process.off('SIGTERM', onSignal);
  return {code, switch: switchJob, stopping, drainOk};
}

// Projects startup uses the same durable Example and registry as npm/source.
let current = {dataDir: null, mode: 'manager', switchError: null};
try {
  const startup = await core.resolveManagedStartupProject({env: process.env, packageRoot: appRoot, openLibrary: core.resolveManagerInitialLibrary(process.env)});
  current = {dataDir: startup.root, mode: 'library', switchError: null};
  await prepare(current.dataDir);
} catch (error) {
  if (process.env.ATLAS_OPEN_LIBRARY) throw error;
  current = {dataDir: null, mode: 'manager', switchError: error.message};
  console.error('[Atlas Docs] Opening Projects:', error.message);
}

for (;;) {
  let result;
  try {
    result = await runChild({
      dataDir: current.dataDir,
      libraryMode: current.mode,
      switchError: current.switchError,
    });
  } catch (error) {
    console.error('[Atlas Docs] Runtime failed:', error.message);
    if (current.mode === 'library' && current.dataDir) {
      current = {dataDir: null, mode: 'manager', switchError: error.message};
      continue;
    }
    throw error;
  }
  if (!result.switch) {
    process.exit(result.code || 0);
  }
  const previous = {...current};
  const target = core.canonicalize(result.switch.path);
  try {
    if (result.drainOk === false) {
      throw new Error('Previous library did not finish saving before switch. Switch cancelled.');
    }
    const allowed = core.resolveAllowedRoots(process.env);
    await core.assertWithinAllowedRoots(target, allowed, {mustExist: false});
    const inspected = await core.inspectOpenTarget(target, allowed);
    if (!inspected.openable) throw new Error(inspected.error?.message || `Cannot open ${target}`);
    await prepare(target);
    current = {dataDir: target, mode: 'library', switchError: null};
    console.log('[Atlas Docs] Opening library:', target);
  } catch (error) {
    console.error('[Atlas Docs] Could not open library:', error.message);
    if (previous.mode === 'library' && previous.dataDir) {
      try {
        await prepare(previous.dataDir);
        current = {...previous, switchError: error.message};
        continue;
      } catch (restoreError) {
        console.error('[Atlas Docs] Could not restore previous library:', restoreError.message);
      }
    }
    current = {dataDir: null, mode: 'manager', switchError: error.message};
  }
}
