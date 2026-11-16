'use client';

import {useSyncExternalStore} from 'react';

/**
 * Shared layout breakpoints for Atlas Docs.
 * Keep CSS media queries in sync with these values:
 * - narrow / topbar mobile: max-width 700px
 * - header compact (icon trail + chrome in menu): max-width 900px
 * - panel overlay (nav + TOC/comments on demand): max-width 1000px
 */
export const LAYOUT = {
  narrow: 700,
  headerCompact: 900,
  panelOverlay: 1000,
  minMain: 360,
  leftMin: 215,
  leftMax: 530,
  rightMin: 215,
  rightMax: 610,
} as const;

export type LayoutBand = 'narrow' | 'mid' | 'wide';

export type LayoutState = {
  band: LayoutBand;
  /** ≤700 */
  isNarrow: boolean;
  /** ≤900 — compact topbar chrome */
  headerCompact: boolean;
  /** ≤1000 — side panels are overlays/drawers */
  overlayPanels: boolean;
};

const serverSnapshot: LayoutState = {
  band: 'wide',
  isNarrow: false,
  headerCompact: false,
  overlayPanels: false,
};

let cached: LayoutState = serverSnapshot;

function readLayout(): LayoutState {
  if (typeof window === 'undefined') return serverSnapshot;
  const w = window.innerWidth;
  const isNarrow = w <= LAYOUT.narrow;
  const headerCompact = w <= LAYOUT.headerCompact;
  const overlayPanels = w <= LAYOUT.panelOverlay;
  const band: LayoutBand = isNarrow ? 'narrow' : overlayPanels ? 'mid' : 'wide';
  if (
    cached.band === band &&
    cached.isNarrow === isNarrow &&
    cached.headerCompact === headerCompact &&
    cached.overlayPanels === overlayPanels
  ) {
    return cached;
  }
  cached = {band, isNarrow, headerCompact, overlayPanels};
  return cached;
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mqNarrow = window.matchMedia(`(max-width:${LAYOUT.narrow}px)`);
  const mqHeader = window.matchMedia(`(max-width:${LAYOUT.headerCompact}px)`);
  const mqOverlay = window.matchMedia(`(max-width:${LAYOUT.panelOverlay}px)`);
  const notify = () => onStoreChange();
  mqNarrow.addEventListener('change', notify);
  mqHeader.addEventListener('change', notify);
  mqOverlay.addEventListener('change', notify);
  window.addEventListener('resize', notify);
  return () => {
    mqNarrow.removeEventListener('change', notify);
    mqHeader.removeEventListener('change', notify);
    mqOverlay.removeEventListener('change', notify);
    window.removeEventListener('resize', notify);
  };
}

/** Subscribe to viewport layout bands used by Workspace chrome and panels. */
export function useLayoutBand(): LayoutState {
  return useSyncExternalStore(subscribe, readLayout, () => serverSnapshot);
}
