export type MediaSessionIds = {
  runtimeId?: string | null;
  libraryId?: string | null;
};

const MEDIA_PATH = /^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;

/** Build a media URL with runtime/library query so browser subresources prove the active session. */
export function mediaUrl(
  id: string,
  session: MediaSessionIds,
  opts?: {download?: boolean | string; v?: string | number},
) {
  const params = new URLSearchParams();
  if (session.runtimeId) params.set('rt', session.runtimeId);
  if (session.libraryId) params.set('lib', session.libraryId);
  if (opts?.download === true || opts?.download === '1') params.set('download', '1');
  else if (typeof opts?.download === 'string' && opts.download) params.set('download', opts.download);
  if (opts?.v != null && opts.v !== '') params.set('v', String(opts.v));
  const q = params.toString();
  return q ? `/api/media/${id}?${q}` : `/api/media/${id}`;
}

function rewriteMediaPath(src: string, rewrite: (url: URL) => void) {
  if (!src) return src;
  let url: URL;
  try {
    url = new URL(src, 'http://atlas.local');
  } catch {
    return src;
  }
  if (!MEDIA_PATH.exec(url.pathname)) return src;
  rewrite(url);
  const path = url.pathname + (url.search ? url.search : '') + (url.hash || '');
  // Absolute http(s) inputs keep origin; relative inputs stay path-only.
  if (/^https?:\/\//i.test(src)) return `${url.protocol}//${url.host}${path}`;
  return path;
}

/**
 * Rewrite an href/src that points at /api/media/{uuid} so it carries the current session ids.
 * Leaves non-media URLs unchanged. Preserves download/v and other query keys.
 */
export function withMediaSession(src: string, session: MediaSessionIds) {
  if (!src || (!session.runtimeId && !session.libraryId)) return src;
  return rewriteMediaPath(src, url => {
    if (session.runtimeId) url.searchParams.set('rt', session.runtimeId);
    if (session.libraryId) url.searchParams.set('lib', session.libraryId);
  });
}

/** Drop runtime/library query from media URLs so Markdown/attrs never persist session ids. */
export function stripMediaSession(src: string) {
  return rewriteMediaPath(src, url => {
    url.searchParams.delete('rt');
    url.searchParams.delete('lib');
  });
}

/** Strip rt/lib from any /api/media/{uuid} links inside Markdown text. */
export function stripMediaSessionsInMarkdown(markdown: string) {
  if (!markdown) return markdown;
  return markdown.replace(
    /\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\?[^)\s]*/gi,
    match => stripMediaSession(match),
  );
}
