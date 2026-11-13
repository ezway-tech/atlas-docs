import path from 'node:path';
import {readFile, writeFile, rename} from 'node:fs/promises';
import {resolveRegistryDir} from './user-registry.mjs';
import {acquireLibraryLock} from './lock.mjs';
import {uniqueDemoPath, inspectOpenTarget} from './library-ops.mjs';

export async function ensureDemoLibrary({allowedRoots, seed, env = process.env}) {
  const registry = resolveRegistryDir(env);
  const lock = await acquireLibraryLock(path.join(registry, 'demo-state'), 'demo');
  const file = path.join(registry, 'demo-state', 'source.json');
  try {
    let saved;
    try {saved = JSON.parse(await readFile(file, 'utf8'));} catch (error) {if (error.code !== 'ENOENT') throw error;}
    if (saved) {
      const inspected = await inspectOpenTarget(saved.path, allowedRoots);
      if (inspected.openable) return saved;
      if (inspected.inspection.state !== 'missing') throw Error(inspected.error?.message || 'Demo is unavailable.');
    }
    const dest = await uniqueDemoPath(undefined, allowedRoots, env);
    await seed(dest.path);
    await writeFile(file + '.tmp', JSON.stringify(dest));
    await rename(file + '.tmp', file);
    return dest;
  } finally {await lock.release();}
}
