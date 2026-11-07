import path from 'node:path';
import {loadCore} from './load-core';

type PrepareResult = {
  root: string;
  lock: {release: () => Promise<void>} | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __atlasPrepare: Promise<PrepareResult> | undefined;
}

/** Prepare the active library once per process; holds the cross-process lock while the server runs. */
export function ensureLibraryPrepared(): Promise<PrepareResult> {
  if (!globalThis.__atlasPrepare) {
    globalThis.__atlasPrepare = (async () => {
      try {
        const core = await loadCore();
        // Opaque keys — Next must not inline these as undefined in the server bundle.
        const keys = JSON.parse(
          '["DATA_DIR","ATLAS_APP_VERSION","ATLAS_DOCS_MIGRATE_YES","ATLAS_AGENT_KIT"]',
        ) as string[];
        const dataDir = process.env[keys[0]];
        const root = dataDir
          ? core.canonicalize(path.resolve(dataDir))
          : core.resolveAppDataRoot(process.env, process.cwd());

        const appVersion = process.env[keys[1]] || '';
        const migrateYes = process.env[keys[2]] === '1' || process.env[keys[2]] === 'true';
        const agentKitPath = process.env[keys[3]] || null;

        const result = await core.prepareLibrary({
          libraryRoot: root,
          appVersion,
          allowInit: true,
          allowMigrate: true,
          autoConfirmMigrate: migrateYes,
          agentKitPath,
          holdLock: true,
          log: console.log,
        });

        const unlock = () => {
          result.lock?.releaseSync?.();
        };
        process.once('exit', unlock);
        process.once('SIGINT', unlock);
        process.once('SIGTERM', unlock);

        return {root: result.root, lock: result.lock};
      } catch (error) {
        globalThis.__atlasPrepare = undefined;
        console.error('[Atlas Docs] Library prepare failed:', error);
        throw error;
      }
    })();
  }
  return globalThis.__atlasPrepare;
}
