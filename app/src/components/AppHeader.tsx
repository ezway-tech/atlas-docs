'use client';

import type {ReactNode} from 'react';

/** Shared top chrome. Lead / center / trail map to Workspace topbar regions. */
export default function AppHeader({
  lead,
  center,
  trail,
  className,
}: {
  lead?: ReactNode;
  center?: ReactNode;
  trail?: ReactNode;
  className?: string;
}) {
  return (
    <header className={['topbar', className].filter(Boolean).join(' ')}>
      {lead}
      {center}
      {trail ? <div className="top-actions">{trail}</div> : null}
    </header>
  );
}
