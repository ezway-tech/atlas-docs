import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {startServer} from '../../app/src/cli/start.mjs';
import {inspectLibrary, inspectOpenTarget, resolveAllowedRoots, prepareLibrary} from '../../app/src/library/index.mjs';

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
if (!fixed && process.env.ATLAS_LIBRARY_MODE !== 'manager') {
  const initial = process.env.ATLAS_OPEN_LIBRARY ? path.resolve(process.env.ATLAS_OPEN_LIBRARY) : defaultRoot;
  if ((await inspectLibrary(initial)).state === 'ready') current = initial;
}
let switchError = '';
let displayName;
let stopRequested = false;
const requestStop = () => {stopRequested = true;};
process.on('SIGINT', requestStop);
process.on('SIGTERM', requestStop);
process.on('message', message => {if (message === 'atlas:stop') requestStop();});
for (; !stopRequested;) {
  const previous = current;
  let result;
  try {
    result = await startServer(repo, {
      port, dataDir: current, libraryMode: fixed ? 'fixed' : current ? 'library' : 'manager',
      development, runtimeCwd: app, runtimeEntry: path.join(repo, 'scripts/setup/source-runtime.mjs'),
      appVersion: version, switchError, displayName, rememberOpen: !fixed,
      envExtra: {ATLAS_CLI_MANAGED: fixed ? '' : '1', ATLAS_CORE_PATH: path.join(app, 'src/library/index.mjs'),
        ATLAS_LOCAL_DESKTOP: process.env.ATLAS_LOCAL_DESKTOP || '1', ATLAS_LAUNCH_CWD: repo},
    });
  } catch (error) {
    if (stopRequested) break;
    if (fixed || !current) throw error;
    current = null;
    switchError = error.message;
    continue;
  }
  if (stopRequested || !result.switch) break;
  try {
    if (fixed || result.drainOk === false) throw Error('Could not finish saving. Source was not changed.');
    const inspected = await inspectOpenTarget(result.switch.path, resolveAllowedRoots());
    if (!inspected.openable) throw Error(inspected.error?.message || 'Cannot open source');
    await prepareLibrary({libraryRoot: inspected.root, appVersion: version, allowInit: false,
      allowMigrate: true, autoConfirmMigrate: process.env.ATLAS_DOCS_MIGRATE_YES === '1', holdLock: false});
    current = inspected.root;
    displayName = result.switch.displayName;
    switchError = '';
  } catch (error) {
    current = previous;
    switchError = error.message;
  }
}
if (process.connected) process.disconnect();
