import {atlasJson} from '@/lib/atlas-client';

export const UI_THEME_KEY = 'atlas-ui-theme';
const LEGACY_KEYS = ['atlas-projects-theme', 'atlas-help-theme'] as const;

function readStoredTheme(): 'dark' | 'light' | null {
  const primary = localStorage.getItem(UI_THEME_KEY);
  if (primary === 'dark' || primary === 'light') return primary;
  for (const key of LEGACY_KEYS) {
    const value = localStorage.getItem(key);
    if (value === 'dark' || value === 'light') return value;
  }
  return null;
}

/** Apply theme class on <html>. Returns whether dark is active. */
export function applyUiTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  return dark;
}

/** Resolve initial theme: settings when library is open, else localStorage (with legacy keys). */
export async function readUiTheme(options?: {useSettings?: boolean}): Promise<boolean> {
  if (options?.useSettings) {
    try {
      const settings = await atlasJson<{theme?: string}>('/api/settings');
      return settings.theme === 'dark';
    } catch {
      // Fall through to stored / document theme.
    }
  }
  const stored = readStoredTheme();
  if (stored) return stored === 'dark';
  return document.documentElement.classList.contains('dark');
}

/** Persist theme to settings and/or localStorage, and update the document class. */
export async function writeUiTheme(
  dark: boolean,
  options?: {persistSettings?: boolean},
): Promise<void> {
  applyUiTheme(dark);
  const value = dark ? 'dark' : 'light';
  localStorage.setItem(UI_THEME_KEY, value);
  if (options?.persistSettings) {
    try {
      await atlasJson('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({theme: value}),
      });
    } catch {
      // Local preference still applied.
    }
  }
}
