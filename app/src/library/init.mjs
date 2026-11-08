import {mkdir, open, access} from 'node:fs/promises';
import path from 'node:path';
import {canonicalize} from './paths.mjs';
import {DATA_DIRS, emptyDatabase} from './schema.mjs';

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Create storage dirs and a schemaVersioned empty db.json when missing (wx). */
export async function initEmptyLibrary(libraryRoot) {
  const root = canonicalize(libraryRoot);
  await mkdir(root, {recursive: true});
  for (const name of DATA_DIRS) await mkdir(path.join(root, name), {recursive: true});
  const file = path.join(root, 'db.json');
  if (!(await exists(file))) {
    const handle = await open(file, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(emptyDatabase(), null, 2)}\n`);
    } finally {
      await handle.close();
    }
  } else {
    // Ensure data dirs exist even when db already present.
    for (const name of DATA_DIRS) await mkdir(path.join(root, name), {recursive: true});
  }
  return root;
}
