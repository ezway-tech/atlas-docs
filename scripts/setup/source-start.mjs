import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {startServer} from '../../app/src/cli/start.mjs';
import {
  inspectOpenTarget,
  resolveAllowedRoots,
  prepareLibrary,
  resolveManagedStartupProject,
} from '../../app/src/library/index.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = path.join(repo, 'app');
const development = process.argv[2] === 'dev';
const require = createRequire(path.join(app, 'package.json'));
require('@next/env').loadEnvConfig(app, development);
const args = process.argv.slice(3);
const portIndex = args.findIndex(x => x === '--port' || x === '-p');
const port = Number(portIndex < 0 ? process.env.PORT || 3000 : args[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid port');
const {version} = JSON.parse(await readFile(path.join(app, 'package.json'), 'utf8'));
const fixed = !!process.env.DATA_DIR || process.env.ATLAS_LIBRARY_MODE === 'fixed';
const defaultRoot = path.join(repo, 'data');
let current = fixed ? path.resolve(process.env.DATA_DIR || defaultRoot) : null;
let displayName;
let switchError = '';
if (!fixed) {
  try {
    const startup = await resolveManagedStartupProject({
      env: process.env,
      packageRoot: repo,
      companionDataRoot: defaultRoot,
      openLibrary: process.env.ATLAS_OPEN_LIBRARY || null,
    });
    if (process.env.ATLAS_LIBRARY_MODE === 'manager') {
      // Example (and companion data/) are registered; stay on the project manager screen.
      current = null;
      console.log('[Atlas Docs] Opening project manager');
    } else {
      current = startup.root;
      displayName = startup.displayName;
      console.log(`[Atlas Docs] Project: ${current} (${startup.source})`);
    }
  } catch (error) {
    current = null;
    switchError = error.message;
    console.log(`[Atlas Docs] Opening project manager (${error.message})`);
  }
}
let stopRequested = false;
const requestStop = () => {
  stopRequested = true;
};
process.on('SIGINT', requestStop);
process.on('SIGTERM', requestStop);
process.on('message', message => {
  if (message === 'atlas:stop') requestStop();
});
for (; !stopRequested; ) {
  const previous = current;
  const previousName = displayName;
  let result;
  try {
    result = await startServer(repo, {
      port,
      dataDir: current,
      libraryMode: fixed ? 'fixed' : current ? 'library' : 'manager',
      development,
      runtimeCwd: app,
      runtimeEntry: path.join(repo, 'scripts/setup/source-runtime.mjs'),
      appVersion: version,
      switchError,
      displayName,
      rememberOpen: !fixed,
      envExtra: {
        ATLAS_CLI_MANAGED: fixed ? '' : '1',
        ATLAS_CORE_PATH: path.join(app, 'src/library/index.mjs'),
        ATLAS_LOCAL_DESKTOP: process.env.ATLAS_LOCAL_DESKTOP || '1',
        ATLAS_LAUNCH_CWD: repo,
        ATLAS_PACKAGE_ROOT: repo,
        ATLAS_SEED_DEMO: path.join(repo, 'scripts/setup/seed-demo.mjs'),
        ...(process.env.ATLAS_DOCS_REGISTRY_DIR
          ? {ATLAS_DOCS_REGISTRY_DIR: process.env.ATLAS_DOCS_REGISTRY_DIR}
          : {}),
        ...(process.env.ATLAS_DOCS_LIBRARIES_DIR
          ? {ATLAS_DOCS_LIBRARIES_DIR: process.env.ATLAS_DOCS_LIBRARIES_DIR}
          : {}),
        ...(process.env.ATLAS_DOCS_ALLOWED_ROOTS
          ? {ATLAS_DOCS_ALLOWED_ROOTS: process.env.ATLAS_DOCS_ALLOWED_ROOTS}
          : {}),
        ...(process.env.ATLAS_DOCS_PICK_FOLDER_MOCK
          ? {ATLAS_DOCS_PICK_FOLDER_MOCK: process.env.ATLAS_DOCS_PICK_FOLDER_MOCK}
          : {}),
      },
    });
  } catch (error) {
    if (stopRequested) break;
    if (fixed || !current) throw error;
    current = null;
    displayName = undefined;
    switchError = error.message;
    continue;
  }
  if (stopRequested || !result.switch) break;
  try {
    if (fixed || result.drainOk === false) throw Error('Could not finish saving. Project was not changed.');
    const inspected = await inspectOpenTarget(result.switch.path, resolveAllowedRoots());
    if (!inspected.openable) throw Error(inspected.error?.message || 'Cannot open project');
    await prepareLibrary({
      libraryRoot: inspected.root,
      appVersion: version,
      allowInit: false,
      allowMigrate: true,
      autoConfirmMigrate: process.env.ATLAS_DOCS_MIGRATE_YES === '1',
      holdLock: false,
    });
    current = inspected.root;
    displayName = result.switch.displayName;
    switchError = '';
  } catch (error) {
    current = previous;
    displayName = previousName;
    switchError = error.message;
  }
}
if (process.connected) process.disconnect();
