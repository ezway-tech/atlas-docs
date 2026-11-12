import path from 'node:path';
import {access} from 'node:fs/promises';
import {AtlasError} from './errors.mjs';
import {canonicalize} from './paths.mjs';
import {findProjectConfig, readProjectConfig} from './project-config.mjs';
import {getRecentLibrary, pathExists} from './user-registry.mjs';
import {inspectLibrary, assertOpenable} from './inspect.mjs';

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve library path for the npm CLI / project-aware tools.
 * Order:
 * 1. --data-dir
 * 2. DATA_DIR
 * 3. nearest atlas-docs.config.json
 * 4. valid recent library from the user registry
 * 5. existing ./atlas-docs-data compatibility (openable library in cwd)
 * 6. welcome (no library selected — do not invent a path)
 *
 * Explicit flag/env/config that points at a missing or unusable library errors;
 * they never fall back to recent or welcome.
 *
 * @param {{dataDir?: string|null, env?: NodeJS.ProcessEnv, cwd?: string, defaultRelative?: string, preferWelcome?: boolean}} options
 */
export async function resolveLibraryPath({
  dataDir = null,
  env = process.env,
  cwd = process.cwd(),
  defaultRelative = 'atlas-docs-data',
  preferWelcome = true,
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
    // Broken/missing saved path must error — never fall back to recent or invent a library.
    if (!(await exists(config.dataDir))) {
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

  const {registry, entry: recent} = await getRecentLibrary(env);
  if (recent) {
    const recentReason = await describeUnusableRecent(recent.path);
    if (!recentReason) {
      return {
        root: recent.path,
        source: 'recent',
        recentId: recent.id,
        displayName: recent.displayName,
        registryFile: registry.file,
      };
    }
    return {
      root: null,
      source: 'welcome',
      welcomeReason: recentReason,
      recentId: recent.id,
      recentPath: recent.path,
      registryFile: registry.file,
      registryRecovery: registry.recovery || null,
    };
  }

  const compatPath = canonicalize(path.join(base, defaultRelative));
  if (await pathExists(compatPath)) {
    const inspection = await inspectLibrary(compatPath);
    try {
      assertOpenable(inspection);
      if (inspection.state === 'unknown' || inspection.state === 'newer') {
        // assertOpenable already throws for these; keep explicit.
      }
      return {
        root: compatPath,
        source: 'compat',
        message: `Found existing ${defaultRelative} in the current directory. Opened for compatibility with earlier Atlas Docs versions.`,
      };
    } catch {
      // Not an openable library — fall through to welcome rather than auto-init over unknown files.
      return {
        root: null,
        source: 'welcome',
        welcomeReason: {
          code: `compat.${inspection.state}`,
          message: inspection.message || `Path ${compatPath} is not an openable Atlas Docs library.`,
          path: compatPath,
        },
      };
    }
  }

  if (!preferWelcome) {
    return {
      root: compatPath,
      source: 'default',
    };
  }

  return {
    root: null,
    source: 'welcome',
    welcomeReason: {
      code: 'welcome.none',
      message: 'No library selected. Open an existing library, create a new one, or try the demo.',
    },
    registryFile: registry.file,
    registryRecovery: registry.recovery || null,
  };
}

async function describeUnusableRecent(libraryRoot) {
  try {
    if (!(await pathExists(libraryRoot))) {
      return {
        code: 'recent.missing',
        message: `Recent library is missing: ${libraryRoot}`,
        path: libraryRoot,
      };
    }
    const inspection = await inspectLibrary(libraryRoot);
    if (inspection.state === 'newer' || inspection.state === 'unknown') {
      return {
        code: `recent.${inspection.state}`,
        message: inspection.message || `Recent library cannot be opened (${inspection.state}).`,
        path: libraryRoot,
        state: inspection.state,
      };
    }
    // ready / empty / legacy / interrupted / missing handled above — empty folder is openable with init after user confirms in UI
    return null;
  } catch (error) {
    return {
      code: 'recent.unavailable',
      message: error?.message || `Recent library is unavailable: ${libraryRoot}`,
      path: libraryRoot,
    };
  }
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
