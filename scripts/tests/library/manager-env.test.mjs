import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {applyLibraryDataDir, resolveManagerInitialLibrary} from '../../../app/src/library/manager-env.mjs';
import {canonicalize} from '../../../app/src/library/paths.mjs';

test('manager ignores DATA_DIR and only opens ATLAS_OPEN_LIBRARY', () => {
  assert.equal(resolveManagerInitialLibrary({DATA_DIR: '/data', ATLAS_LIBRARY_MODE: 'manager'}), null);
  const opened = resolveManagerInitialLibrary({DATA_DIR: '/data', ATLAS_OPEN_LIBRARY: '/libraries/demo'});
  assert.equal(opened, canonicalize(path.resolve('/libraries/demo')));
});

test('child env drops DATA_DIR when no library is selected', () => {
  const withLib = applyLibraryDataDir({DATA_DIR: '/data', OTHER: '1'}, '/libraries/a');
  assert.equal(withLib.DATA_DIR, '/libraries/a');
  const manager = applyLibraryDataDir({DATA_DIR: '/data', OTHER: '1'}, null);
  assert.equal('DATA_DIR' in manager, false);
  assert.equal(manager.OTHER, '1');
});
