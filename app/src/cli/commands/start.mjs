import path from 'node:path';
import {
  resolveLibraryPath,
  inspectLibrary,
  prepareLibrary,
  CURRENT_SCHEMA_VERSION,
} from '../../library/index.mjs';
import {assertPortAvailable, startServer} from '../start.mjs';
import {confirmMigrate} from '../ui.mjs';

export async function runStart(packageRoot, options, manifest) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw Error('Node.js 22.12 or newer is required');

  const resolved = await resolveLibraryPath({
    dataDir: options.dataDirFlag,
    env: options.env || process.env,
    cwd: options.cwd || process.cwd(),
  });
  const dataDir = resolved.root;
  const agentKit = path.join(packageRoot, 'agent-kit');

  const inspection = await inspectLibrary(dataDir);
  if (inspection.state === 'newer') {
    throw Error(`${inspection.message} Data was not changed. Update Atlas Docs, or restore an older library backup.`);
  }
  if (inspection.state === 'unknown') {
    throw Error(`${inspection.message || 'Not a valid Atlas Docs library.'} Data was not changed. Path: ${dataDir}`);
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

  await assertPortAvailable(options.port);
  console.log(`[Atlas Docs] Library: ${dataDir} (${resolved.source})`);

  // Prepare before spawn so the server only has to acquire the lock and re-check.
  // The short-lived CLI prepare releases the lock; the server process owns it while running.
  await prepareLibrary({
    libraryRoot: dataDir,
    appVersion: manifest.version,
    allowInit: true,
    allowMigrate: true,
    autoConfirmMigrate: migrateYes,
    agentKitPath: agentKit,
    holdLock: false,
    log: console.log,
  });

  await startServer(packageRoot, {
    ...options,
    dataDir,
    envExtra: {
      ATLAS_DOCS_MIGRATE_YES: '1',
      ATLAS_AGENT_KIT: agentKit,
      ATLAS_APP_VERSION: manifest.version,
      ATLAS_CORE_PATH: path.join(packageRoot, 'core', 'index.mjs'),
      ATLAS_PACKAGE_ROOT: packageRoot,
    },
  });
}
