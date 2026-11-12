import '../helpers/environment.mjs';
import assert from 'node:assert/strict';
import {loadTs} from '../helpers/load-ts.mjs';

const {runtimeSessionMismatch, runtimeHeaderMismatch} = await loadTs('src/lib/local-request.ts');
const {mediaUrl, withMediaSession, stripMediaSession, stripMediaSessionsInMarkdown} = await loadTs('src/lib/media-url.ts');

assert.equal(
  mediaUrl('11111111-1111-1111-1111-111111111111', {runtimeId: 'rt-a', libraryId: 'lib-a'}),
  '/api/media/11111111-1111-1111-1111-111111111111?rt=rt-a&lib=lib-a',
);
assert.equal(
  withMediaSession('/api/media/11111111-1111-1111-1111-111111111111?download=1', {
    runtimeId: 'rt-b',
    libraryId: 'lib-b',
  }),
  '/api/media/11111111-1111-1111-1111-111111111111?download=1&rt=rt-b&lib=lib-b',
);
assert.equal(
  stripMediaSession('/api/media/11111111-1111-1111-1111-111111111111?rt=rt-a&lib=lib-a&download=1'),
  '/api/media/11111111-1111-1111-1111-111111111111?download=1',
  'strip drops rt/lib but keeps other query keys',
);
assert.equal(
  stripMediaSession('/api/media/11111111-1111-1111-1111-111111111111?rt=rt-a&lib=lib-a'),
  '/api/media/11111111-1111-1111-1111-111111111111',
);
assert.equal(
  withMediaSession(
    stripMediaSession('/api/media/11111111-1111-1111-1111-111111111111?rt=old&lib=old&v=2'),
    {runtimeId: 'rt-new', libraryId: 'lib-new'},
  ),
  '/api/media/11111111-1111-1111-1111-111111111111?v=2&rt=rt-new&lib=lib-new',
);
assert.equal(
  stripMediaSessionsInMarkdown(
    '![x](/api/media/11111111-1111-1111-1111-111111111111?rt=a&lib=b&download=1) see /docs',
  ),
  '![x](/api/media/11111111-1111-1111-1111-111111111111?download=1) see /docs',
);
assert.notEqual(
  mediaUrl('11111111-1111-1111-1111-111111111111', {runtimeId: 'rt-a', libraryId: 'lib-a'}),
  mediaUrl('11111111-1111-1111-1111-111111111111', {runtimeId: 'rt-b', libraryId: 'lib-b'}),
  'different sessions produce different media URLs (no shared cookie)',
);

function req(headers, search = '') {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return {
    headers: {get: name => headers[name.toLowerCase()] ?? null},
    nextUrl: {searchParams: params, protocol: 'http:'},
  };
}

process.env.ATLAS_RUNTIME_ID = 'rt-1';
process.env.ATLAS_LIBRARY_ID = 'lib-1';

assert.equal(runtimeHeaderMismatch(req({})), 'missing');
assert.equal(runtimeSessionMismatch(req({}, 'rt=rt-1&lib=lib-1')), null, 'matching query allowed');
assert.equal(
  runtimeSessionMismatch(req({}, 'rt=rt-old&lib=lib-1')).expected.runtimeId,
  'rt-1',
  'wrong query rejected',
);
assert.equal(runtimeSessionMismatch(req({})), 'missing');
assert.equal(
  runtimeHeaderMismatch(req({}, 'rt=rt-1&lib=lib-1')),
  'missing',
  'JSON APIs still require headers even with query',
);
assert.equal(
  runtimeSessionMismatch(req({'x-atlas-runtime': 'rt-1', 'x-atlas-library': 'lib-1'})),
  null,
);

console.log('PASS: media URL rt/lib session mismatch');
