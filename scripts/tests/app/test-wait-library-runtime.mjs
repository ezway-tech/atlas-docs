import '../helpers/environment.mjs';
import assert from 'node:assert/strict';
import {loadTs} from '../helpers/load-ts.mjs';

const {runtimeMatchesSwitch} = await loadTs('src/lib/atlas-client.ts');

const expected = 'abc123libraryidalpha';
const previous = 'runtime-old';

assert.equal(
  runtimeMatchesSwitch(
    {runtimeId: previous, libraryId: expected, libraryRoot: '/libraries/alpha', mode: 'library'},
    {ok: true, libraryId: expected},
    expected,
    previous,
  ),
  false,
  'same runtimeId as before switch is rejected',
);

assert.equal(
  runtimeMatchesSwitch(
    {runtimeId: 'runtime-new', libraryId: 'abc123libraryidAlpha', libraryRoot: '/libraries/Alpha', mode: 'library'},
    {ok: true, libraryId: 'abc123libraryidAlpha'},
    expected,
    previous,
  ),
  false,
  'different libraryId (case-distinct path identity) is rejected',
);

assert.equal(
  runtimeMatchesSwitch(
    {runtimeId: 'runtime-new', libraryId: expected, libraryRoot: '/libraries/alpha', mode: 'library'},
    {ok: true, libraryId: 'other'},
    expected,
    previous,
  ),
  false,
  'ready libraryId must match',
);

assert.equal(
  runtimeMatchesSwitch(
    {runtimeId: 'runtime-new', libraryId: expected, libraryRoot: '/libraries/alpha', mode: 'library'},
    {ok: true, libraryId: expected},
    expected,
    previous,
  ),
  true,
  'new runtime + matching libraryId + ready',
);

assert.equal(
  runtimeMatchesSwitch(
    {runtimeId: 'runtime-new', libraryId: expected, libraryRoot: '/libraries/alpha', mode: 'manager'},
    {ok: true, libraryId: expected},
    expected,
    previous,
  ),
  false,
  'manager mode is not a completed library switch',
);

console.log('PASS: waitForLibraryRuntime match rules');
