import {spawn} from 'node:child_process';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {AUTO_PORT_LAST, DEFAULT_PORT} from './options.mjs';

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
    child.once('exit', code => code === 0 ? resolve() : reject(Error(`Browser opener exited with ${code}`)));
  });
}

export async function startServer(packageRoot, options) {
  const url = `http://127.0.0.1:${options.port}`;
  const child = spawn(process.execPath, [path.join(packageRoot, 'runtime/server.js')], {
    cwd: path.join(packageRoot, 'runtime'),
    env: {
      ...process.env,
      ...(options.envExtra || {}),
      NODE_ENV: 'production',
      DATA_DIR: options.dataDir,
      HOSTNAME: '127.0.0.1',
      PORT: String(options.port),
    },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true,
  });
  // A private IPC message allows shutdown tests on Windows, where kill(SIGINT)
  // terminates a process instead of delivering a console Ctrl+C event.
  let stopping = false;
  const stop = () => {
    stopping = true;
    if (child.exitCode !== null) return;
    // Prefer a graceful IPC shutdown so lock releaseSync runs on Windows,
    // where process.kill(SIGTERM) does not deliver a catchable signal.
    if (child.connected) {
      try { child.send('atlas:shutdown'); } catch { child.kill('SIGTERM'); }
    } else {
      child.kill('SIGTERM');
    }
    setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 5000).unref?.();
  };
  const message = value => { if (value === 'atlas:stop') stop(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('message', message);
  const ended = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)); });
  // Attach immediately, including while waiting for readiness.
  let exited = false, failure;
  ended.then(() => { exited = true; }, error => { exited = true; failure = error; });
  try {
    let ready = false;
    for (let i = 0; i < 300 && !exited && !stopping; i++) {
      try {
        const response = await fetch(`${url}/api/health`, {signal: AbortSignal.timeout(5000)});
        if (response.ok && !exited) { ready = true; break; }
      } catch {}
      await delay(200);
    }
    if (stopping) { await ended; return; }
    if (!ready) { stop(); await ended; throw failure || Error('Server did not become ready. See the error above.'); }
    // Write+flush so piped CI capture on Windows sees readiness promptly.
    process.stdout.write(`[Atlas Docs] Ready: ${url}\n`);
    if (options.open) openBrowser(url).catch(error => console.warn(`[Atlas Docs] Could not open browser (${error.message}). Open ${url} manually.`));
    const code = await ended;
    if (!stopping && code !== 0) throw Error(`Server exited with code ${code}`);
  } finally {
    stop();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    process.off('message', message);
  }
}
