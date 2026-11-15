'use client';

import {useCallback, useEffect, useId, useState} from 'react';
import {FolderOpen, FolderPlus, Library, MoreHorizontal, Copy, FolderOpen as RevealFolder, X} from 'lucide-react';
import {Button, Input} from './ui/controls';
import {Dialog, ConfirmDialog} from './ui/dialog';
import {DropdownMenu, MenuItem} from './ui/patterns';
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
  canReveal: boolean;
  canPickFolder: boolean;
  canRelocateRecent?: boolean;
  defaultParentDir: string;
  defaultBrowseDir: string;
  switchError?: string | null;
};

type RecentEntry = {
  id: string;
  path: string;
  displayName: string;
  lastOpenedAt: string | null;
  current: boolean;
  isExample?: boolean;
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
  onEnterCurrent?: () => void;
  session?: AtlasSession | null;
};

export default function LibraryManager({embedded, onClose, onEnterCurrent, session: initialSession}: Props) {
  const {t} = useLocale();
  const titleId = useId();
  const [caps, setCaps] = useState<Caps | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [missingOpen, setMissingOpen] = useState(false);
  const [confirmMissing, setConfirmMissing] = useState(false);
  const [missingError, setMissingError] = useState('');
  const [missing, setMissing] = useState<RecentEntry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'home' | 'open' | 'create'>('home');
  const [pickingParent, setPickingParent] = useState(false);
  const [relocateId, setRelocateId] = useState<string | null>(null);
  const [pendingEmpty, setPendingEmpty] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exampleError, setExampleError] = useState<string | null>(null);
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [createName, setCreateName] = useState('');
  const [createParent, setCreateParent] = useState('');
  const [previewPath, setPreviewPath] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [session, setSession] = useState<AtlasSession | null>(initialSession || null);

  const refresh = useCallback(async () => {
    const capabilities = await libraryApi<Caps>('/api/libraries/capabilities');
    if (isAtlasDisconnected()) return;
    const list = await libraryApi<{
      libraries: RecentEntry[];
      missing?: RecentEntry[];
      exampleError?: string | null;
      recovery?: {message: string} | null;
    }>('/api/libraries/recent');
    if (isAtlasDisconnected()) return;
    setCaps(capabilities);
    setRecent(list.libraries || []);
    setExampleError(list.exampleError || null);
    setMissing(list.missing || []);
    setCreateParent(capabilities.defaultParentDir);
    if (list.recovery?.message) setError(list.recovery.message);
    if (capabilities.switchError) setError(capabilities.switchError);
  }, []);

  useEffect(() => {
    refresh().catch(e => setError((e as Error).message));
  }, [refresh]);

  async function afterSwitch(libraryId: string) {
    const previousRuntimeId = session?.runtimeId || null;
    clearAtlasSession();
    try {
      await waitForLibraryRuntime(libraryId, {previousRuntimeId});
    } catch (error) {
      const response = await fetch('/api/libraries/session', {cache: 'no-store'});
      const next = response.ok ? await response.json() : null;
      if (next?.runtimeId !== previousRuntimeId && next?.switchError) {
        window.location.assign('/projects');
        return;
      }
      throw error;
    }
    sessionStorage.setItem('atlas-project-opened', libraryId);
    window.location.assign('/workspace');
  }

  async function openBrowse(target?: string) {
    setBusy(true);
    setError('');
    try {
      const data = await libraryApi<BrowseResult>(
        '/api/libraries/browse?path=' + encodeURIComponent(target || caps?.defaultBrowseDir || createParent || ''),
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

  async function pickFolder(title: string, startPath?: string) {
    if (!caps?.canPickFolder) {
      await openBrowse(startPath);
      return null;
    }
    setBusy(true);
    setError('');
    try {
      const picked = await libraryApi<{cancelled: boolean; path: string | null; error?: {message: string}}>(
        '/api/libraries/pick-folder',
        {method: 'POST', body: JSON.stringify({title, startPath})},
      );
      if (picked.cancelled) return null;
      if (picked.error) {
        setError(picked.error.message);
        return null;
      }
      return picked.path;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function openPath(target: string, displayName?: string) {
    setBusy(true);
    setError('');
    setPendingEmpty(null);
    try {
      if (target === session?.libraryRoot) {
        onClose?.();
        return;
      }
      const inspected = await libraryApi<{
        openable: boolean;
        inspection: {state: string};
        error?: {message: string};
        root: string;
        canInitialize?: boolean;
      }>('/api/libraries/inspect', {method: 'POST', body: JSON.stringify({path: target})});
      if (!inspected.openable) {
        if (inspected.canInitialize || inspected.inspection.state === 'empty') {
          setPendingEmpty(inspected.root);
          return;
        }
        setError(inspected.error?.message || t('libraries.errors.unusable'));
        return;
      }
      const opened = await libraryApi<{root: string; libraryId: string}>('/api/libraries/open', {
        method: 'POST',
        body: JSON.stringify({path: inspected.root, displayName}),
      });
      await afterSwitch(opened.libraryId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmInitializeEmpty() {
    if (!pendingEmpty) return;
    setBusy(true);
    setError('');
    try {
      const created = await libraryApi<{libraryId: string}>('/api/libraries/initialize-empty', {
        method: 'POST',
        body: JSON.stringify({path: pendingEmpty, confirm: true}),
      });
      setPendingEmpty(null);
      await afterSwitch(created.libraryId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function beginOpenProject() {
    const path = await pickFolder(t('libraries.pick.openTitle'), session?.libraryRoot || caps?.defaultBrowseDir);
    if (!path) return;
    await openPath(path);
  }

  async function beginCreateParentPick() {
    if (!caps?.canPickFolder) {setPickingParent(true); await openBrowse(createParent || caps?.defaultBrowseDir); return;}
    const path = await pickFolder(t('libraries.pick.parentTitle'), createParent || caps?.defaultParentDir);
    if (!path) return;
    setCreateParent(path);
    void updatePreview(createName, path);
  }

  async function beginRelocate(id: string) {
    setRelocateId(id);
    if (!caps?.canPickFolder) {setPickingParent(false); await openBrowse(caps?.defaultBrowseDir); return;}
    const path = await pickFolder(t('libraries.pick.relocateTitle'), caps?.defaultBrowseDir);
    if (!path) {
      setRelocateId(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await libraryApi('/api/libraries/relocate', {
        method: 'POST',
        body: JSON.stringify({id, path}),
      });
      setRelocateId(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setRelocateId(null);
    } finally {
      setBusy(false);
    }
  }

  async function reveal(id?: string) {
    try {
      await libraryApi('/api/libraries/reveal', {method: 'POST', body: JSON.stringify({id})});
    } catch (e) {
      setError((e as Error).message);
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
      await libraryApi('/api/libraries/rename', {
        method: 'POST',
        body: JSON.stringify({id, displayName: renameValue}),
      });
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

  async function removeAllMissing() {
    const selected = new Set(missing.map(entry => entry.id));
    setBusy(true); setMissingError('');
    try {
      const latest = await libraryApi<{missing: RecentEntry[]}>('/api/libraries/recent');
      for (const entry of latest.missing || []) {
        if (selected.has(entry.id)) await libraryApi('/api/libraries/remove', {method: 'POST', body: JSON.stringify({id: entry.id})});
      }
    } catch (e) {setMissingError((e as Error).message);}
    finally {
      try {await refresh();} catch(e) {setMissingError((e as Error).message);}
      setConfirmMissing(false); setBusy(false);
    }
  }

  const fixed = !!caps && !caps.canSwitch;

  const projects = [...recent];
  if (session?.libraryRoot && !projects.some(entry => entry.current)) {
    projects.push({id: '', path: session.libraryRoot, displayName: session.displayName || 'Project',
      current: true, status: 'available', lastOpenedAt: null});
  }
  projects.sort((a, b) => Number(b.isExample) - Number(a.isExample) || (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || ''));

  function renderEntry(entry: RecentEntry, opts: {missing?: boolean} = {}) {
    return <li key={entry.path} className={entry.current ? 'current' : ''} data-example={entry.isExample || undefined}>
      <div className="project-row-main">
        <Button className="project-name" disabled={busy || !!opts.missing || (!entry.current && (fixed || entry.status === 'in_use'))}
          onClick={() => entry.current ? (onEnterCurrent || onClose)?.() : void openPath(entry.path, entry.displayName)}>
          <FolderOpen size={18}/><strong>{entry.isExample ? 'Example' : entry.displayName}</strong>
        </Button>
        <code title={entry.path}>{entry.path}</code>
      </div>
      {entry.current ? <span className="status status-current">{t('libraries.status.current')}</span> : entry.status !== 'available' && !opts.missing ?
        <span className="status">{t(('libraries.status.' + entry.status) as 'libraries.status.available')}</span> : null}
      {opts.missing ? <DropdownMenu align="end" trigger={<Button className="icon" disabled={busy || fixed} aria-label={t('libraries.actions.more', {name: entry.displayName})}><MoreHorizontal size={18}/></Button>}>
        <MenuItem onSelect={() => {setMissingOpen(false); void beginRelocate(entry.id);}}>{t('libraries.actions.relocate')}</MenuItem>
        <MenuItem onSelect={() => void removeEntry(entry.id)}>{t('libraries.actions.removeRecent')}</MenuItem>
      </DropdownMenu> : <DropdownMenu align="end" trigger={<Button className="icon" disabled={busy} aria-label={t('libraries.actions.more', {name: entry.displayName})}><MoreHorizontal size={18}/></Button>}>
        {caps?.canReveal && <MenuItem onSelect={() => void reveal(entry.id || undefined)}><RevealFolder size={16}/>{t('libraries.reveal')}</MenuItem>}
        <MenuItem onSelect={() => {void navigator.clipboard.writeText(entry.path).then(() => setCopied(true)).catch(e => setError(e.message));}}><Copy size={16}/>{t('libraries.copyPath')}</MenuItem>
        {!fixed && entry.id && !entry.isExample && <>
          <MenuItem onSelect={() => {setRenameId(entry.id); setRenameValue(entry.displayName);}}>{t('libraries.actions.rename')}</MenuItem>
          <MenuItem disabled={entry.current} onSelect={() => void removeEntry(entry.id)}>{t('libraries.actions.removeRecent')}</MenuItem>
        </>}
      </DropdownMenu>}
    </li>;
  }

  const body = (
    <div className="library-manager" role="region" aria-labelledby={titleId}>
      <div className="library-manager-head">
        <div>
          <h1 id={titleId}>{t('libraries.welcome.title')}</h1>
          {embedded && <p className="projects-intro">{t('libraries.welcome.subtitle')}</p>}
        </div>
        {panel === 'home' && caps && !fixed && <div className="project-toolbar">
          <Button className="btn" disabled={busy} onClick={() => {setPickingParent(false); setRelocateId(null); void beginOpenProject();}}><FolderOpen size={16}/>{t('libraries.actions.open')}</Button>
          <Button className="btn primary" disabled={busy} onClick={() => {setPanel('create'); void updatePreview(createName, createParent || caps.defaultParentDir);}}><FolderPlus size={16}/>{t('libraries.actions.create')}</Button>
        </div>}
        {onClose && (
          <Button className="icon" disabled={busy} aria-label={t('common.close')} onClick={onClose}>
            <X size={18} />
          </Button>
        )}
      </div>

      {error && (
        <div className="library-manager-error" role="alert">
          {error}
        </div>
      )}
      {fixed && (
        <div className="library-manager-note" role="status">
          {t('libraries.fixedExplanation')}
        </div>
      )}

      {panel === 'home' && <>
        {!caps && <p role="status">{t('common.loading')}</p>}
        {copied && <p role="status" className="library-manager-note">{t('libraries.copied')}</p>}
        <ul className="library-manager-list project-list">
          {!fixed && exampleError && <li className="example-unavailable"><div><strong>Example</strong><p role="status">{t('libraries.exampleUnavailable')}</p><details><summary>{t('common.advanced')}</summary><p>{exampleError}</p></details></div></li>}
          {projects.map(entry => renderEntry(entry))}
        </ul>
        {caps && !projects.length && !exampleError && <p className="library-manager-empty">{t('libraries.recent.empty')}</p>}
        {!fixed && missing.length > 0 && <div className="project-missing-summary">
          <span>{t('libraries.missing.title')} ({missing.length})</span>
          <Button className="btn" onClick={() => {setMissingError(''); setMissingOpen(true);}}>{t('libraries.missing.manage')}</Button>
        </div>}

      </>}

      {panel === 'open' && browse && (
        <div className="library-picker">
          {!caps?.canPickFolder && <p className="library-manager-note">{t('libraries.browseNote')}</p>}
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
            <Button
              className="btn primary"
              disabled={busy}
              onClick={() => {
                if (pickingParent) {
                  setCreateParent(browse.path);
                  setPanel('create');
                  setPickingParent(false);
                  void updatePreview(createName, browse.path);
                } else if (relocateId) {
                  void (async () => {
                    setBusy(true);
                    try {
                      await libraryApi('/api/libraries/relocate', {
                        method: 'POST',
                        body: JSON.stringify({id: relocateId, path: pathInput}),
                      });
                      setRelocateId(null);
                      setPanel('home');
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  })();
                } else void openPath(pathInput);
              }}
            >
              {pickingParent
                ? t('libraries.create.useParent')
                : relocateId
                  ? t('libraries.actions.relocate')
                  : t('libraries.actions.openLibrary')}
            </Button>
            <Button
              className="btn"
              disabled={busy}
              onClick={() => {
                setRelocateId(null);
                setPickingParent(false);
                setPanel('home');
              }}
            >
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
          {!busy && browse.directories.length === 0 && (
            <p className="library-manager-empty">{t('libraries.picker.empty')}</p>
          )}
          <ul className="library-manager-list">
            {browse.directories.map(dir => (
              <li key={dir.path}>
                <button type="button" disabled={busy} className="library-dir" onClick={() => openBrowse(dir.path)}>
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
            <Input value={createName} onChange={e => updatePreview(e.target.value, createParent)} autoFocus />
          </label>
          <label className="library-field">
            <span>{t('libraries.create.parent')}</span>
            <Input value={createParent} onChange={e => updatePreview(createName, e.target.value)} />
          </label>
          <Button
            className="btn"
            disabled={busy}
            onClick={() => {
              if (caps?.canPickFolder) void beginCreateParentPick();
              else {
                setPickingParent(true);
                void openBrowse(createParent);
              }
            }}
          >
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
            <Button className="btn" disabled={busy} onClick={() => setPanel('home')}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {busy && (
        <p role="status" aria-live="polite">
          {t('libraries.working')}
        </p>
      )}

      {pendingEmpty && (
        <Dialog open onOpenChange={open => !open && setPendingEmpty(null)} title={t('libraries.empty.title')}>
          <div className="modal" data-ui-block-shortcuts="">
            <div className="modal-heading">
              <h2>{t('libraries.empty.title')}</h2>
            </div>
            <p>{t('libraries.empty.body')}</p>
            <code>{pendingEmpty}</code>
            <div className="modal-actions">
              <Button className="btn primary" disabled={busy} onClick={() => void confirmInitializeEmpty()}>
                {t('libraries.empty.confirm')}
              </Button>
              <Button className="btn" disabled={busy} onClick={() => setPendingEmpty(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {missingOpen && <Dialog title={t('libraries.missing.title')} busy={busy} onOpenChange={setMissingOpen}>
        <div className="modal missing-projects-dialog" data-ui-block-shortcuts="">
          <div className="missing-projects-heading"><h2>{t('libraries.missing.title')} ({missing.length})</h2><Button className="icon" disabled={busy} aria-label={t('common.close')} onClick={() => setMissingOpen(false)}><X size={18}/></Button></div>
          <p className="library-manager-note">{t('libraries.missing.blurb')}</p>
          {(missingError || error) && <p role="alert" className="library-manager-error">{missingError || error}</p>}
          <ul className="library-manager-list missing-projects-list">{missing.map(entry => renderEntry(entry, {missing: true}))}</ul>
          {!missing.length && <p role="status">{t('libraries.missing.empty')}</p>}
          <div className="missing-projects-footer"><Button className="btn" disabled={busy || !missing.length} onClick={() => setConfirmMissing(true)}>{t('libraries.missing.removeAll')}</Button></div>
        </div>
      </Dialog>}
      {confirmMissing && <ConfirmDialog title={t('libraries.missing.removeAll')} busy={busy} danger onCancel={() => setConfirmMissing(false)} onConfirm={() => void removeAllMissing()} confirmLabel={t('libraries.missing.removeAll')}><p>{t('libraries.missing.confirm')}</p></ConfirmDialog>}

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
  return (
    <Dialog
      overlayClassName="source-picker-overlay"
      title={t('libraries.welcome.title')}
      busy={busy}
      onOpenChange={open => {
        if (!open) onClose?.();
      }}
    >
      <div className="modal library-manager-modal" data-ui-block-shortcuts="">
        {body}
      </div>
    </Dialog>
  );
}
