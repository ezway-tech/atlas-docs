import path from 'node:path';
import {readFile, writeFile, rename} from 'node:fs/promises';
import {resolveRegistryDir, rememberSuccessfulOpen, ensureRegistered} from './user-registry.mjs';
import {acquireLibraryLock} from './lock.mjs';
import {uniqueDemoPath, inspectOpenTarget} from './library-ops.mjs';

/** Read-only identity and availability for the project list, independent of its display name. */
export async function readExampleProject({allowedRoots, env = process.env} = {}) {
  let saved;
  try {
    saved = JSON.parse(await readFile(path.join(resolveRegistryDir(env), 'demo-state', 'source.json'), 'utf8'));
    if (typeof saved?.path !== 'string' || !saved.path) throw Error('Example location is not recorded.');
    const inspected = await inspectOpenTarget(saved.path, allowedRoots);
    return {path: inspected.root, error: inspected.openable ? null : inspected.error?.message || 'Example is unavailable.'};
  } catch (error) {
    return {path: typeof saved?.path === 'string' ? saved.path : null,
      error: error.code === 'ENOENT' ? 'Example has not been prepared.' : error.message};
  }
}

/**
 * Ensure the durable Example project exists once under the libraries directory.
 * Reuses the saved pointer when the project is still openable; never overwrites edits.
 */
export async function ensureDemoLibrary({allowedRoots, seed, env = process.env, remember = true} = {}) {
  const registry = resolveRegistryDir(env);
  const lock = await acquireLibraryLock(path.join(registry, 'demo-state'), 'demo');
  const file = path.join(registry, 'demo-state', 'source.json');
  try {
    let saved;
    try {
      saved = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (saved?.path) {
      const inspected = await inspectOpenTarget(saved.path, allowedRoots);
      if (inspected.openable) {
        const dest = {
          path: inspected.root,
          displayName: 'Example',
        };
        if (saved.displayName !== 'Example') {
          await writeFile(file + '.tmp', JSON.stringify(dest));
          await rename(file + '.tmp', file);
        }
        if (remember) {
          await rememberSuccessfulOpen(dest.path, {displayName: dest.displayName, env});
        } else await ensureRegistered(dest.path, {displayName: dest.displayName, env});
        return dest;
      }
      if (inspected.inspection.state !== 'missing') {
        throw Error(inspected.error?.message || 'Example project is unavailable.');
      }
    }
    const dest = await uniqueDemoPath(undefined, allowedRoots, env);
    await seed(dest.path);
    const payload = {path: dest.path, displayName: dest.displayName || 'Example'};
    await writeFile(file + '.tmp', JSON.stringify(payload));
    await rename(file + '.tmp', file);
    if (remember) {
      await rememberSuccessfulOpen(payload.path, {displayName: payload.displayName, env});
    } else await ensureRegistered(payload.path, {displayName: payload.displayName, env});
    return payload;
  } finally {
    await lock.release();
  }
}
