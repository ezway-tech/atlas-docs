'use client';

import {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import {FolderOpen, FolderPlus, Library, MoreHorizontal, Copy, FolderOpen as RevealFolder, Search, X} from 'lucide-react';
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

type ProjectSummary = {
  root: string;
  state: string;
  schemaVersion: number | null;
  counts: {
    docs: number;
    folders: number;
    topics: number;
    comments: number;
    assets: number;
  } | null;
  error?: string | null;
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

function BusyStatus({label}: {label: string}) {
  return (
    <div className="atlas-busy-status" role="status" aria-live="polite">
      <p>{label}</p>
      <div className="atlas-busy-track" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

function sameLibraryPath(a: string, b: string) {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
}

function folderNameHint(p: string) {
  const cleaned = String(p || '').replace(/[/\\]+$/, '');
  const parts = cleaned.split(/[/\\]/);
  return parts[parts.length - 1] || 'Project';
}

type PendingBrowse = {
  path: string;
  mode: 'empty' | 'open';
  nameHint: string;
};

export default function LibraryManager({embedded, onClose, onEnterCurrent, session: initialSession}: Props) {
  const {t, lowerText, formatDateTime} = useLocale();
  const titleId = useId();
  const searchId = useId();
  const missingSearchId = useId();
  const [caps, setCaps] = useState<Caps | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [missingOpen, setMissingOpen] = useState(false);
  const [confirmMissing, setConfirmMissing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    kind: 'remove' | 'delete';
    id: string;
    name: string;
    path: string;
  } | null>(null);
  const [missingError, setMissingError] = useState('');
  const [missing, setMissing] = useState<RecentEntry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [panel, setPanel] = useState<'home' | 'open' | 'create'>('home');
  const [pickingParent, setPickingParent] = useState(false);
  const [relocateId, setRelocateId] = useState<string | null>(null);
  const [pendingBrowse, setPendingBrowse] = useState<PendingBrowse | null>(null);
  const [pendingName, setPendingName] = useState('');
  const pendingNameRef = useRef<HTMLInputElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [exampleError, setExampleError] = useState<string | null>(null);
  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [createName, setCreateName] = useState('');
  const [createParent, setCreateParent] = useState('');
  const [previewPath, setPreviewPath] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [query, setQuery] = useState('');
  const [missingQuery, setMissingQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [session] = useState<AtlasSession | null>(initialSession || null);

  const beginBusy = (key: string) => {
    setBusy(true);
    setBusyKey(key);
  };

  const endBusy = () => {
    setBusy(false);
    setBusyKey(null);
  };

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
    beginBusy('browse');
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
      endBusy();
    }
  }

  async function pickFolder(title: string, startPath?: string) {
    if (!caps?.canPickFolder) {
      await openBrowse(startPath);
      return null;
    }
    beginBusy('pick');
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
      endBusy();
    }
  }

  function findListedEntry(root: string) {
    return (
      recent.find(entry => sameLibraryPath(entry.path, root)) ||
      missing.find(entry => sameLibraryPath(entry.path, root)) ||
      null
    );
  }

  async function openPath(target: string, displayName?: string) {
    beginBusy(target);
    setError('');
    setPendingBrowse(null);
    setPendingName('');
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
          const hint = folderNameHint(inspected.root);
          setPendingName(hint);
          setPendingBrowse({
            path: inspected.root,
            mode: 'empty',
            nameHint: hint,
          });
          return;
        }
        setError(inspected.error?.message || t('libraries.errors.unusable'));
        return;
      }
      let listed = findListedEntry(inspected.root);
      if (!listed && !(displayName && displayName.trim())) {
        const list = await libraryApi<{libraries: RecentEntry[]; missing?: RecentEntry[]}>(
          '/api/libraries/recent',
        );
        setRecent(list.libraries || []);
        setMissing(list.missing || []);
        listed =
          (list.libraries || []).find(entry => sameLibraryPath(entry.path, inspected.root)) ||
          (list.missing || []).find(entry => sameLibraryPath(entry.path, inspected.root)) ||
          null;
      }
      if (listed || (displayName && displayName.trim())) {
        const opened = await libraryApi<{root: string; libraryId: string}>('/api/libraries/open', {
          method: 'POST',
          body: JSON.stringify({
            path: inspected.root,
            displayName: displayName?.trim() || listed?.displayName,
          }),
        });
        await afterSwitch(opened.libraryId);
        return;
      }
      const hint = folderNameHint(inspected.root);
      setPendingName(hint);
      setPendingBrowse({
        path: inspected.root,
        mode: 'open',
        nameHint: hint,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      endBusy();
    }
  }

  async function confirmPendingBrowse() {
    if (!pendingBrowse) return;
    const name = pendingName.trim();
    if (!name) return;
    beginBusy(pendingBrowse.path);
    setError('');
    try {
      if (pendingBrowse.mode === 'empty') {
        const created = await libraryApi<{libraryId: string}>('/api/libraries/initialize-empty', {
          method: 'POST',
          body: JSON.stringify({path: pendingBrowse.path, confirm: true, displayName: name}),
        });
        setPendingBrowse(null);
        setPendingName('');
        await afterSwitch(created.libraryId);
        return;
      }
      const opened = await libraryApi<{root: string; libraryId: string}>('/api/libraries/open', {
        method: 'POST',
        body: JSON.stringify({path: pendingBrowse.path, displayName: name}),
      });
      setPendingBrowse(null);
      setPendingName('');
      await afterSwitch(opened.libraryId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      endBusy();
    }
  }

  useEffect(() => {
    if (!pendingBrowse) return;
    const id = requestAnimationFrame(() => {
      const el = pendingNameRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
    return () => cancelAnimationFrame(id);
  }, [pendingBrowse?.path, pendingBrowse?.mode, pendingBrowse?.nameHint]);

  async function beginOpenProject() {
    const path = await pickFolder(t('libraries.pick.openTitle'), session?.libraryRoot || caps?.defaultBrowseDir);
    if (!path) return;
    await openPath(path);
  }

  async function beginCreateParentPick() {
    if (!caps?.canPickFolder) {
      setPickingParent(true);
      await openBrowse(createParent || caps?.defaultBrowseDir);
      return;
    }
    const path = await pickFolder(t('libraries.pick.parentTitle'), createParent || caps?.defaultParentDir);
    if (!path) return;
    setCreateParent(path);
    void updatePreview(createName, path);
  }

  async function beginRelocate(id: string) {
    setRelocateId(id);
    if (!caps?.canPickFolder) {
      setPickingParent(false);
      await openBrowse(caps?.defaultBrowseDir);
      return;
    }
    const path = await pickFolder(t('libraries.pick.relocateTitle'), caps?.defaultBrowseDir);
    if (!path) {
      setRelocateId(null);
      return;
    }
    beginBusy(id);
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
      endBusy();
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
    beginBusy('create');
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
      endBusy();
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
    beginBusy(id);
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
      endBusy();
    }
  }

  function askRemoveEntry(entry: Pick<RecentEntry, 'id' | 'displayName' | 'path' | 'isExample'>) {
    if (!entry.id || entry.isExample) return;
    setConfirmAction({kind: 'remove', id: entry.id, name: entry.displayName, path: entry.path});
  }

  function askDeleteEntry(entry: Pick<RecentEntry, 'id' | 'displayName' | 'path' | 'isExample' | 'current' | 'status'>) {
    if (!entry.id || entry.isExample || entry.current || entry.status === 'missing') return;
    setConfirmAction({kind: 'delete', id: entry.id, name: entry.displayName, path: entry.path});
  }

  async function removeEntry(id: string) {
    beginBusy(id);
    try {
      await libraryApi('/api/libraries/remove', {method: 'POST', body: JSON.stringify({id})});
      setConfirmAction(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      endBusy();
    }
  }

  async function deleteEntry(id: string) {
    beginBusy(id);
    try {
      await libraryApi('/api/libraries/delete', {method: 'POST', body: JSON.stringify({id})});
      setConfirmAction(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      endBusy();
    }
  }

  async function confirmPendingAction() {
    if (!confirmAction) return;
    if (confirmAction.kind === 'delete') await deleteEntry(confirmAction.id);
    else await removeEntry(confirmAction.id);
  }

  async function removeAllMissing() {
    const selected = new Set(missing.map(entry => entry.id));
    beginBusy('missing');
    setMissingError('');
    try {
      const latest = await libraryApi<{missing: RecentEntry[]}>('/api/libraries/recent');
      for (const entry of latest.missing || []) {
        if (selected.has(entry.id)) await libraryApi('/api/libraries/remove', {method: 'POST', body: JSON.stringify({id: entry.id})});
      }
    } catch (e) {
      setMissingError((e as Error).message);
    } finally {
      try {
        await refresh();
      } catch (e) {
        setMissingError((e as Error).message);
      }
      setConfirmMissing(false);
      setMissingQuery('');
      endBusy();
    }
  }

  const switchUnavailable = !!caps && !caps.canSwitch;

  const projects = useMemo(() => {
    const list = [...recent];
    if (session?.libraryRoot && !list.some(entry => entry.current)) {
      list.push({
        id: '',
        path: session.libraryRoot,
        displayName: session.displayName || 'Project',
        current: true,
        status: 'available',
        lastOpenedAt: null,
      });
    }
    list.sort((a, b) => Number(b.isExample) - Number(a.isExample));
    return list;
  }, [recent, session]);

  const filteredProjects = useMemo(() => {
    const needle = lowerText(query.trim());
    if (!needle) return projects;
    return projects.filter(entry => {
      const name = entry.isExample ? 'Example' : entry.displayName;
      return lowerText(name).includes(needle) || lowerText(entry.path).includes(needle);
    });
  }, [projects, query, lowerText]);

  const filteredMissing = useMemo(() => {
    const needle = lowerText(missingQuery.trim());
    if (!needle) return missing;
    return missing.filter(
      entry => lowerText(entry.displayName).includes(needle) || lowerText(entry.path).includes(needle),
    );
  }, [missing, missingQuery, lowerText]);

  function closeMissingDialog() {
    setMissingOpen(false);
    setMissingQuery('');
  }

  useEffect(() => {
    if (!filteredProjects.length) {
      setSelectedPath(null);
      return;
    }
    setSelectedPath(prev => {
      if (prev && filteredProjects.some(entry => entry.path === prev)) return prev;
      const preferred =
        filteredProjects.find(entry => entry.current) ||
        filteredProjects.find(entry => entry.isExample) ||
        filteredProjects[0];
      return preferred.path;
    });
  }, [filteredProjects]);

  const selected = filteredProjects.find(entry => entry.path === selectedPath) || null;
  const summaryForSelected =
    selected && summary && summary.root === selected.path ? summary : null;
  const summaryCounts = summaryForSelected?.counts ?? null;

  useEffect(() => {
    if (!selected || selected.status === 'missing') {
      setSummary(null);
      setSummaryError('');
      setSummaryLoading(false);
      return;
    }
    const targetPath = selected.path;
    const targetId = selected.id || '';
    let cancelled = false;
    setSummaryError('');
    setSummaryLoading(true);
    void (async () => {
      try {
        const result = await libraryApi<ProjectSummary>('/api/libraries/summary', {
          method: 'POST',
          body: JSON.stringify(targetId ? {id: targetId, path: targetPath} : {path: targetPath}),
        });
        if (cancelled) return;
        setSummary(result);
        setSummaryError(!result.counts && result.error ? result.error : '');
      } catch (e) {
        if (cancelled) return;
        setSummary(null);
        setSummaryError((e as Error).message);
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.path, selected?.id, selected?.status]);

  function enterCurrent(entry: RecentEntry) {
    beginBusy(entry.path);
    try {
      (onEnterCurrent || onClose)?.();
    } finally {
      endBusy();
    }
  }

  function selectEntry(entry: RecentEntry) {
    setSelectedPath(entry.path);
    setMobileShowDetail(true);
  }

  function openEntry(entry: RecentEntry) {
    if (busy || (!entry.current && (switchUnavailable || entry.status === 'in_use'))) return;
    if (entry.current) enterCurrent(entry);
    else void openPath(entry.path, entry.displayName);
  }

  function copyPath(path: string) {
    void navigator.clipboard
      .writeText(path)
      .then(() => setCopied(true))
      .catch(e => setError(e.message));
  }

  function renderMissingEntry(entry: RecentEntry) {
    return (
      <li key={entry.path}>
        <div className="project-row-main">
          <span className="project-name">
            <FolderOpen size={16} />
            <strong>{entry.displayName}</strong>
          </span>
          <code title={entry.path}>{entry.path}</code>
        </div>
        <DropdownMenu
          align="end"
          trigger={
            <Button className="icon" disabled={busy || switchUnavailable} aria-label={t('libraries.actions.more', {name: entry.displayName})}>
              <MoreHorizontal size={16} />
            </Button>
          }
        >
          <MenuItem
            onSelect={() => {
              closeMissingDialog();
              void beginRelocate(entry.id);
            }}
          >
            {t('libraries.actions.relocate')}
          </MenuItem>
          <MenuItem onSelect={() => askRemoveEntry(entry)}>{t('libraries.actions.removeRecent')}</MenuItem>
        </DropdownMenu>
      </li>
    );
  }

  async function reorderProjects(fromId: string, toId: string) {
    if (!fromId || !toId || fromId === toId || busy) return;
    const ids = recent.filter(entry => entry.id && !entry.isExample).map(entry => entry.id as string);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, fromId);
    const exampleIds = [...recent, ...missing]
      .filter(entry => entry.id && entry.isExample)
      .map(entry => entry.id as string);
    const missingIds = missing.filter(entry => entry.id && !entry.isExample).map(entry => entry.id as string);
    const nextIds = [...exampleIds, ...ids, ...missingIds];
    const prev = recent;
    const byId = new Map(recent.map(entry => [entry.id, entry]));
    setRecent(
      [...exampleIds, ...ids]
        .map(id => byId.get(id))
        .filter((entry): entry is RecentEntry => !!entry),
    );
    try {
      await libraryApi('/api/libraries/reorder', {method: 'POST', body: JSON.stringify({ids: nextIds})});
    } catch (e) {
      setRecent(prev);
      setError((e as Error).message);
    }
  }

  function renderListEntry(entry: RecentEntry) {
    const rowBusy = busy && busyKey === entry.path;
    const selectedRow = selectedPath === entry.path;
    const rowClass = [
      entry.current ? 'current' : '',
      selectedRow ? 'selected' : '',
      rowBusy ? 'project-row-busy' : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined;
    const canOpen = entry.current || (!switchUnavailable && entry.status !== 'in_use');
    return (
      <li
        key={entry.path}
        className={rowClass}
        data-example={entry.isExample || undefined}
        aria-selected={selectedRow}
        aria-busy={rowBusy || undefined}
      >
        <button
          type="button"
          className="project-list-select"
          disabled={busy}
          aria-busy={rowBusy || undefined}
          draggable={!!entry.id && !entry.isExample && !busy && !query.trim()}
          title={entry.id && !entry.isExample && !query.trim() ? t('workspace.tree.dragReorder') : undefined}
          onDragStart={e => {
            if (!entry.id || entry.isExample) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.setData('application/x-atlas-project', entry.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={e => {
            if (!entry.id || entry.isExample) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={e => {
            e.preventDefault();
            if (!entry.id || entry.isExample) return;
            const from = e.dataTransfer.getData('application/x-atlas-project');
            if (from) void reorderProjects(from, entry.id);
          }}
          onClick={() => selectEntry(entry)}
          onDoubleClick={() => openEntry(entry)}
          onKeyDown={e => {
            if (e.key === 'Enter' && canOpen) {
              e.preventDefault();
              openEntry(entry);
            }
          }}
        >
          <FolderOpen size={16} />
          <span className="project-list-copy">
            <strong>{entry.isExample ? 'Example' : entry.displayName}</strong>
          </span>
          {entry.current ? (
            <span className="status status-current">{t('libraries.status.current')}</span>
          ) : entry.status !== 'available' ? (
            <span className="status">{t(('libraries.status.' + entry.status) as 'libraries.status.available')}</span>
          ) : null}
        </button>
        <DropdownMenu
          align="end"
          trigger={
            <Button className="icon" disabled={busy} aria-label={t('libraries.actions.more', {name: entry.displayName})}>
              <MoreHorizontal size={16} />
            </Button>
          }
        >
          {caps?.canReveal && (
            <MenuItem onSelect={() => void reveal(entry.id || undefined)}>
              <RevealFolder size={16} />
              {t('libraries.reveal')}
            </MenuItem>
          )}
          <MenuItem onSelect={() => copyPath(entry.path)}>
            <Copy size={16} />
            {t('libraries.copyPath')}
          </MenuItem>
          {!switchUnavailable && entry.id && !entry.isExample && (
            <>
              <MenuItem
                onSelect={() => {
                  setRenameId(entry.id);
                  setRenameValue(entry.displayName);
                }}
              >
                {t('libraries.actions.rename')}
              </MenuItem>
              <MenuItem disabled={entry.current} onSelect={() => askRemoveEntry(entry)}>
                {t('libraries.actions.removeRecent')}
              </MenuItem>
              <MenuItem
                disabled={entry.current || entry.status === 'in_use' || entry.status === 'missing'}
                onSelect={() => askDeleteEntry(entry)}
              >
                {t('libraries.actions.deleteFolder')}
              </MenuItem>
            </>
          )}
        </DropdownMenu>
      </li>
    );
  }

  const body = (
    <div className="library-manager" role="region" aria-labelledby={titleId}>
      <div className="library-manager-head projects-sticky-tools">
        <div className="library-manager-title">
          <h1 id={titleId}>{t('libraries.welcome.title')}</h1>
          {caps && panel === 'home' && (
            <p className="projects-count">{t('libraries.recent.count', {count: filteredProjects.length})}</p>
          )}
          {embedded && panel === 'home' && <p className="projects-intro">{t('libraries.welcome.subtitle')}</p>}
        </div>
        {panel === 'home' && caps && !switchUnavailable && (
          <div className="project-toolbar">
            <Button
              className={`btn${busyKey === 'open' || busyKey === 'pick' ? ' project-action-busy' : ''}`}
              disabled={busy}
              aria-busy={busyKey === 'open' || busyKey === 'pick' || undefined}
              onClick={() => {
                setPickingParent(false);
                setRelocateId(null);
                void beginOpenProject();
              }}
            >
              <FolderOpen size={16} />
              {t('libraries.actions.open')}
            </Button>
            <Button
              className={`btn primary${busyKey === 'create' ? ' project-action-busy' : ''}`}
              disabled={busy}
              aria-busy={busyKey === 'create' || undefined}
              onClick={() => {
                setPanel('create');
                void updatePreview(createName, createParent || caps.defaultParentDir);
              }}
            >
              <FolderPlus size={16} />
              {t('libraries.actions.create')}
            </Button>
          </div>
        )}
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
      {switchUnavailable && (
        <div className="library-manager-note" role="status">
          {t('libraries.supervisorExplanation')}
        </div>
      )}

      {panel === 'home' && (
        <>
          {!caps && <BusyStatus label={t('common.loading')} />}
          {copied && (
            <p role="status" className="library-manager-note">
              {t('libraries.copied')}
            </p>
          )}
          {caps && (
            <div className={`projects-split${mobileShowDetail && selected ? ' show-detail' : ''}`}>
              <div className="projects-master">
                <label className="project-search" htmlFor={searchId}>
                  <Search size={16} aria-hidden="true" />
                  <Input
                    id={searchId}
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={t('libraries.recent.searchPlaceholder')}
                    aria-label={t('libraries.recent.search')}
                    disabled={busy}
                  />
                </label>
                <ul className="library-manager-list project-list" role="listbox" aria-label={t('libraries.welcome.title')}>
                  {!switchUnavailable && exampleError && !query.trim() && (
                    <li className="example-unavailable">
                      <div>
                        <strong>Example</strong>
                        <p role="status">{t('libraries.exampleUnavailable')}</p>
                        <details>
                          <summary>{t('common.advanced')}</summary>
                          <p>{exampleError}</p>
                        </details>
                      </div>
                    </li>
                  )}
                  {filteredProjects.map(entry => renderListEntry(entry))}
                </ul>
                {caps && !projects.length && !exampleError && (
                  <p className="library-manager-empty">{t('libraries.recent.empty')}</p>
                )}
                {caps && !!projects.length && !filteredProjects.length && (
                  <p className="library-manager-empty" role="status">
                    {t('libraries.recent.noMatches')}
                  </p>
                )}
                {!switchUnavailable && missing.length > 0 && (
                  <div className="project-missing-summary">
                    <span>
                      {t('libraries.missing.title')} ({missing.length})
                    </span>
                    <Button
                      className="btn"
                      onClick={() => {
                        setMissingError('');
                        setMissingOpen(true);
                      }}
                    >
                      {t('libraries.missing.manage')}
                    </Button>
                  </div>
                )}
              </div>
              <div className="project-detail" aria-live="polite">
                {selected ? (
                  <>
                    <Button
                      className="btn project-detail-back"
                      onClick={() => setMobileShowDetail(false)}
                    >
                      {t('libraries.detail.backToList')}
                    </Button>
                    <div className="project-detail-head">
                      <FolderOpen size={22} aria-hidden="true" />
                      <div className="project-detail-title">
                        <h2>{selected.isExample ? 'Example' : selected.displayName}</h2>
                        {selected.current ? (
                          <span className="status status-current">{t('libraries.status.current')}</span>
                        ) : selected.status !== 'available' ? (
                          <span className="status">
                            {t(('libraries.status.' + selected.status) as 'libraries.status.available')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="project-detail-path">
                      <code title={selected.path}>{selected.path}</code>
                      <Button className="btn" disabled={busy} onClick={() => copyPath(selected.path)}>
                        <Copy size={14} />
                        {t('libraries.copyPath')}
                      </Button>
                    </p>
                    {selected.lastOpenedAt && (
                      <p className="project-detail-meta">
                        {t('libraries.detail.lastOpened')}: {formatDateTime(selected.lastOpenedAt)}
                      </p>
                    )}
                    <div
                      className={`project-detail-stats${summaryLoading ? ' is-loading' : ''}`}
                      aria-label={t('libraries.summary.label')}
                      aria-busy={summaryLoading || undefined}
                    >
                      {!summaryLoading && summaryError && !summaryCounts ? (
                        <p className="project-detail-stats-note" role="status">
                          {t('libraries.summary.unavailable')}
                        </p>
                      ) : (
                        <>
                          <div>
                            <span>{t('workspace.stats.topics')}</span>
                            <strong>{summaryCounts ? summaryCounts.topics : '—'}</strong>
                          </div>
                          <div>
                            <span>{t('workspace.stats.folders')}</span>
                            <strong>{summaryCounts ? summaryCounts.folders : '—'}</strong>
                          </div>
                          <div>
                            <span>{t('workspace.stats.docs')}</span>
                            <strong>{summaryCounts ? summaryCounts.docs : '—'}</strong>
                          </div>
                          <div>
                            <span>{t('workspace.stats.comments')}</span>
                            <strong>{summaryCounts ? summaryCounts.comments : '—'}</strong>
                          </div>
                          <div>
                            <span>{t('libraries.summary.assets')}</span>
                            <strong>{summaryCounts ? summaryCounts.assets : '—'}</strong>
                          </div>
                          <div>
                            <span>{t('libraries.summary.schema')}</span>
                            <strong>
                              {summaryForSelected?.schemaVersion != null
                                ? summaryForSelected.schemaVersion
                                : '—'}
                            </strong>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="project-detail-actions">
                      <Button
                        className={`btn primary${busyKey === selected.path ? ' project-action-busy' : ''}`}
                        disabled={
                          busy || (!selected.current && (switchUnavailable || selected.status === 'in_use'))
                        }
                        aria-busy={busyKey === selected.path || undefined}
                        onClick={() => openEntry(selected)}
                      >
                        {selected.current ? t('libraries.continue') : t('libraries.actions.openLibrary')}
                      </Button>
                      {caps.canReveal && (
                        <Button className="btn" disabled={busy} onClick={() => void reveal(selected.id || undefined)}>
                          <RevealFolder size={16} />
                          {t('libraries.reveal')}
                        </Button>
                      )}
                      {!switchUnavailable && selected.id && !selected.isExample && (
                        <Button
                          className="btn"
                          disabled={busy}
                          onClick={() => {
                            setRenameId(selected.id);
                            setRenameValue(selected.displayName);
                          }}
                        >
                          {t('libraries.actions.rename')}
                        </Button>
                      )}
                      {!switchUnavailable && selected.id && !selected.isExample && !selected.current && (
                        <>
                          <Button className="btn" disabled={busy} onClick={() => askRemoveEntry(selected)}>
                            {t('libraries.actions.removeRecent')}
                          </Button>
                          <Button
                            className="btn"
                            disabled={busy || selected.status === 'in_use' || selected.status === 'missing'}
                            onClick={() => askDeleteEntry(selected)}
                          >
                            {t('libraries.actions.deleteFolder')}
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="library-manager-empty">{t('libraries.detail.empty')}</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

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
                    beginBusy(relocateId);
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
                      endBusy();
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
          {busy && <BusyStatus label={t('libraries.working')} />}
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
            <Button
              className={`btn primary${busyKey === 'create' ? ' project-action-busy' : ''}`}
              disabled={busy || !createName.trim()}
              aria-busy={busyKey === 'create' || undefined}
              onClick={createLibrary}
            >
              {t('libraries.actions.createConfirm')}
            </Button>
            <Button className="btn" disabled={busy} onClick={() => setPanel('home')}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {busy && panel === 'home' && <BusyStatus label={t('libraries.working')} />}

      {pendingBrowse && (
        <Dialog
          open
          onOpenChange={open => {
            if (!open) {
              setPendingBrowse(null);
              setPendingName('');
            }
          }}
          title={pendingBrowse.mode === 'empty' ? t('libraries.empty.title') : t('libraries.openName.title')}
        >
          <div className="modal" data-ui-block-shortcuts="">
            <div className="modal-heading">
              <h2>
                {pendingBrowse.mode === 'empty' ? t('libraries.empty.title') : t('libraries.openName.title')}
              </h2>
            </div>
            <p>
              {pendingBrowse.mode === 'empty' ? t('libraries.empty.body') : t('libraries.openName.body')}
            </p>
            <code>{pendingBrowse.path}</code>
            <label className="library-field">
              <span>{t('libraries.create.name')}</span>
              <Input
                ref={pendingNameRef}
                value={pendingName}
                onChange={e => setPendingName(e.target.value)}
                onFocus={e => e.currentTarget.select()}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || e.shiftKey) return;
                  e.preventDefault();
                  if (!busy && pendingName.trim()) void confirmPendingBrowse();
                }}
                disabled={busy}
                autoFocus
                maxLength={120}
              />
            </label>
            <div className="modal-actions">
              <Button
                className="btn primary"
                disabled={busy || !pendingName.trim()}
                onClick={() => void confirmPendingBrowse()}
              >
                {pendingBrowse.mode === 'empty' ? t('libraries.empty.confirm') : t('libraries.openName.confirm')}
              </Button>
              <Button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setPendingBrowse(null);
                  setPendingName('');
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {missingOpen && (
        <Dialog
          title={t('libraries.missing.title')}
          busy={busy}
          overlayClassName="missing-projects-backdrop"
          onOpenChange={open => {
            if (!open) closeMissingDialog();
            else setMissingOpen(true);
          }}
        >
          <div className="modal missing-projects-dialog" data-ui-block-shortcuts="">
            <div className="missing-projects-heading">
              <h2>
                {t('libraries.missing.title')} ({missing.length})
              </h2>
              <Button className="icon" disabled={busy} aria-label={t('common.close')} onClick={closeMissingDialog}>
                <X size={18} />
              </Button>
            </div>
            <p className="library-manager-note">{t('libraries.missing.blurb')}</p>
            {(missingError || error) && (
              <p role="alert" className="library-manager-error">
                {missingError || error}
              </p>
            )}
            {missing.length > 0 && (
              <label className="project-search" htmlFor={missingSearchId}>
                <Search size={16} aria-hidden="true" />
                <Input
                  id={missingSearchId}
                  type="search"
                  value={missingQuery}
                  onChange={e => setMissingQuery(e.target.value)}
                  placeholder={t('libraries.missing.searchPlaceholder')}
                  aria-label={t('libraries.missing.search')}
                  disabled={busy}
                />
              </label>
            )}
            <ul className="library-manager-list missing-projects-list">
              {filteredMissing.map(entry => renderMissingEntry(entry))}
            </ul>
            {!missing.length && <p role="status">{t('libraries.missing.empty')}</p>}
            {!!missing.length && !filteredMissing.length && (
              <p role="status">{t('libraries.missing.noMatches')}</p>
            )}
            <div className="missing-projects-footer">
              <Button className="btn" disabled={busy || !missing.length} onClick={() => setConfirmMissing(true)}>
                {t('libraries.missing.removeAll')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
      {confirmMissing && (
        <ConfirmDialog
          title={t('libraries.missing.removeAll')}
          busy={busy}
          danger
          onCancel={() => setConfirmMissing(false)}
          onConfirm={() => void removeAllMissing()}
          confirmLabel={t('libraries.missing.removeAll')}
        >
          <p>{t('libraries.missing.confirm')}</p>
        </ConfirmDialog>
      )}

      {confirmAction && (
        <ConfirmDialog
          title={
            confirmAction.kind === 'delete'
              ? t('libraries.delete.title')
              : t('libraries.remove.title')
          }
          busy={busy}
          danger
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void confirmPendingAction()}
          confirmLabel={
            confirmAction.kind === 'delete'
              ? t('libraries.actions.deleteFolder')
              : t('libraries.actions.removeRecent')
          }
        >
          <p>
            {confirmAction.kind === 'delete'
              ? t('libraries.delete.confirm', {name: confirmAction.name, path: confirmAction.path})
              : t('libraries.remove.confirm', {name: confirmAction.name})}
          </p>
          {confirmAction.kind === 'delete' && (
            <p>
              <code>{confirmAction.path}</code>
            </p>
          )}
        </ConfirmDialog>
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
