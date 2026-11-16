'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import '../studio.css';

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

export default function SongsPage() {
  const cloud = useCloud();
  const { flight, enterStudio, arrive } = useRecordNavigation();
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
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
  useEffect(() => { setSelected([]); setSelecting(false); setActionError(''); }, [cloud.user?.id]);
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
  const hasArchived = catalogue.some(row => lifecycle(row) === 'archived');
  const isArchived = view === 'archived' && hasArchived;
  const rows = catalogue.filter(row => lifecycle(row) === (isArchived ? 'archived' : 'active'))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const hasCloudCopy = (row: SongRow) => !!row.remote || (row.link?.remoteRevision ?? 0) > 0;
  const canBackUp = (row: SongRow) => !isArchived && !!cloud.user && !!row.local && !row.local.ownerId;
  const groups = [
    { key: 'cloud', title: 'Backed up', icon: CloudCheck, rows: rows.filter(hasCloudCopy) },
    { key: 'device', title: 'On this device', icon: HardDrive, rows: rows.filter(row => !hasCloudCopy(row)) },
  ];
  useEffect(() => { if (!hasArchived && !loading) setView('active'); }, [hasArchived, loading]);
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  async function manageSong(row: SongRow, action: LibraryAction) {
    setActionError('');
    if (row.editRemote && row.remote) {
      try { await cloud.manageRemote(row.remote.id, row.remote.revision, action); }
      catch (reason) { if (reason instanceof Error) throw reason; throw new Error(cloudMessage(reason)); }
    } else if (row.local) {
      try { await updateSavedSong(row.local.id, row.local.revision, cloud.user?.id, action); }
      finally { setSongs(await listSongs().catch(() => songs)); }
      setSelected(current => current.filter(id => id !== row.local?.id));
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
      {!isArchived && <span className="song-open" aria-hidden="true">{isOpening ? local ? 'Opening…' : 'Downloading…' : <SelectIcon size={17} />}</span>}
    </>;
    return <li key={row.id} className="song-row">
      <div className="song-select-row">
        {isArchived ? <div className="song-card archived-song">{body}</div> : remoteId ? (
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
          : <LibraryActions kind="song" title={row.title} archived={isArchived} disabled={!!busy || (row.editRemote && !cloud.online)}
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
        <button aria-pressed={!isArchived} disabled={!!busy} onClick={() => { setView('active'); setActionError(''); }}><Library size={14} aria-hidden="true" />Songs</button>
        <button aria-pressed={isArchived} disabled={!!busy} onClick={() => { setView('archived'); setSelected([]); setSelecting(false); setActionError(''); }}><Archive size={14} aria-hidden="true" />Archive</button>
      </div>}
      {actionError && <p className="cloud-error song-library-error" role="alert">{actionError}</p>}
      {loading ? <p role="status">Opening your collection…</p> : error ? <div className="songs-empty"><p role="alert">{error}</p><button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button></div> : !rows.length ? (
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
