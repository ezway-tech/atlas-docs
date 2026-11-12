import path from 'node:path';
import {
  resolveLibraryPath,
  inspectLibrary,
  prepareLibrary,
  CURRENT_SCHEMA_VERSION,
  canonicalize,
  assertWithinAllowedRoots,
  resolveAllowedRoots,
  inspectOpenTarget,
} from '../../library/index.mjs';
import {resolveListenPort, startServer} from '../start.mjs';
import {confirmMigrate} from '../ui.mjs';
import {createUpdateState, installManagedUpdate, restartManagedApp} from '../managed-update.mjs';

async function prepareTargetLibrary(packageRoot, manifest, dataDir, options, {allowInit}) {
  const agentKit = path.join(packageRoot, 'agent-kit');
  const inspection = await inspectLibrary(dataDir);
  if (inspection.state === 'newer') {
    throw Error(`${inspection.message} Data was not changed. Update Atlas Docs, or restore an older library backup.`);
  }
  if (inspection.state === 'unknown') {
    throw Error(`${inspection.message || 'Not a valid Atlas Docs library.'} Data was not changed. Path: ${dataDir}`);
  }
  if (!allowInit && (inspection.state === 'missing' || inspection.state === 'empty')) {
    throw Error(`Folder is not an initialized Atlas Docs library: ${dataDir}. Use Create in the UI or pass an existing library.`);
  }

  let migrateYes = options.yes || process.env.ATLAS_DOCS_MIGRATE_YES === '1';
  if (
    (inspection.state === 'legacy' ||
      (inspection.state === 'ready' && inspection.schemaVersion != null && inspection.schemaVersion < CURRENT_SCHEMA_VERSION)) &&
    !migrateYes
  ) {
    const ok = await confirmMigrate({
      appVersion: manifest.version,
      from: inspection.schemaVersion,
      to: CURRENT_SCHEMA_VERSION,
      root: dataDir,
    });
    if (!ok) throw Error('Schema migration cancelled. Data was not changed.');
    migrateYes = true;
  }

  const backupEnv = (options.env || process.env).ATLAS_DOCS_UPGRADE_BACKUP_DIR;
  const backupParentDir = backupEnv ? path.resolve(String(backupEnv)) : undefined;

  await prepareLibrary({
    libraryRoot: dataDir,
    appVersion: manifest.version,
    allowInit,
    allowMigrate: true,
    autoConfirmMigrate: migrateYes,
    agentKitPath: agentKit,
    backupParentDir,
    holdLock: false,
    log: console.log,
  });

  return {agentKit, migrateYes, backupEnv};
}

function baseEnvExtra(packageRoot, manifest, agentKit, backupEnv, options) {
  const demoSeed = path.join(packageRoot, 'demo', 'seed-demo.mjs');
  const demoRoot = path.join(packageRoot, 'demo', 'little-cafe');
  return {
    ATLAS_DOCS_MIGRATE_YES: '1',
    ATLAS_AGENT_KIT: agentKit,
    ATLAS_APP_VERSION: manifest.version,
    ATLAS_CORE_PATH: path.join(packageRoot, 'core', 'index.mjs'),
    ATLAS_PACKAGE_ROOT: packageRoot,
    ATLAS_CLI_MANAGED: '1',
    ATLAS_LAUNCH_CWD: options.cwd || process.cwd(),
    ATLAS_SEED_DEMO: demoSeed,
    ATLAS_DEMO_ROOT: demoRoot,
    ATLAS_DOCS_REGISTRY_DIR: (options.env || process.env).ATLAS_DOCS_REGISTRY_DIR || '',
    ATLAS_DOCS_ALLOWED_ROOTS: (options.env || process.env).ATLAS_DOCS_ALLOWED_ROOTS || '',
    ATLAS_LIBRARIES_ROOT: (options.env || process.env).ATLAS_LIBRARIES_ROOT || '',
    ATLAS_DOCS_LIBRARIES_DIR: (options.env || process.env).ATLAS_DOCS_LIBRARIES_DIR || '',
    ...(backupEnv ? {ATLAS_DOCS_UPGRADE_BACKUP_DIR: String(backupEnv)} : {}),
  };
}

export async function runStart(packageRoot, options, manifest) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw Error('Node.js 22.12 or newer is required');

  const resolved = await resolveLibraryPath({
    dataDir: options.dataDirFlag,
    env: options.env || process.env,
    cwd: options.cwd || process.cwd(),
  });

  const port = await resolveListenPort(options);
  options = {...options, port};
  const updateStateFile = process.env.ATLAS_UPDATE_STATE || (await createUpdateState());
  const agentKit = path.join(packageRoot, 'agent-kit');
  const backupEnv = (options.env || process.env).ATLAS_DOCS_UPGRADE_BACKUP_DIR;

  let current = {
    dataDir: resolved.root,
    mode: resolved.source === 'welcome' ? 'manager' : 'library',
    displayName: resolved.displayName || null,
    allowInit: resolved.source === 'flag' || resolved.source === 'env' || resolved.source === 'default' || resolved.source === 'compat',
    switchError: resolved.welcomeReason
      ? `${resolved.welcomeReason.message}${resolved.welcomeReason.path ? ` (${resolved.welcomeReason.path})` : ''}`
      : null,
  };

  // Explicit flag/env/config must not silently fall back — validate before prepare.
  if (resolved.source === 'flag' || resolved.source === 'env' || resolved.source === 'config') {
    const inspection = await inspectLibrary(resolved.root);
    if (inspection.state === 'newer' || inspection.state === 'unknown') {
      throw Error(`${inspection.message || 'Invalid library.'} Selected path: ${resolved.root}. Data was not changed.`);
    }
  }

  if (current.mode === 'library') {
    console.log(`[Atlas Docs] Library: ${current.dataDir} (${resolved.source})`);
    await prepareTargetLibrary(packageRoot, manifest, current.dataDir, options, {
      allowInit: current.allowInit || resolved.source === 'config' || resolved.source === 'recent',
    });
  } else {
    console.log('[Atlas Docs] No library selected — opening library manager.');
    if (current.switchError) console.log(`[Atlas Docs] ${current.switchError}`);
  }

  // Supervisor loop: same listen port; child runtimes swap on library switch.
  for (;;) {
    let result;
    try {
      result = await startServer(packageRoot, {
        ...options,
        dataDir: current.dataDir,
        displayName: current.displayName,
        libraryMode: current.mode,
        switchError: current.switchError,
        appVersion: manifest.version,
        updateStateFile,
        rememberOpen: current.mode === 'library',
        envExtra: {
          ...baseEnvExtra(packageRoot, manifest, agentKit, backupEnv, options),
          ATLAS_UPDATE_STATE: updateStateFile,
        },
      });
    } catch (error) {
      console.error(`[Atlas Docs] Runtime failed: ${error.message}`);
      // Failed child startup must not leave a "successful" library as current without Ready.
      if (current.mode === 'library' && current.dataDir) {
        current = {
          dataDir: null,
          mode: 'manager',
          displayName: null,
          allowInit: false,
          switchError: error.message,
        };
        console.log('[Atlas Docs] Returning to library manager after failed start.');
        continue;
      }
      throw error;
    }

    if (result?.update) {
      let stopRequested = false;
      const stop = () => {
        stopRequested = true;
      };
      const message = value => {
        if (value === 'atlas:stop') stop();
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      process.on('message', message);
      try {
        const installed = await installManagedUpdate(packageRoot, result.update, updateStateFile);
        if (!installed) throw Error('Update failed; see the recovery command above. Library data was not changed by the installer.');
        if (!stopRequested) {
          await restartManagedApp(
            packageRoot,
            {...options, dataDir: current.dataDir, dataDirFlag: current.dataDir},
            updateStateFile,
          );
        }
      } finally {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
        process.off('message', message);
      }
      return;
    }

    if (result?.switch) {
      const previous = {...current};
      const target = canonicalize(result.switch.path);
      try {
        if (result.drainOk === false) {
          throw Error('Previous library did not finish saving before switch. Switch cancelled.');
        }
        const allowed = resolveAllowedRoots(options.env || process.env);
        await assertWithinAllowedRoots(target, allowed, {mustExist: false});
        const inspected = await inspectOpenTarget(target, allowed);
        if (!inspected.openable) {
          throw Error(inspected.error?.message || `Cannot open library: ${target}`);
        }
        // Re-check target while acquiring lock via prepare (state may have changed since preflight).
        await prepareTargetLibrary(packageRoot, manifest, target, {...options, yes: true}, {
          allowInit: false,
        });
        current = {
          dataDir: target,
          mode: 'library',
          displayName: result.switch.displayName || previous.displayName,
          allowInit: false,
          switchError: null,
        };
        console.log(`[Atlas Docs] Opening library: ${target}`);
        continue;
      } catch (error) {
        console.error(`[Atlas Docs] Could not open library: ${error.message}`);
        // Restore previous runtime when possible.
        if (previous.mode === 'library' && previous.dataDir) {
          try {
            await prepareTargetLibrary(packageRoot, manifest, previous.dataDir, {...options, yes: true}, {allowInit: false});
            current = {
              ...previous,
              switchError: error.message,
            };
            console.log(`[Atlas Docs] Restored previous library: ${previous.dataDir}`);
            continue;
          } catch (restoreError) {
            console.error(`[Atlas Docs] Could not restore previous library: ${restoreError.message}`);
          }
        }
        current = {
          dataDir: null,
          mode: 'manager',
          displayName: null,
          allowInit: false,
          switchError: error.message,
        };
        console.log('[Atlas Docs] Returning to library manager.');
        continue;
      }
    }

    break;
  }
}
