/** Cookie that lets browser subresources (img/video) prove the active library runtime. */
export const RUNTIME_SESSION_COOKIE = 'atlas_rt';

export function encodeRuntimeSessionCookie(runtimeId: string, libraryId: string) {
  return `${encodeURIComponent(runtimeId)}|${encodeURIComponent(libraryId)}`;
}

export function parseRuntimeSessionCookie(raw: string | null | undefined) {
  if (!raw) return null;
  const value = raw.includes('%') ? decodeURIComponent(raw) : raw;
  const sep = value.indexOf('|');
  if (sep <= 0 || sep === value.length - 1) return null;
  const runtimeId = value.slice(0, sep);
  const libraryId = value.slice(sep + 1);
  if (!runtimeId || !libraryId) return null;
  return {runtimeId, libraryId};
}

export function runtimeSessionCookieHeader(runtimeId: string, libraryId: string) {
  const value = encodeRuntimeSessionCookie(runtimeId, libraryId);
  return `${RUNTIME_SESSION_COOKIE}=${value}; Path=/; SameSite=Lax; HttpOnly`;
}

export function clearRuntimeSessionCookieHeader() {
  return `${RUNTIME_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
}

export function readRuntimeSessionCookie(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const re = new RegExp(`(?:^|;\\s*)${RUNTIME_SESSION_COOKIE}=([^;]+)`);
  const match = cookieHeader.match(re);
  return parseRuntimeSessionCookie(match?.[1] ?? null);
}
