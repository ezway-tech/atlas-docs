import '../helpers/environment.mjs';
import assert from 'node:assert/strict';
import {loadTs} from '../helpers/load-ts.mjs';

const cookie = await loadTs('src/lib/runtime-session-cookie.ts');
const {runtimeSessionMismatch, runtimeHeaderMismatch} = await loadTs('src/lib/local-request.ts');

const encoded = cookie.encodeRuntimeSessionCookie('rt-1', 'lib-1');
assert.equal(cookie.parseRuntimeSessionCookie(encoded)?.runtimeId, 'rt-1');
assert.equal(cookie.parseRuntimeSessionCookie(encoded)?.libraryId, 'lib-1');
assert.match(cookie.runtimeSessionCookieHeader('rt-1', 'lib-1'), /HttpOnly/);
assert.equal(
  cookie.readRuntimeSessionCookie(`other=1; ${cookie.RUNTIME_SESSION_COOKIE}=${encoded}`)?.libraryId,
  'lib-1',
);

function req(headers) {
  return {headers: {get: name => headers[name.toLowerCase()] ?? null}};
}

process.env.ATLAS_RUNTIME_ID = 'rt-1';
process.env.ATLAS_LIBRARY_ID = 'lib-1';

assert.equal(runtimeHeaderMismatch(req({})), 'missing');
assert.equal(
  runtimeSessionMismatch(
    req({cookie: `${cookie.RUNTIME_SESSION_COOKIE}=${cookie.encodeRuntimeSessionCookie('rt-1', 'lib-1')}`}),
  ),
  null,
  'matching cookie allowed for media session check',
);
assert.equal(
  runtimeSessionMismatch(
    req({cookie: `${cookie.RUNTIME_SESSION_COOKIE}=${cookie.encodeRuntimeSessionCookie('rt-old', 'lib-1')}`}),
  ).expected.runtimeId,
  'rt-1',
  'wrong cookie rejected',
);
assert.equal(runtimeSessionMismatch(req({})), 'missing');
assert.equal(
  runtimeHeaderMismatch(
    req({cookie: `${cookie.RUNTIME_SESSION_COOKIE}=${cookie.encodeRuntimeSessionCookie('rt-1', 'lib-1')}`}),
  ),
  'missing',
  'JSON APIs still require headers even with cookie',
);
assert.equal(
  runtimeSessionMismatch(req({'x-atlas-runtime': 'rt-1', 'x-atlas-library': 'lib-1'})),
  null,
);

console.log('PASS: runtime session cookie + media session mismatch');
