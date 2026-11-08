import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access, readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {npmArgs} from '../../build/process.mjs';

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
      for (let i = 0; i < 450; i++) {
        if (child.exitCode !== null) throw Error(logs || `CLI exited with ${child.exitCode}`);
        if (logs.includes('[Atlas Docs] Ready:')) {
          return {child, url: `http://127.0.0.1:${p}`, p, viaNpx, logs};
        }
        // Windows CI may buffer CLI stdout; /api/health is the real readiness signal.
        try {
          const response = await fetch(`http://127.0.0.1:${p}/api/health`, {signal: AbortSignal.timeout(2000)});
          if (response.ok) return {child, url: `http://127.0.0.1:${p}`, p, viaNpx, logs};
        } catch {}
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

async function walkRelativeFiles(root, relative = '') {
  const dir = path.join(root, relative);
  let entries;
  try {
    entries = await readdir(dir, {withFileTypes: true});
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const out = [];
  for (const entry of entries) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await walkRelativeFiles(root, rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/**
 * Checksums for data that must survive upgrade/recovery.
 * db.json is hashed without schemaVersion so legacy ↔ v1 compares equal for user payload.
 */
export async function contentChecksumMap(libraryRoot) {
  const root = path.resolve(libraryRoot);
  const map = {};
  const includeRoots = ['docs', 'uploads', 'history'];
  for (const top of includeRoots) {
    for (const rel of await walkRelativeFiles(root, top)) {
      map[rel] = await sha256File(path.join(root, rel));
    }
  }
  for (const name of ['AGENTS.md']) {
    try {
      await access(path.join(root, name));
      map[name] = await sha256File(path.join(root, name));
    } catch {}
  }
  // Personal / backup guides under .atlas (exclude live managed kit copies that upgrades replace).
  for (const rel of await walkRelativeFiles(root, '.atlas/backups')) {
    map[rel] = await sha256File(path.join(root, rel));
  }
  try {
    const db = JSON.parse(await readFile(path.join(root, 'db.json'), 'utf8'));
    const {schemaVersion: _drop, ...rest} = db;
    map['db.json#payload'] = createHash('sha256').update(stableStringify(rest)).digest('hex');
  } catch {}
  return map;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function assertChecksumMapsEqual(expected, actual, label = 'content') {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const missing = [...keys].filter(k => expected[k] && !actual[k]);
  const extra = [...keys].filter(k => actual[k] && !expected[k]);
  const changed = [...keys].filter(k => expected[k] && actual[k] && expected[k] !== actual[k]);
  assert.deepEqual({missing, extra, changed}, {missing: [], extra: [], changed: []}, `${label} checksum mismatch`);
}
