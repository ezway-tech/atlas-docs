import type {NextRequest} from 'next/server';

/**
 * Same-origin local browser request guard used by library management and update APIs.
 * Chromium often omits Origin on same-origin GET; require Host local and reject cross-site.
 * When Origin is present it must match this app. App-specific header is always required.
 */
export function assertLocalAppRequest(req: NextRequest, headerName: string, headerValue: string) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  const localHost = host && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  if (!localHost) return false;
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false;
  if (req.headers.get(headerName.toLowerCase()) !== headerValue) return false;
  if (origin != null && origin !== '') {
    if (origin !== `${req.nextUrl.protocol}//${host}`) return false;
  } else {
    const site = req.headers.get('sec-fetch-site');
    // Missing Origin is OK for same-origin navigation/fetch, none, or non-browser clients.
    if (site != null && site !== '' && site !== 'same-origin' && site !== 'none') return false;
  }
  return true;
}

type StaleRuntime = {
  code: 'runtime.stale';
  message: string;
  expected: {runtimeId: string; libraryId: string};
  received: {runtimeId: string | null; libraryId: string | null};
};

function staleResult(
  expectedRuntime: string,
  expectedLibrary: string,
  gotRuntime: string | null,
  gotLibrary: string | null,
): StaleRuntime {
  return {
    code: 'runtime.stale',
    message:
      'This tab is connected to a previous library runtime. Copy any unsaved draft, then reload or open the library again.',
    expected: {runtimeId: expectedRuntime, libraryId: expectedLibrary},
    received: {runtimeId: gotRuntime, libraryId: gotLibrary},
  };
}

/** Header-only session check (JSON APIs / mutations). */
export function runtimeHeaderMismatch(req: NextRequest) {
  const expectedRuntime = process.env.ATLAS_RUNTIME_ID;
  const expectedLibrary = process.env.ATLAS_LIBRARY_ID;
  if (!expectedRuntime || !expectedLibrary) return null;
  const gotRuntime = req.headers.get('x-atlas-runtime');
  const gotLibrary = req.headers.get('x-atlas-library');
  if (!gotRuntime && !gotLibrary) return 'missing' as const;
  if (gotRuntime !== expectedRuntime || gotLibrary !== expectedLibrary) {
    return staleResult(expectedRuntime, expectedLibrary, gotRuntime, gotLibrary);
  }
  return null;
}

/**
 * Session check for browser media bytes: matching headers, else matching rt/lib query params.
 * Query ids are per-URL so tabs/ports do not share a hostname-wide cookie.
 */
export function runtimeSessionMismatch(req: NextRequest) {
  const expectedRuntime = process.env.ATLAS_RUNTIME_ID;
  const expectedLibrary = process.env.ATLAS_LIBRARY_ID;
  if (!expectedRuntime || !expectedLibrary) return null;
  const gotRuntime = req.headers.get('x-atlas-runtime');
  const gotLibrary = req.headers.get('x-atlas-library');
  if (gotRuntime || gotLibrary) {
    if (gotRuntime !== expectedRuntime || gotLibrary !== expectedLibrary) {
      return staleResult(expectedRuntime, expectedLibrary, gotRuntime, gotLibrary);
    }
    return null;
  }
  const qRuntime = req.nextUrl.searchParams.get('rt');
  const qLibrary = req.nextUrl.searchParams.get('lib');
  if (!qRuntime && !qLibrary) return 'missing' as const;
  if (qRuntime !== expectedRuntime || qLibrary !== expectedLibrary) {
    return staleResult(expectedRuntime, expectedLibrary, qRuntime, qLibrary);
  }
  return null;
}
