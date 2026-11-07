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
  // Dynamic env reads — Next/webpack must not inline these at build time.
  const env = process.env;
  const candidates = [
    env['ATLAS_CORE_PATH'],
    path.resolve(process.cwd(), '..', 'core', 'index.mjs'),
    path.resolve(process.cwd(), '..', 'lib', 'index.mjs'),
    path.resolve(here, '..', '..', '..', '..', 'core', 'index.mjs'),
    path.resolve(process.cwd(), 'core', 'index.mjs'),
    path.resolve(process.cwd(), 'lib', 'index.mjs'),
    path.resolve(process.cwd(), 'scripts', 'core', 'index.mjs'),
    path.resolve(process.cwd(), '../core/index.mjs'),
    path.resolve(process.cwd(), '../../core/index.mjs'),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(value => path.resolve(value));

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return import(/* webpackIgnore: true */ pathToFileURL(candidate).href);
    } catch (error) {
      errors.push(`${candidate}: ${(error as Error).message}`);
    }
  }
  throw new Error(`Atlas Docs core module not found. Tried:\n${errors.join('\n')}`);
}
