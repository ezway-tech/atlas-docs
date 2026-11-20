/** Browser-local skip for update notice (not library data). */

export const SKIPPED_UPDATE_KEY = 'atlas.docs.skippedUpdate';

export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

export function readSkippedUpdate(): string | null {
  try {
    const value = localStorage.getItem(SKIPPED_UPDATE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writeSkippedUpdate(version: string): void {
  try {
    localStorage.setItem(SKIPPED_UPDATE_KEY, version);
  } catch {
    /* storage full or blocked */
  }
}

export function clearSkippedUpdate(): void {
  try {
    localStorage.removeItem(SKIPPED_UPDATE_KEY);
  } catch {
    /* storage blocked */
  }
}

/** True when registry has a newer version the user has not skipped. */
export function updateNoticeActive(latestVersion: string | undefined, updateAvailable: boolean, skipped: string | null): boolean {
  if (!updateAvailable || !latestVersion) return false;
  if (!skipped) return true;
  return isNewerVersion(latestVersion, skipped);
}
