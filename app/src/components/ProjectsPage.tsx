'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {loadAtlasSession, type AtlasSession} from '@/lib/atlas-client';
import {applyUiTheme, readUiTheme, writeUiTheme} from '@/lib/ui-theme';
import LibraryManager from './LibraryManager';
import HelpMenu from './HelpMenu';
import WorkspaceLoading from './WorkspaceLoading';
import AppHeader from './AppHeader';
import AppBrand from './AppBrand';
import LocaleMenu from './LocaleMenu';
import ThemeToggle from './ThemeToggle';

export default function ProjectsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AtlasSession | null>(null);
  const [error, setError] = useState('');
  const [dark, setDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAtlasSession(true)
      .then(s => {
        if (!cancelled) setSession(s);
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      const nextDark = await readUiTheme({useSettings: !!session.libraryRoot});
      if (cancelled) return;
      setDark(applyUiTheme(nextDark));
      setThemeReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    void writeUiTheme(next, {persistSettings: !!session?.libraryRoot});
  };

  const enter = () => {
    if (!session?.libraryRoot) return;
    sessionStorage.setItem('atlas-recovery-accepted', session.runtimeId);
    router.push('/workspace');
  };

  if (!session && !error) return <WorkspaceLoading />;

  return (
    <div className="projects-page">
      <AppHeader
        lead={<AppBrand />}
        trail={
          <>
            <LocaleMenu />
            <ThemeToggle dark={dark} onToggle={toggleTheme} disabled={!themeReady && !!session} />
            <HelpMenu dirty={false} />
          </>
        }
      />
      <main className="projects-layout projects-enter">
        {error ? (
          <p role="alert">{error}</p>
        ) : session ? (
          <LibraryManager embedded session={session} onEnterCurrent={enter} />
        ) : null}
      </main>
    </div>
  );
}
