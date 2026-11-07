import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

function moduleDir(): string {
  // Avoid `new URL('.', import.meta.url)` — webpack fails to resolve `.`.
  return path.dirname(fileURLToPath(import.meta.url));
}

/** Resolve and import the shared Atlas Docs core ESM module. */
export async function loadCore(): Promise<any> {
  const {access} = await import('node:fs/promises');
  const here = moduleDir();
  const candidates = [
    process.env.ATLAS_CORE_PATH,
    path.resolve(process.cwd(), '..', 'core', 'index.mjs'),
    path.resolve(process.cwd(), '..', 'lib', 'index.mjs'),
    path.resolve(here, '..', '..', '..', '..', 'core', 'index.mjs'),
    path.resolve(process.cwd(), 'core', 'index.mjs'),
    path.resolve(process.cwd(), 'lib', 'index.mjs'),
    path.resolve(process.cwd(), 'scripts', 'core', 'index.mjs'),
    path.resolve(process.cwd(), '../core/index.mjs'),
    path.resolve(process.cwd(), '../../core/index.mjs'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return import(/* webpackIgnore: true */ pathToFileURL(candidate).href);
    } catch {
      // try next
    }
  }
  throw new Error(`Atlas Docs core module not found. Searched:\n${candidates.join('\n')}`);
}
