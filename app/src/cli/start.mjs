import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {AUTO_PORT_LAST, DEFAULT_PORT} from './options.mjs';
import {prepareManagedUpdate, markUpdateReady} from './managed-update.mjs';
import {libraryIdentityKey, rememberSuccessfulOpen} from '../library/user-registry.mjs';

export async function assertPortAvailable(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', error => reject(Error(`Cannot listen on 127.0.0.1:${port} (${error.code}). Choose another --port.`)));
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise(resolve => server.close(resolve));
}

/**
 * Pick a listen port. Explicit `--port` never falls back.
 * Without `--port`, try DEFAULT_PORT through AUTO_PORT_LAST.
 */
export async function resolveListenPort({port, portExplicit}, log = console.log) {
  if (portExplicit) {
    await assertPortAvailable(port);
    return port;
  }
  const first = DEFAULT_PORT;
  const last = AUTO_PORT_LAST;
  for (let candidate = first; candidate <= last; candidate++) {
    try {
      await assertPortAvailable(candidate);
      if (candidate !== first) log(`[Atlas Docs] Port ${first} busy; using ${candidate}`);
      return candidate;
    } catch {
      // try next in range
    }
  }
  throw Error(`Cannot listen on 127.0.0.1:${first}-${last}. Choose another --port.`);
}

export function openBrowser(url) {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: 'ignore', windowsHide: true});
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve() : reject(Error(`Browser opener exited with ${code}`))));
  });
}

/**
 * Run one child runtime until exit. Handles update and library-switch IPC.
 * @returns {{update?: object, switch?: object, code: number|null, stopping: boolean}}
 */
export async function startServer(packageRoot, options) {
  const url = `http://127.0.0.1:${options.port}`;
  const runtimeId = options.runtimeId || randomUUID();
  const mode = options.libraryMode || (options.dataDir ? 'library' : 'manager');
  const libraryId = options.dataDir ? libraryIdentityKey(options.dataDir) : 'manager';
  const child = spawn(process.execPath, [options.runtimeEntry || path.join(packageRoot, 'runtime/server.js')], {
    cwd: options.runtimeCwd || path.join(packageRoot, 'runtime'),
    env: {
      ...process.env,
      ...(options.envExtra || {}),
      NODE_ENV: options.development ? 'development' : 'production',
      ...(options.dataDir ? {DATA_DIR: options.dataDir} : {}),
      HOSTNAME: '127.0.0.1',
      PORT: String(options.port),
      ATLAS_RUNTIME_ID: runtimeId,
      ATLAS_LIBRARY_ID: libraryId,
      ATLAS_LIBRARY_MODE: mode,
      ATLAS_LIBRARY_MANAGER: '1',
      ...(options.switchError ? {ATLAS_LIBRARY_SWITCH_ERROR: options.switchError} : {ATLAS_LIBRARY_SWITCH_ERROR: ''}),
    },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    windowsHide: true,
  });
  let stopping = false;
  let busy = false;
  let updateJob = null;
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
    } else {
      child.kill('SIGTERM');
    }
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 12000).unref?.();
  };
  const message = value => {
    if (value === 'atlas:stop') stop();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('message', message);

  const ended = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code));
  });

  const updateMessage = async msg => {
    if (msg?.type !== 'atlas:update') return;
    const reply = value => {
      if (child.connected) child.send({type: 'atlas:update-ack', requestId: msg.requestId, ...value});
    };
    if (busy || stopping) {
      reply({error: 'An update or library switch is already in progress.'});
      return;
    }
    busy = true;
    try {
      updateJob = await prepareManagedUpdate(packageRoot, options.appVersion, options.updateStateFile);
      if (stopping) {
        updateJob = null;
        reply({error: 'Shutdown is already in progress.'});
        return;
      }
      reply({id: updateJob.id});
      setTimeout(stop, 500);
    } catch (error) {
      busy = false;
      reply({error: error.message});
    }
  };

  const switchMessage = async msg => {
    if (msg?.type !== 'atlas:library-switch') return;
    const reply = value => {
      if (child.connected) child.send({type: 'atlas:library-switch-ack', requestId: msg.requestId, ...value});
    };
    if (busy || stopping) {
      reply({error: 'An update or library switch is already in progress.'});
      return;
    }
    if (!msg.path || typeof msg.path !== 'string') {
      reply({error: 'Library path is required.'});
      return;
    }
    busy = true;
    switchJob = {
      id: randomUUID(),
      action: msg.action || 'open',
      path: msg.path,
      displayName: typeof msg.displayName === 'string' ? msg.displayName : undefined,
      previousDataDir: options.dataDir || null,
      previousMode: mode,
    };
    reply({id: switchJob.id});
    setTimeout(stop, 200);
  };

  child.on('message', updateMessage);
  child.on('message', switchMessage);

  let exited = false;
  let failure;
  ended.then(
    () => {
      exited = true;
    },
    error => {
      exited = true;
      failure = error;
    },
  );

  try {
    let ready = false;
    for (let i = 0; i < 300 && !exited && !stopping; i++) {
      try {
        const health = await fetch(`${url}/api/health`, {signal: AbortSignal.timeout(5000)});
        if (!health.ok) {
          await delay(200);
          continue;
        }
        const readyResp = await fetch(`${url}/api/libraries/ready`, {signal: AbortSignal.timeout(5000)});
        if (!readyResp.ok) {
          await delay(200);
          continue;
        }
        const payload = await readyResp.json();
        if (mode === 'manager') {
          if (payload.ok && payload.mode === 'manager') {
            ready = true;
            break;
          }
        } else if (payload.ok && payload.libraryId === libraryId) {
          if (!options.dataDir || !payload.root) {
            ready = true;
            break;
          }
          const a = libraryIdentityKey(payload.root);
          const b = libraryIdentityKey(options.dataDir);
          if (a === b) {
            ready = true;
            break;
          }
        }
      } catch {
        // retry
      }
      await delay(200);
    }
    if (stopping) {
      const code = await ended;
      if (code !== 0 && code !== null) drainOk = false;
      return updateJob
        ? {update: updateJob, code, stopping: true, drainOk}
        : switchJob
          ? {switch: switchJob, code, stopping: true, drainOk}
          : {code, stopping: true, drainOk};
    }
    if (!ready) {
      stop();
      await ended;
      throw failure || Error('Server did not become ready. See the error above.');
    }

    process.stdout.write(`[Atlas Docs] Ready: ${url}\n`);
    await markUpdateReady(options.updateStateFile, options.appVersion);
    if (options.dataDir && options.rememberOpen !== false) {
      try {
        await rememberSuccessfulOpen(options.dataDir, {displayName: options.displayName});
      } catch (error) {
        console.warn(`[Atlas Docs] Could not update recent libraries (${error.message}).`);
      }
    }
    if (options.open) {
      openBrowser(url).catch(error =>
        console.warn(`[Atlas Docs] Could not open browser (${error.message}). Open ${url} manually.`),
      );
    }
    // Only open the browser on the first ready in a supervisor loop.
    options.open = false;

    const code = await ended;
    if (code !== 0 && code !== null) drainOk = false;
    if (updateJob) return {update: updateJob, code, stopping, drainOk};
    if (switchJob) return {switch: switchJob, code, stopping, drainOk};
    if (!stopping && code !== 0) throw Error(`Server exited with code ${code}`);
    return {code, stopping, drainOk};
  } finally {
    stop();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    process.off('message', message);
    child.off('message', updateMessage);
    child.off('message', switchMessage);
  }
}
