/**
 * Unit-level checks for session/ready/use-for-project rules via bundled handlers.
 * Full HTTP coverage lives in test:package against a managed runtime.
 */
import '../helpers/environment.mjs';
import assert from 'node:assert/strict';
import {loadTs} from '../helpers/load-ts.mjs';

const {runtimeHeaderMismatch} = await loadTs('src/lib/local-request.ts');

function req(headers) {
  return {headers: {get: name => headers[name.toLowerCase()] ?? null}};
}

process.env.ATLAS_RUNTIME_ID = 'runtime-a';
process.env.ATLAS_LIBRARY_ID = 'library-a';

assert.equal(runtimeHeaderMismatch(req({})), 'missing');
assert.deepEqual(
  runtimeHeaderMismatch(
    req({'x-atlas-runtime': 'runtime-b', 'x-atlas-library': 'library-a'}),
  ).expected,
  {runtimeId: 'runtime-a', libraryId: 'library-a'},
);
assert.equal(
  runtimeHeaderMismatch(
    req({'x-atlas-runtime': 'runtime-a', 'x-atlas-library': 'library-a'}),
  ),
  null,
);

console.log('PASS: library session header mismatch rules');
