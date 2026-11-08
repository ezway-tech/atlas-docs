import path from 'node:path';
import {access} from 'node:fs/promises';
import {AtlasError} from './errors.mjs';
import {canonicalize} from './paths.mjs';
import {findProjectConfig, readProjectConfig} from './project-config.mjs';

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve library path for the npm CLI / project-aware tools.
 * Order: explicit --data-dir → DATA_DIR → nearest atlas-docs.config.json → ./atlas-docs-data
 *
 * @param {{dataDir?: string|null, env?: NodeJS.ProcessEnv, cwd?: string, defaultRelative?: string}} options
 */
export async function resolveLibraryPath({
  dataDir = null,
  env = process.env,
  cwd = process.cwd(),
  defaultRelative = 'atlas-docs-data',
} = {}) {
  const base = path.resolve(cwd);

  if (dataDir != null && dataDir !== '') {
    return {
      root: canonicalize(path.resolve(base, dataDir)),
      source: 'flag',
    };
  }

  if (env.DATA_DIR != null && String(env.DATA_DIR).trim() !== '') {
    return {
      root: canonicalize(path.resolve(base, env.DATA_DIR)),
      source: 'env',
    };
  }

  const configPath = await findProjectConfig(base);
  if (configPath) {
    const config = await readProjectConfig(configPath);
    // Broken/missing saved path must error — never fall back to default or invent a library.
    if (!(await pathExists(config.dataDir))) {
      throw new AtlasError(
        'config.missingLibrary',
        `Configured library path does not exist: ${config.dataDir} (from ${configPath}). Fix the path or run: atlas-docs library use <path>. Data was not changed.`,
        {dataDir: config.dataDir, configPath},
      );
    }
    return {
      root: config.dataDir,
      source: 'config',
      configPath: config.configPath,
    };
  }

  return {
    root: canonicalize(path.join(base, defaultRelative)),
    source: 'default',
  };
}

/**
 * Source checkout / Docker: DATA_DIR or the provided fallback (absolute or relative to cwd).
 * Does not read project config — keeps source and Docker defaults unchanged.
 */
export function resolveAppDataRoot(env = process.env, cwd = process.cwd(), fallbackRelative = path.join('..', 'data')) {
  if (env.DATA_DIR != null && String(env.DATA_DIR).trim() !== '') {
    return canonicalize(path.resolve(cwd, env.DATA_DIR));
  }
  return canonicalize(path.resolve(cwd, fallbackRelative));
}
