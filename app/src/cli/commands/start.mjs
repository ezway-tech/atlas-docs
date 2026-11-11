import path from 'node:path';
import {
  resolveLibraryPath,
  inspectLibrary,
  prepareLibrary,
  CURRENT_SCHEMA_VERSION,
} from '../../library/index.mjs';
import {resolveListenPort, startServer} from '../start.mjs';
import {confirmMigrate} from '../ui.mjs';
import {createUpdateState,installManagedUpdate,restartManagedApp} from '../managed-update.mjs';

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

  const port = await resolveListenPort(options);
  options = {...options, port};
  console.log(`[Atlas Docs] Library: ${dataDir} (${resolved.source})`);

  const backupEnv = (options.env || process.env).ATLAS_DOCS_UPGRADE_BACKUP_DIR;
  const backupParentDir = backupEnv ? path.resolve(String(backupEnv)) : undefined;

  // Prepare before spawn so the server only has to acquire the lock and re-check.
  // The short-lived CLI prepare releases the lock; the server process owns it while running.
  await prepareLibrary({
    libraryRoot: dataDir,
    appVersion: manifest.version,
    allowInit: true,
    allowMigrate: true,
    autoConfirmMigrate: migrateYes,
    agentKitPath: agentKit,
    backupParentDir,
    holdLock: false,
    log: console.log,
  });

  const updateStateFile = process.env.ATLAS_UPDATE_STATE || await createUpdateState();
  const result = await startServer(packageRoot, {
    ...options,
    dataDir,
    appVersion:manifest.version,
    updateStateFile,
    envExtra: {
      ATLAS_DOCS_MIGRATE_YES: '1',
      ATLAS_AGENT_KIT: agentKit,
      ATLAS_APP_VERSION: manifest.version,
      ATLAS_CORE_PATH: path.join(packageRoot, 'core', 'index.mjs'),
      ATLAS_PACKAGE_ROOT: packageRoot,
      ATLAS_CLI_MANAGED: '1',
      ATLAS_UPDATE_STATE: updateStateFile,
      ...(backupEnv ? {ATLAS_DOCS_UPGRADE_BACKUP_DIR: String(backupEnv)} : {}),
    },
  });
  if(result?.update){
    let stopRequested=false;
    const stop=()=>{stopRequested=true;};
    const message=value=>{if(value==='atlas:stop')stop();};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('message',message);
    try{
      const installed = await installManagedUpdate(packageRoot,result.update,updateStateFile);
      if(!installed) throw Error('Update failed; see the recovery command above. Library data was not changed by the installer.');
      if(!stopRequested)await restartManagedApp(packageRoot,{...options,dataDir},updateStateFile);
    }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);process.off('message',message);}
  }
}
