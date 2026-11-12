import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {normalizePathForCompare, pathIsWithinRoot} from '../../../app/src/library/paths.mjs';
import {libraryIdentityKey} from '../../../app/src/library/user-registry.mjs';
import {assertWithinAllowedRoots} from '../../../app/src/library/fs-policy.mjs';

test('Linux path compare keeps case; Windows folds case', () => {
  assert.notEqual(
    normalizePathForCompare('/tmp/Allowed', 'linux'),
    normalizePathForCompare('/tmp/allowed', 'linux'),
  );
  assert.equal(
    normalizePathForCompare('C:\\Temp\\Lib', 'win32'),
    normalizePathForCompare('c:\\temp\\lib', 'win32'),
  );
  assert.notEqual(
    libraryIdentityKey('/tmp/Allowed', 'linux'),
    libraryIdentityKey('/tmp/allowed', 'linux'),
  );
  assert.equal(
    libraryIdentityKey('C:\\Libs\\A', 'win32'),
    libraryIdentityKey('c:\\libs\\a', 'win32'),
  );
});

test('containment rejects paths outside allowed roots (linux compare)', async () => {
  const allowed = [path.resolve('/tmp/Allowed')];
  await assert.rejects(
    () =>
      assertWithinAllowedRoots(path.resolve('/tmp/other'), allowed, {
        mustExist: false,
        platform: 'linux',
      }),
    /outside allowed roots/,
  );
  // Same spelling different case is outside on Linux when the allowed root uses Allowed.
  await assert.rejects(
    () =>
      assertWithinAllowedRoots(path.resolve('/tmp/allowed/child'), allowed, {
        mustExist: false,
        platform: 'linux',
      }),
    /outside allowed roots/,
  );
  assert.equal(pathIsWithinRoot('/tmp/Allowed/child', '/tmp/Allowed', 'linux'), true);
  assert.equal(pathIsWithinRoot('/tmp/allowed/child', '/tmp/Allowed', 'linux'), false);
});
