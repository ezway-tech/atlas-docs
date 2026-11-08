import {open, readFile, writeFile, unlink, mkdir, rename} from 'node:fs/promises';
import {unlinkSync, readFileSync, existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {AtlasError} from './errors.mjs';
import {canonicalize, lockPath} from './paths.mjs';

const HEARTBEAT_MS = 5_000;
const STALE_AFTER_MS = 20_000;
const STALE_FORCE_MS = 60_000;

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function readLock(file) {
  try {
    const text = await readFile(file, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) return {corrupt: true};
    throw error;
  }
}

function readLockSync(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isStale(record, now = Date.now()) {
  if (!record || record.corrupt) return true;
  const heartbeat = Date.parse(record.heartbeatAt || record.acquiredAt || 0);
  if (!Number.isFinite(heartbeat)) return true;
  const age = now - heartbeat;
  if (age < STALE_AFTER_MS) return false;
  if (!pidAlive(record.pid)) return true;
  // Heartbeat long expired while a PID still exists (possible PID reuse).
  return age >= STALE_FORCE_MS;
}

/**
 * Acquire an exclusive library lock for this process.
 * Uses sync unlink on process exit so Windows SIGTERM/IPC stop clears the lock.
 */
export async function acquireLibraryLock(libraryRoot, purpose = 'server') {
  const root = canonicalize(libraryRoot);
  await mkdir(root, {recursive: true});
  const file = lockPath(root);
  const nonce = randomUUID();
  const record = {
    pid: process.pid,
    nonce,
    purpose,
    acquiredAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const handle = await open(file, 'wx');
      try {
        await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`);
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readLock(file);
      if (isStale(existing)) {
        try {
          await unlink(file);
          continue;
        } catch (unlinkError) {
          if (unlinkError.code !== 'ENOENT') throw unlinkError;
          continue;
        }
      }
      const who = existing?.pid != null ? `pid ${existing.pid}` : 'another process';
      const why = existing?.purpose || 'unknown';
      throw new AtlasError(
        'library.locked',
        `Library is in use by ${who} (${why}). Stop that process, then retry.\nLibrary: ${root}`,
        {root, existing},
      );
    }
  }

  const written = await readLock(file);
  if (!written || written.nonce !== nonce || written.pid !== process.pid) {
    throw new AtlasError('library.locked', `Could not acquire library lock: ${root}`, {root});
  }

  let timer = setInterval(() => {
    touch().catch(() => {});
  }, HEARTBEAT_MS);
  if (timer.unref) timer.unref();

  async function touch() {
    const current = await readLock(file);
    if (!current || current.nonce !== nonce) return;
    current.heartbeatAt = new Date().toISOString();
    const tmp = `${file}.${nonce}.tmp`;
    await writeFile(tmp, `${JSON.stringify(current, null, 2)}\n`);
    await rename(tmp, file);
  }

  function releaseSync() {
    try {
      if (!existsSync(file)) return;
      const current = readLockSync(file);
      if (current && current.nonce === nonce && current.pid === process.pid) unlinkSync(file);
    } catch {
      // best effort on shutdown
    }
  }

  async function release() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    process.off('exit', releaseSync);
    process.off('SIGINT', releaseSync);
    process.off('SIGTERM', releaseSync);
    const current = await readLock(file);
    if (current && current.nonce === nonce && current.pid === process.pid) {
      await unlink(file).catch(() => {});
    }
  }

  process.once('exit', releaseSync);
  process.once('SIGINT', releaseSync);
  process.once('SIGTERM', releaseSync);

  return {release, releaseSync, touch, record, file, root};
}

export async function readLibraryLock(libraryRoot) {
  return readLock(lockPath(canonicalize(libraryRoot)));
}

export {isStale as isLockStale, pidAlive, STALE_AFTER_MS, HEARTBEAT_MS, STALE_FORCE_MS};
