import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access, readFile} from 'node:fs/promises';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {npmArgs} from './process.mjs';

export async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}

export async function sha256File(file) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(file)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return hash.digest('hex');
}

/** Verify `hash  filename` sidecar next to the artifact (or explicit checksum path). */
export async function assertTarballChecksum(tarball, checksumFile) {
  await access(tarball);
  await access(checksumFile);
  const expectedLine = (await readFile(checksumFile, 'utf8')).trim().split(/\s+/)[0].toLowerCase();
  const actual = await sha256File(tarball);
  assert.equal(actual, expectedLine, `Checksum mismatch for ${tarball}`);
  return actual;
}

export function createServerTracker() {
  const children = new Set();
  return {
    children,
    async start(cli, {cwd, env, args = [], extraEnv = {}, viaNpx = false, npxPrefix} = {}) {
      const p = await freePort();
      const command = viaNpx
        ? npmArgs(['exec', '--offline', '--prefix', npxPrefix, '--', 'atlas-docs'])
        : [cli];
      const child = spawn(process.execPath, [...command, '--no-open', '--port', String(p), ...args], {
        cwd,
        env: {...env, ...extraEnv},
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
        detached: viaNpx && process.platform !== 'win32',
      });
      child.atlasViaNpx = viaNpx;
      children.add(child);
      let logs = '';
      child.stdout.on('data', data => {
        logs += data;
      });
      child.stderr.on('data', data => {
        logs += data;
      });
      child.on('error', error => {
        logs += error.message;
      });
      for (let i = 0; i < 300; i++) {
        if (child.exitCode !== null) throw Error(logs || `CLI exited with ${child.exitCode}`);
        if (logs.includes('[Atlas Docs] Ready:')) {
          return {child, url: `http://127.0.0.1:${p}`, p, viaNpx, logs};
        }
        await delay(200);
      }
      throw Error(`Startup timeout: ${logs}`);
    },
    async stop(server) {
      const child = server.child;
      if (child.exitCode === null) {
        const exited = new Promise(resolve => child.once('exit', resolve));
        if (server.viaNpx) {
          if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true});
          else process.kill(-child.pid, 'SIGINT');
        } else if (process.platform === 'win32') {
          try {
            child.send('atlas:stop');
          } catch {
            spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true});
          }
        } else {
          child.kill('SIGINT');
        }
        let timer;
        try {
          await Promise.race([
            exited,
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(Error('Shutdown timeout')), 20000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
      children.delete(child);
      await assert.rejects(() => fetch(server.url + '/api/health', {signal: AbortSignal.timeout(1000)}));
    },
    async cleanup() {
      for (const child of children) {
        if (child.exitCode !== null) continue;
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true});
        else if (child.atlasViaNpx) process.kill(-child.pid, 'SIGTERM');
        else child.kill();
      }
      if (children.size) await delay(1500);
      children.clear();
    },
  };
}

export async function json(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: {'Content-Type': 'application/json'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
