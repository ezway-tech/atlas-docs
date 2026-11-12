'use client';

import {useCallback, useEffect, useId, useState} from 'react';
import {BookOpen, FolderOpen, FolderPlus, Library, Pencil, RefreshCw, Trash2, X} from 'lucide-react';
import {Button, Input} from './ui/controls';
import {Dialog} from './ui/dialog';
import {useLocale} from './LocaleProvider';
import {
  clearAtlasSession,
  isAtlasDisconnected,
  libraryApi,
  waitForLibraryRuntime,
  type AtlasSession,
} from '@/lib/atlas-client';
type Caps = {
  mode: string;
  canBrowse: boolean;
  canCreate: boolean;
  canSwitch: boolean;
  canDemo: boolean;
  fixedExplanation: string | null;
  defaultParentDir: string;
  browseNote: string;
  switchError?: string | null;
};

type RecentEntry = {
  id: string;
  path: string;
  displayName: string;
  lastOpenedAt: string | null;
  current: boolean;
  status: string;
};

type BrowseResult = {
  path: string;
  parent: string | null;
  breadcrumbs: {name: string; path: string}[];
  directories: {name: string; path: string; kind: string}[];
  truncated: boolean;
};

type Props = {
  embedded?: boolean;
  onClose?: () => void;
  session?: AtlasSession | null;
};

export default function LibraryManager({embedded, onClose, session: initialSession}: Props) {
  const {t} = useLocale();
  const titleId = useId();
  const [caps, setCaps] = useState<Caps | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'home' | 'open' | 'create' | null>(embedded ? 'home' : 'home');
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [createName, setCreateName] = useState('');
  const [createParent, setCreateParent] = useState('');
  const [previewPath, setPreviewPath] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [session, setSession] = useState<AtlasSession | null>(initialSession || null);

  const refresh = useCallback(async () => {
    // Never force-load a new session during refresh — a stale tab must stay
    // disconnected instead of silently adopting the active runtime.
    const capabilities = await libraryApi<Caps>('/api/libraries/capabilities');
    if (isAtlasDisconnected()) return;
    const list = await libraryApi<{libraries: RecentEntry[]; recovery?: {message: string} | null}>(
      '/api/libraries/recent',
    );
    if (isAtlasDisconnected()) return;
    setCaps(capabilities);
    setRecent(list.libraries || []);
    setCreateParent(capabilities.defaultParentDir);
    if (list.recovery?.message) setError(list.recovery.message);
    if (capabilities.switchError) setError(capabilities.switchError);
  }, []);
  useEffect(() => {
    refresh().catch(e => setError((e as Error).message));
  }, [refresh]);

  async function openBrowse(target?: string) {
    setBusy(true);
    setError('');
    try {
      const data = await libraryApi<BrowseResult>(
        '/api/libraries/browse?path=' + encodeURIComponent(target || createParent || caps?.defaultParentDir || ''),
      );
      setBrowse(data);
      setPathInput(data.path);
      setPanel('open');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function afterSwitch(libraryId: string) {
    const previousRuntimeId = session?.runtimeId || null;
    clearAtlasSession();
    await waitForLibraryRuntime(libraryId, {previousRuntimeId});
    window.location.assign('/');
  }

  async function openPath(target: string) {
    setBusy(true);
    setError('');
    try {
      const inspected = await libraryApi<{openable: boolean; error?: {message: string}; root: string}>(
        '/api/libraries/inspect',
        {method: 'POST', body: JSON.stringify({path: target})},
      );
      if (!inspected.openable) {
        setError(inspected.error?.message || t('libraries.errors.unusable'));
        return;
      }
      const opened = await libraryApi<{root: string; libraryId: string}>('/api/libraries/open', {
        method: 'POST',
        body: JSON.stringify({path: inspected.root}),
      });
      await afterSwitch(opened.libraryId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createLibrary() {
    setBusy(true);
    setError('');
    try {
      const created = await libraryApi<{root: string; libraryId: string}>('/api/libraries/create', {
        method: 'POST',
        body: JSON.stringify({name: createName, parentDir: createParent}),
      });
      await afterSwitch(created.libraryId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function tryDemo() {
    setBusy(true);
    setError('');
    try {
      const created = await libraryApi<{root: string; libraryId: string}>('/api/libraries/demo', {
        method: 'POST',
        body: '{}',
      });
      await afterSwitch(created.libraryId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updatePreview(name: string, parent: string) {
    setCreateName(name);
    setCreateParent(parent);
    if (!name.trim()) {
      setPreviewPath('');
      return;
    }
    try {
      const preview = await libraryApi<{path: string}>('/api/libraries/preview-create', {
        method: 'POST',
        body: JSON.stringify({name, parentDir: parent}),
      });
      setPreviewPath(preview.path);
    } catch {
      setPreviewPath('');
    }
  }

  async function renameEntry(id: string) {
    setBusy(true);
    try {
      await libraryApi('/api/libraries/rename', {method: 'POST', body: JSON.stringify({id, displayName: renameValue})});
      setRenameId(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(id: string) {
    setBusy(true);
    try {
      await libraryApi('/api/libraries/remove', {method: 'POST', body: JSON.stringify({id})});
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fixed = caps && !caps.canSwitch;

  const body = (
    <div className="library-manager" role="region" aria-labelledby={titleId}>
      <div className="library-manager-head">
        <div>
          <p className="library-manager-eyebrow">{t('libraries.eyebrow')}</p>
          <h1 id={titleId}>{t(session?.mode === 'manager' ? 'libraries.welcome.title' : 'libraries.manage.title')}</h1>
          <p>{t('libraries.welcome.blurb')}</p>
          {caps?.browseNote && <p className="library-manager-note">{caps.browseNote}</p>}
        </div>
        {onClose && (
          <Button className="icon" aria-label={t('common.close')} onClick={onClose}>
            <X size={18} />
          </Button>
        )}
      </div>

      {error && (
        <div className="library-manager-error" role="alert">
          {error}
        </div>
      )}
      {fixed && caps?.fixedExplanation && (
        <div className="library-manager-error" role="status">
          {caps.fixedExplanation}
        </div>
      )}

      {panel === 'home' && (
        <>
          <div className="library-manager-actions">
            <Button className="btn primary" disabled={busy || !!fixed} onClick={() => openBrowse()}>
              <FolderOpen size={16} /> {t('libraries.actions.open')}
            </Button>
            <Button
              className="btn"
              disabled={busy || !!fixed}
              onClick={() => {
                setPanel('create');
                updatePreview(createName, createParent || caps?.defaultParentDir || '');
              }}
            >
              <FolderPlus size={16} /> {t('libraries.actions.create')}
            </Button>
            <Button className="btn" disabled={busy || !!fixed} onClick={tryDemo}>
              <BookOpen size={16} /> {t('libraries.actions.demo')}
            </Button>
            <Button className="btn" disabled={busy} onClick={() => refresh()} aria-label={t('libraries.actions.refresh')}>
              <RefreshCw size={16} />
            </Button>
          </div>

          <h2>{t('libraries.recent.title')}</h2>
          {recent.length === 0 ? (
            <p className="library-manager-empty">{t('libraries.recent.empty')}</p>
          ) : (
            <ul className="library-manager-list">
              {recent.map(entry => (
                <li key={entry.id} className={entry.current ? 'current' : ''}>
                  <div>
                    <strong>{entry.displayName}</strong>
                    <span className={'status status-' + entry.status}>{t(('libraries.status.' + entry.status) as 'libraries.status.available')}</span>
                    <code title={entry.path}>{entry.path}</code>
                  </div>
                  <div className="library-manager-row-actions">
                    <Button
                      className="btn primary"
                      disabled={busy || !!fixed || entry.status === 'in_use' || entry.status === 'missing'}
                      onClick={() => openPath(entry.path)}
                    >
                      {t('libraries.actions.openLibrary')}
                    </Button>
                    <Button
                      className="icon"
                      aria-label={t('libraries.actions.rename')}
                      disabled={busy || !!fixed}
                      onClick={() => {
                        setRenameId(entry.id);
                        setRenameValue(entry.displayName);
                      }}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      className="icon"
                      aria-label={t('libraries.actions.removeRecent')}
                      disabled={busy || !!fixed}
                      onClick={() => removeEntry(entry.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {panel === 'open' && browse && (
        <div className="library-picker">
          <label className="library-field">
            <span>{t('libraries.picker.path')}</span>
            <Input
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') openBrowse(pathInput);
              }}
            />
          </label>
          <div className="library-picker-toolbar">
            <Button className="btn" disabled={!browse.parent || busy} onClick={() => openBrowse(browse.parent || undefined)}>
              {t('libraries.picker.up')}
            </Button>
            <Button className="btn" disabled={busy} onClick={() => openBrowse(pathInput)}>
              {t('libraries.picker.go')}
            </Button>
            <Button className="btn primary" disabled={busy} onClick={() => openPath(pathInput)}>
              {t('libraries.actions.openLibrary')}
            </Button>
            <Button className="btn" onClick={() => setPanel('home')}>
              {t('common.cancel')}
            </Button>
          </div>
          <nav className="library-breadcrumbs" aria-label={t('libraries.picker.breadcrumb')}>
            {browse.breadcrumbs.map(crumb => (
              <button key={crumb.path} type="button" onClick={() => openBrowse(crumb.path)}>
                {crumb.name}
              </button>
            ))}
          </nav>
          {busy && <p>{t('common.loading')}</p>}
          {!busy && browse.directories.length === 0 && <p className="library-manager-empty">{t('libraries.picker.empty')}</p>}
          <ul className="library-manager-list">
            {browse.directories.map(dir => (
              <li key={dir.path}>
                <button type="button" className="library-dir" onClick={() => openBrowse(dir.path)} onDoubleClick={() => openPath(dir.path)}>
                  <Library size={16} /> {dir.name}
                </button>
              </li>
            ))}
          </ul>
          {browse.truncated && <p className="library-manager-note">{t('libraries.picker.truncated')}</p>}
        </div>
      )}

      {panel === 'create' && (
        <div className="library-picker">
          <label className="library-field">
            <span>{t('libraries.create.name')}</span>
            <Input
              value={createName}
              onChange={e => updatePreview(e.target.value, createParent)}
              autoFocus
            />
          </label>
          <label className="library-field">
            <span>{t('libraries.create.parent')}</span>
            <Input value={createParent} onChange={e => updatePreview(createName, e.target.value)} />
          </label>
          <Button className="btn" disabled={busy} onClick={() => openBrowse(createParent)}>
            {t('libraries.create.browseParent')}
          </Button>
          {previewPath && (
            <p className="library-manager-note">
              {t('libraries.create.preview')}: <code>{previewPath}</code>
            </p>
          )}
          <div className="library-picker-toolbar">
            <Button className="btn primary" disabled={busy || !createName.trim()} onClick={createLibrary}>
              {t('libraries.actions.createConfirm')}
            </Button>
            <Button className="btn" onClick={() => setPanel('home')}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {renameId && (
        <Dialog open onOpenChange={open => !open && setRenameId(null)} title={t('libraries.actions.rename')}>
          <div className="modal" data-ui-block-shortcuts="">
            <div className="modal-heading">
              <h2>{t('libraries.actions.rename')}</h2>
            </div>
            <label className="library-field">
              <span>{t('libraries.create.name')}</span>
              <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} />
            </label>
            <div className="modal-actions">
              <Button className="btn primary" onClick={() => renameEntry(renameId)}>
                {t('common.save')}
              </Button>
              <Button className="btn" onClick={() => setRenameId(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );

  if (embedded) return body;
  return <div className="library-manager-page">{body}</div>;
}
