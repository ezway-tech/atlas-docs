/**
 * Child-process entry: run prepareLibrary/migrate until ATLAS_TEST_MIGRATE_ABORT fires (exit 97).
 * Usage: node scripts/migrate-abort-runner.mjs <libraryRoot> <coreIndexPath> <abortPoint> [appVersion]
 */
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const libraryRoot = process.argv[2];
const corePath = process.argv[3];
const abortPoint = process.argv[4];
const appVersion = process.argv[5] || '';

if (!libraryRoot || !corePath || !abortPoint) {
  console.error('Usage: migrate-abort-runner.mjs <library> <core/index.mjs> <abortPoint> [appVersion]');
  process.exit(2);
}

process.env.ATLAS_TEST_MIGRATE_ABORT = abortPoint;

const core = await import(pathToFileURL(path.resolve(corePath)).href);
await core.prepareLibrary({
  libraryRoot,
  appVersion,
  allowInit: false,
  allowMigrate: true,
  autoConfirmMigrate: true,
  agentKitPath: null,
  holdLock: false,
  log: console.log,
});
console.error('FAIL: migrate completed without abort');
process.exit(1);
