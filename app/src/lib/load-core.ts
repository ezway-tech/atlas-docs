import path from 'node:path';
import {pathToFileURL} from 'node:url';

/** Opaque at build time so Next/webpack DefinePlugin cannot replace these keys with undefined. */
function runtimeEnv(name: string): string | undefined {
  const keys = JSON.parse('["ATLAS_CORE_PATH","ATLAS_PACKAGE_ROOT","DATA_DIR"]') as string[];
  const key = keys.find(k => k === name) || name;
  return process.env[key];
}

/**
 * Resolve and import the shared Atlas Docs core ESM module.
 * Do not use import.meta.url — Next/webpack can bake the build-machine path into the bundle.
 */
export async function loadCore(): Promise<any> {
  const {access} = await import('node:fs/promises');
  const fromEnv = runtimeEnv('ATLAS_CORE_PATH');
  const packageRoot = runtimeEnv('ATLAS_PACKAGE_ROOT');

  const candidates = [
    fromEnv,
    packageRoot ? path.join(packageRoot, 'core', 'index.mjs') : '',
    path.join(process.cwd(), '..', 'core', 'index.mjs'),
    path.join(process.cwd(), '..', 'lib', 'index.mjs'),
    path.join(process.cwd(), 'core', 'index.mjs'),
    path.join(process.cwd(), 'lib', 'index.mjs'),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(value => path.resolve(value))
    .filter(value => path.isAbsolute(value));

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      const href = pathToFileURL(candidate).href;
      return await import(/* webpackIgnore: true */ href);
    } catch (error) {
      errors.push(`${candidate}: ${(error as Error).message}`);
    }
  }
  throw new Error(`Atlas Docs core module not found. Tried:\n${errors.join('\n')}`);
}
