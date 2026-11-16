'use client';

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Archive, ChevronRight, CloudCheck, CloudDownload, CloudUpload, HardDrive, Library, Plus } from 'lucide-react';
import { listSongs, updateSavedSong, type SongSummary } from '../../lib/song-store';
import { timeLabel } from '../../lib/session';
import { useRecordNavigation } from '../../components/record-transition';
import { RecordDisc, RecordSleeve } from '../../components/record-artwork';
import type { RecordArt } from '../../lib/record-art';
import { clipBounds } from '../../lib/clip-edits';
import { lifecycle, type LibraryAction, type Lifecycle } from '../../lib/library-entry';
import type { CloudSong } from '../../lib/cloud-manifest';
import { LibraryActions } from '../../components/library-actions';
import type { BackupLink } from '../../lib/backup-store';
import { CloudAccount } from '../../components/cloud-account';
import { useCloud } from '../../components/cloud-provider';
import { cloudMessage } from '../../lib/supabase-transport';
import { ArchiveCrate } from '../../components/archive-crate';
import '../studio.css';
import './archive.css';

function SongArtwork({ id, title, artwork, opening = false, returning = false }: { id: string; title: string; artwork?: RecordArt; opening?: boolean; returning?: boolean }) {
  return <span className={`song-artwork${opening ? ' is-opening' : ''}${returning ? ' is-returning' : ''}`} aria-hidden="true">
    <span className="song-artwork-disc"><RecordDisc artwork={artwork} /></span>
    <span className="song-sleeve" data-song-sleeve={id}><RecordSleeve artwork={artwork} title={title} /></span>
  </span>;
}

interface SongRow extends Lifecycle {
  id: string;
  title: string;
  artwork?: RecordArt;
  local?: SongSummary;
  remote?: CloudSong;
  link?: BackupLink;
  editRemote: boolean;
  layerCount: number;
  duration: number;
  hasTake: boolean;
  updatedAt: number;
}

function cloudRow(remote: CloudSong, local?: SongSummary): SongRow {
  const content = remote.content;
  const layers = content.layers.filter(layer => lifecycle(layer) === 'active');
  return {
    id: local?.id ?? `cloud-${remote.id}`, local, remote, editRemote: true,
    title: content.title.trim() || 'Untitled song', artwork: content.artwork, updatedAt: Date.parse(remote.updated_at),
    archivedAt: content.archivedAt, deletedAt: content.deletedAt,
    layerCount: layers.length, hasTake: !!content.candidate,
    duration: Math.max(0, ...layers.map(layer => clipBounds(layer).end), content.candidate ? clipBounds(content.candidate).end : 0),
  };
}

function setArchiveView(archive: boolean, replace = false) {
  const url = new URL(window.location.href);
  if (archive) url.searchParams.set('view', 'archive');
  else url.searchParams.delete('view');
  if (url.href === window.location.href) return;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

export default function SongsPage() {
  return <Suspense fallback={<main className="songs-page"><p role="status">Opening your collection…</p></main>}>
    <SongsCollection />
  </Suspense>;
}

function SongsCollection() {
  const isArchived = useSearchParams().get('view') === 'archive';
  const cloud = useCloud();
  const { flight, enterStudio, arrive } = useRecordNavigation();
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedArchive, setSelectedArchive] = useState<string[]>([]);
  const [restoreNotice, setRestoreNotice] = useState('');
  const restoringArchive = useRef(false);
  const hadArchived = useRef(false);
  const [busy, setBusy] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const openingRun = useRef(0);
  const openingRef = useRef(false);
  useEffect(() => {
    openingRef.current = false; setBusy(''); setOpening(null);
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) { openingRun.current++; openingRef.current = false; setBusy(''); setOpening(null); }
    };
    window.addEventListener('pageshow', reset);
    return () => { openingRun.current++; window.removeEventListener('pageshow', reset); };
  }, []);
  useEffect(() => {
    setSelected([]);
    setSelecting(false);
    setSelectedArchive([]);
    setActionError('');
    setRestoreNotice('');
  }, [cloud.user?.id]);
  useEffect(() => {
    let canceled = false;
    const refresh = () => {
      void listSongs().then((items) => { if (!canceled) { setSongs(items); setError(''); } })
        .catch(() => { if (!canceled) setError('Could not open your songs. Check that browser storage is available, then try again.'); })
        .finally(() => { if (!canceled) setLoading(false); });
    };
    refresh();
    window.addEventListener('focus', refresh); window.addEventListener('pageshow', refresh); window.addEventListener('songs-changed', refresh);
    return () => { canceled = true; window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); window.removeEventListener('songs-changed', refresh); };
  }, [cloud.version]);

  const openingCloudId = opening?.startsWith('cloud-') ? opening.slice(6) : undefined;
  const visible = songs.filter((song) => (!song.ownerId || cloud.ready && song.ownerId === cloud.user?.id)
    // Keep the source sleeve in place while a cloud-only song installs locally.
    && !(openingCloudId && cloud.links.some(link => link.id === song.id && link.remoteId === openingCloudId)));
  const localRows = visible.map((song): SongRow => {
    const link = cloud.links.find(item => item.id === song.id && item.ownerId === cloud.user?.id);
    const remote = cloud.remoteSongs.find(item => item.id === link?.remoteId);
    const remoteAhead = !!link && !!remote && remote.revision > link.remoteRevision && song.revision <= link.syncedLocalRevision && !link.libraryEdit;
    if (remote && (remoteAhead || lifecycle(remote.content) === 'deleted'
      || remote.content.archivedAt != null && remote.revision > (link?.remoteRevision ?? 0) && !link?.libraryEdit)) return { ...cloudRow(remote, song), link };
    return { ...song, local: song, remote, link, editRemote: false };
  });
  const remoteRows = cloud.remoteSongs.filter(song => !cloud.links.some(link => link.ownerId === cloud.user?.id && link.remoteId === song.id && visible.some(local => local.id === link.id))).map(song => cloudRow(song));
  const catalogue = [...localRows, ...remoteRows];
  const archiveRows = catalogue.filter(row => lifecycle(row) === 'archived').sort((a, b) => b.updatedAt - a.updatedAt);
  const hasArchived = archiveRows.length > 0;
  const rows = catalogue.filter(row => lifecycle(row) === 'active')
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const selectedArchiveRows = archiveRows.filter(row => selectedArchive.includes(row.id));
  const canManage = (row: SongRow) => !row.editRemote || cloud.online;
  const hasCloudCopy = (row: SongRow) => !!row.remote || (row.link?.remoteRevision ?? 0) > 0;
  const canBackUp = (row: SongRow) => !isArchived && !!cloud.user && !!row.local && !row.local.ownerId;
  const groups = [
    { key: 'cloud', title: 'Backed up', icon: CloudCheck, rows: rows.filter(hasCloudCopy) },
    { key: 'device', title: 'On this device', icon: HardDrive, rows: rows.filter(row => !hasCloudCopy(row)) },
  ];
  useEffect(() => {
    // Preserve a direct Archive URL while local and cloud songs are loading.
    if (isArchived && hadArchived.current && !hasArchived) setArchiveView(false, true);
    hadArchived.current = isArchived && hasArchived;
  }, [hasArchived, isArchived]);
  useEffect(() => {
    setSelected([]);
    setSelecting(false);
    setSelectedArchive([]);
    setActionError('');
  }, [isArchived]);
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  async function applySongAction(row: SongRow, action: LibraryAction) {
    if (row.editRemote && row.remote) {
      try { await cloud.manageRemote(row.remote.id, row.remote.revision, action); }
      catch (reason) { if (reason instanceof Error) throw reason; throw new Error(cloudMessage(reason)); }
    } else if (row.local) {
      await updateSavedSong(row.local.id, row.local.revision, cloud.user?.id, action);
    }
  }
  async function manageSong(row: SongRow, action: LibraryAction) {
    setActionError('');
    setRestoreNotice('');
    try {
      await applySongAction(row, action);
      setSelected(current => current.filter(id => id !== row.id));
      if (action.type === 'restore' || action.type === 'delete') {
        setSelectedArchive(current => current.filter(id => id !== row.id));
      }
    } finally {
      if (!row.editRemote) await listSongs().then(setSongs).catch(() => {});
    }
  }
  async function restoreArchiveSongs() {
    if (busy || restoringArchive.current || !selectedArchiveRows.length || selectedArchiveRows.some(row => !canManage(row))) return;
    restoringArchive.current = true;
    setBusy('restore');
    setActionError('');
    setRestoreNotice('');
    try {
      const results = await Promise.allSettled(selectedArchiveRows.map(row => applySongAction(row, { type: 'restore' })));
      const restored = new Set(selectedArchiveRows.filter((_, index) => results[index].status === 'fulfilled').map(row => row.id));
      setSelectedArchive(current => current.filter(id => !restored.has(id)));
      if (restored.size) setRestoreNotice(`Restored ${restored.size} ${restored.size === 1 ? 'song' : 'songs'} to My songs.`);
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) {
        const first = failures[0].reason;
        const reason = first instanceof Error ? first.message : cloudMessage(first);
        setActionError(`Could not restore ${failures.length} ${failures.length === 1 ? 'song' : 'songs'}. ${reason}`);
      }
      if (selectedArchiveRows.some(row => !row.editRemote)) await listSongs().then(setSongs).catch(() => {});
    } finally {
      restoringArchive.current = false;
      setBusy('');
    }
  }
  useLayoutEffect(() => {
    if (!loading && cloud.ready && flight?.direction === 'songs') {
      arrive('songs');
    }
  }, [arrive, cloud.ready, flight, loading, songs]);
  async function backUpSongs(ids: string[]) {
    setBusy('backup'); setActionError('');
    try { await cloud.selectSongs(ids); setSelected([]); setSelecting(false); }
    catch (reason) { setActionError(cloudMessage(reason)); }
    finally { setBusy(''); }
  }
  async function openSong(row: string, id: string, artwork?: RecordArt, remote = false) {
    if (busy || openingRef.current) return;
    openingRef.current = true;
    const run = ++openingRun.current;
    setBusy(row); setActionError(''); setOpening(row);
    try {
      const sleeve = document.querySelector<HTMLElement>(`[data-song-sleeve="${CSS.escape(row)}"]`);
      await enterStudio(async () => remote ? cloud.openRemote(id) : id, sleeve, artwork);
    } catch (reason) {
      if (openingRun.current !== run) return;
      openingRef.current = false;
      setActionError(cloudMessage(reason)); setBusy(''); setOpening(null);
    }
  }
  function renderRow(row: SongRow) {
    const local = row.local;
    const remoteId = row.link?.remoteId ?? row.remote?.id;
    const isOpening = opening === row.id;
    const status = local ? cloud.status(local.id, local.revision) : '';
    const backedUp = hasCloudCopy(row);
    const StorageIcon = backedUp ? CloudCheck : HardDrive;
    const SelectIcon = local ? ChevronRight : CloudDownload;
    const body = <>
      <SongArtwork id={row.id} artwork={row.artwork} title={row.title} opening={isOpening} returning={flight?.direction === 'songs' && flight.songId === row.id} />
      <span className="song-card-info">
        <strong className="song-title">{row.title}</strong>
        <span className="song-card-details" id={`song-details-${row.id}`}>{row.layerCount} {row.layerCount === 1 ? 'layer' : 'layers'} <span aria-hidden="true">·</span> {timeLabel(row.duration)}{row.hasTake && <span className="song-review-badge">Take to review</span>}</span>
        <span className="song-card-meta">
          <span className="song-backup-status" id={`song-status-${row.id}`} data-storage={backedUp ? 'cloud' : 'device'}>
            <StorageIcon size={13} aria-hidden="true" />{status || (backedUp ? local ? 'Backed up' : 'Cloud only' : 'Local only')}
          </span>
          <time dateTime={new Date(row.updatedAt).toISOString()}>{dateFormat.format(row.updatedAt)}</time>
        </span>
      </span>
      <span className="song-open" aria-hidden="true">{isOpening ? local ? 'Opening…' : 'Downloading…' : <SelectIcon size={17} />}</span>
    </>;
    return <li key={row.id} className="song-row">
      <div className="song-select-row">
        {remoteId ? (
          <button className="song-card" aria-label={`Open ${row.title}`} aria-describedby={`song-details-${row.id} song-status-${row.id}`} aria-disabled={!!busy || (!local && !cloud.online)} aria-busy={isOpening} onClick={() => {
            if (cloud.online || local) void openSong(row.id, remoteId, row.artwork, true);
          }}>{body}</button>
        ) : <a className="song-card" aria-label={`Open ${row.title}`} aria-describedby={`song-details-${row.id} song-status-${row.id}`} aria-disabled={!!busy} aria-busy={isOpening} href={`/studio?song=${encodeURIComponent(row.id)}`} onClick={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); void openSong(row.id, row.id, row.artwork);
        }}>{body}</a>}
        <div className="song-row-action">
          {selecting && canBackUp(row) ? <label className="song-select"><input type="checkbox" aria-label={`Back up ${row.title}`} checked={selected.includes(row.id)} disabled={!!busy}
            onChange={event => setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} /></label>
          : <LibraryActions kind="song" title={row.title} disabled={!!busy || !canManage(row)}
            onAction={action => manageSong(row, action)} onError={setActionError} onBackup={canBackUp(row) ? () => backUpSongs([row.id]) : undefined} />}
        </div>
      </div>
      {local && cloud.errors[local.id] && <div className="song-backup-error"><p>{cloud.errors[local.id]}</p><button className="text-button" onClick={cloud.retry}>Retry backup</button></div>}
    </li>;
  }

  return <div className="studio-app" data-song-collection>
    {opening && <p className="song-opening-status" role="status">Opening song…</p>}
    <header className="studio-header"><a className="wordmark" href="/"><span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /></span>listening room.</a><a className="song-new" href="/studio"><Plus size={15} aria-hidden="true" />New song</a></header>
    <main className="songs-page">
      <div className="songs-heading"><h1>My songs</h1></div>
      <CloudAccount />
      {hasArchived && <div className="library-tabs" role="group" aria-label="Song collection">
        <button aria-pressed={!isArchived} disabled={!!busy} onClick={() => { setRestoreNotice(''); setArchiveView(false); }}><Library size={14} aria-hidden="true" />Songs</button>
        <button aria-pressed={isArchived} disabled={!!busy} onClick={() => { setRestoreNotice(''); setArchiveView(true); }}><Archive size={14} aria-hidden="true" />Archive</button>
      </div>}
      <p className="archive-notice" role="status">{restoreNotice}</p>
      {actionError && <p className="cloud-error song-library-error" role="alert">{actionError}</p>}
      {loading ? <p role="status">Opening your collection…</p> : error ? <div className="songs-empty"><p role="alert">{error}</p><button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button></div> : isArchived && hasArchived ? (
        <ArchiveCrate
          songs={archiveRows.map(row => {
            const backedUp = hasCloudCopy(row);
            const backupStatus = row.local ? cloud.status(row.id, row.local.revision) : '';
            return { ...row, backedUp, canManage: canManage(row),
              backupStatus: backupStatus || (backedUp ? row.local ? 'Backed up' : 'Cloud only' : 'Local only'),
              backupError: row.local ? cloud.errors[row.id] : undefined,
            };
          })}
          selected={selectedArchiveRows.map(row => row.id)}
          restoring={busy === 'restore'}
          onSelect={id => {
            setRestoreNotice('');
            setSelectedArchive(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
          }}
          onClear={() => setSelectedArchive([])}
          onRestore={() => void restoreArchiveSongs()}
          onRetry={cloud.retry}
          renderActions={id => {
            const row = archiveRows.find(item => item.id === id);
            return row && <LibraryActions key={row.id} kind="song" title={row.title} archived disabled={!!busy || !canManage(row)}
              onAction={action => manageSong(row, action)} onError={setActionError} />;
          }}
        />
      ) : isArchived ? (
        <section className="archive-room" aria-labelledby="archive-title">
          <header className="archive-header">
            <h2 id="archive-title">Archive</h2>
            <button className="library-dialog-button" onClick={() => setArchiveView(false, true)}>Back to songs</button>
          </header>
        </section>
      ) : !rows.length ? (
        <div className="songs-empty"><div className="song-sleeve" aria-hidden="true"><RecordSleeve title="Your next idea" /></div><h2>No songs yet</h2><a className="button button-primary" href="/studio">Start a song</a></div>
      ) : groups.filter(group => group.rows.length).map(group => <section key={group.key} className="song-group" data-storage={group.key} aria-labelledby={`songs-${group.key}`}>
        <div className="song-group-header">
          <h2 id={`songs-${group.key}`}><group.icon size={17} aria-hidden="true" />{group.title}</h2>
          {group.key === 'device' && group.rows.some(canBackUp) && (selecting ? (
            <div className="song-selection-actions">
              <button className="library-dialog-button" disabled={!!busy} onClick={() => { setSelected([]); setSelecting(false); }}>Cancel</button>
              <button className="library-dialog-button" data-variant="primary" disabled={!selected.length || !!busy} onClick={() => void backUpSongs(selected)}>
                <CloudUpload size={15} aria-hidden="true" />{busy === 'backup' ? 'Preparing…' : `Back up${selected.length ? ` (${selected.length})` : ''}`}
              </button>
            </div>
          ) : <button className="library-dialog-button" disabled={!!busy} onClick={() => setSelecting(true)}><CloudUpload size={15} aria-hidden="true" />Select for backup</button>)}
        </div>
        <ul className="songs-list">{group.rows.map(renderRow)}</ul>
      </section>)}
      {groups[1].rows.length > 0 && !isArchived && <p className="songs-local-note">Local-only songs are stored in this browser. Clearing its site data removes those copies.</p>}
    </main>
  </div>;
}
