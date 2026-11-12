import '../helpers/environment.mjs';
import assert from 'node:assert/strict';
import {loadTs} from '../helpers/load-ts.mjs';

const {assertLocalAppRequest} = await loadTs('src/lib/local-request.ts');

function req(headers, protocol = 'http:') {
  return {
    headers: {get: name => headers[name.toLowerCase()] ?? null},
    nextUrl: {protocol},
  };
}

const okHeaders = {
  host: '127.0.0.1:17430',
  'x-atlas-library-api': '1',
  'sec-fetch-site': 'same-origin',
};

assert.equal(assertLocalAppRequest(req(okHeaders), 'x-atlas-library-api', '1'), true, 'same-origin without Origin');
assert.equal(
  assertLocalAppRequest(
    req({...okHeaders, origin: 'http://127.0.0.1:17430'}),
    'x-atlas-library-api',
    '1',
  ),
  true,
  'matching Origin',
);
assert.equal(
  assertLocalAppRequest(
    req({...okHeaders, origin: 'http://evil.example'}),
    'x-atlas-library-api',
    '1',
  ),
  false,
  'mismatched Origin',
);
assert.equal(
  assertLocalAppRequest(
    req({...okHeaders, 'sec-fetch-site': 'cross-site', origin: 'http://127.0.0.1:17430'}),
    'x-atlas-library-api',
    '1',
  ),
  false,
  'cross-site rejected',
);
assert.equal(
  assertLocalAppRequest(req({host: 'example.com', 'x-atlas-library-api': '1'}), 'x-atlas-library-api', '1'),
  false,
  'non-local host',
);
assert.equal(
  assertLocalAppRequest(req({host: '127.0.0.1:17430', 'sec-fetch-site': 'same-origin'}), 'x-atlas-library-api', '1'),
  false,
  'missing app header',
);

console.log('PASS: local-request origin/host rules');
