'use client';

export type AtlasSession = {
  runtimeId: string;
  libraryId: string;
  libraryRoot: string | null;
  mode: 'manager' | 'library' | 'fixed';
  displayName?: string | null;
  switchError?: string | null;
  appVersion?: string;
};

let session: AtlasSession | null = null;
let sessionPromise: Promise<AtlasSession> | null = null;
let disconnected = false;

export function isAtlasDisconnected() {
  return disconnected;
}

export function clearAtlasSession() {
  session = null;
  sessionPromise = null;
}

/** Last loaded session (may be null before first load). Used to stamp media URLs. */
export function peekAtlasSession() {
  return session;
}

export async function loadAtlasSession(force = false): Promise<AtlasSession> {
  if (!force && session) return session;
  if (!force && sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    let lastError: Error | null = null;
    // Dev compile of /api can briefly fail on first hit; retry before surfacing.
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const resp = await fetch('/api/libraries/session', {cache: 'no-store'});
        if (!resp.ok) {
          lastError = Error('Could not load runtime session');
        } else {
          session = (await resp.json()) as AtlasSession;
          disconnected = false;
          return session;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : Error(String(error));
      }
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
    throw lastError || Error('Could not load runtime session');
  })();
  try {
    return await sessionPromise;
  } finally {
    sessionPromise = null;
  }
}

export async function atlasFetch(input: string, init: RequestInit = {}) {
  const current = await loadAtlasSession();
  const headers = new Headers(init.headers || {});
  headers.set('X-Atlas-Runtime', current.runtimeId);
  headers.set('X-Atlas-Library', current.libraryId);
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const resp = await fetch(input, {...init, headers, cache: init.cache || 'no-store'});
  if (resp.status === 409) {
    let data: {errorKey?: string; error?: string} = {};
    try {
      data = await resp.clone().json();
    } catch {
      // ignore
    }
    if (data.errorKey === 'errors.library.staleRuntime' || data.errorKey === 'errors.library.required') {
      disconnected = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('atlas:disconnected', {detail: data}));
      }
    }
  }
  return resp;
}

export async function atlasJson<T>(input: string, init?: RequestInit): Promise<T> {
  const resp = await atlasFetch(input, init);
  let data: {error?: string} = {};
  try {
    data = await resp.json();
  } catch {
    throw Error('Response is not JSON');
  }
  if (!resp.ok) throw Error(data.error || resp.statusText);
  return data as T;
}

export async function libraryApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set('X-Atlas-Library-Api', '1');
  return atlasJson<T>(path, {...init, headers});
}

export type LibraryReady = {
  ok?: boolean;
  mode?: string;
  libraryId?: string;
  root?: string | null;
};

/** Pure match used after switch — libraryId + new runtimeId + ready endpoint. */
export function runtimeMatchesSwitch(
  session: AtlasSession | null,
  ready: LibraryReady | null,
  expectedLibraryId: string,
  previousRuntimeId: string | null,
) {
  if (!session || !ready) return false;
  if (session.mode !== 'library') return false;
  if (session.libraryId !== expectedLibraryId) return false;
  if (previousRuntimeId && session.runtimeId === previousRuntimeId) return false;
  if (!ready.ok || ready.libraryId !== expectedLibraryId) return false;
  return true;
}

/** After a switch is accepted, poll until the new runtime session and ready match. */
export async function waitForLibraryRuntime(
  expectedLibraryId: string,
  {timeoutMs = 60_000, previousRuntimeId = null as string | null} = {},
) {
  const started = Date.now();
  clearAtlasSession();
  while (Date.now() - started < timeoutMs) {
    try {
      const next = await loadAtlasSession(true);
      let ready: LibraryReady | null = null;
      try {
        const resp = await fetch('/api/libraries/ready', {cache: 'no-store'});
        if (resp.ok) ready = (await resp.json()) as LibraryReady;
      } catch {
        ready = null;
      }
      if (runtimeMatchesSwitch(next, ready, expectedLibraryId, previousRuntimeId)) return next;
    } catch {
      // runtime restarting
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw Error('Timed out waiting for the library runtime');
}
