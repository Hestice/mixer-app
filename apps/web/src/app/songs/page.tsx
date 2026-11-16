'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { listSongs, updateSavedSong, type SongSummary } from '../../lib/song-store';
import { timeLabel } from '../../lib/session';
import { useRecordNavigation } from '../../components/record-transition';
import { RecordDisc, RecordSleeve } from '../../components/record-artwork';
import type { RecordArt } from '../../lib/record-art';
import { clipBounds } from '../../lib/clip-edits';
import { lifecycle, type LibraryAction, type Lifecycle } from '../../lib/library-entry';
import type { CloudSong } from '../../lib/cloud-manifest';
import { LibraryDialog } from '../../components/library-dialog';
import { CloudAccount } from '../../components/cloud-account';
import { useCloud } from '../../components/cloud-provider';
import { cloudMessage } from '../../lib/supabase-transport';
import '../studio.css';

function SongArtwork({ id, title, artwork, opening = false, returning = false }: { id: string; title: string; artwork?: RecordArt; opening?: boolean; returning?: boolean }) {
  return <div className={`song-artwork${opening ? ' is-opening' : ''}${returning ? ' is-returning' : ''}`} aria-hidden="true">
    <span className="song-artwork-disc"><RecordDisc artwork={artwork} /></span>
    <div className="song-sleeve" data-song-sleeve={id}><RecordSleeve artwork={artwork} title={title} /></div>
  </div>;
}

interface SongRow extends Lifecycle {
  id: string;
  title: string;
  artwork?: RecordArt;
  local?: SongSummary;
  remote?: CloudSong;
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
  const [managing, setManaging] = useState<SongRow | null>(null);
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
  useEffect(() => { setSelected([]); setManaging(null); setActionError(''); }, [cloud.user?.id]);
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
      || remote.content.archivedAt != null && remote.revision > (link?.remoteRevision ?? 0) && !link?.libraryEdit)) return cloudRow(remote, song);
    return { ...song, local: song, remote, editRemote: false };
  });
  const remoteRows = cloud.remoteSongs.filter(song => !cloud.links.some(link => link.ownerId === cloud.user?.id && link.remoteId === song.id && visible.some(local => local.id === link.id))).map(song => cloudRow(song));
  const rows = [...localRows, ...remoteRows].filter(row => lifecycle(row) === view);
  const selectable = localRows.filter(row => row.local && !row.local.ownerId && lifecycle(row) === 'active');
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  async function manageSong(row: SongRow, action: LibraryAction) {
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
  async function backUpSelected() {
    setBusy('backup'); setActionError('');
    try { await cloud.selectSongs(selected); setSelected([]); }
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
  return <div className="studio-app" data-song-collection>
    {managing && <LibraryDialog kind="song" title={managing.title} archived={lifecycle(managing) === 'archived'} onClose={() => setManaging(null)} onAction={action => manageSong(managing, action)} />}
    {opening && <p className="song-opening-status" role="status">Opening song…</p>}
    <header className="studio-header"><a className="wordmark" href="/"><span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /></span>listening room.</a><a className="text-button" href="/studio">New song <span aria-hidden="true">+</span></a></header>
    <main className="songs-page">
      <div className="songs-heading"><span className="studio-eyebrow">YOUR RECORD COLLECTION</span><h1>My songs</h1><p>Pick up where you left off.</p></div>
      <CloudAccount />
      <p className="songs-local-note">Local autosave is always on. Only selected songs are backed up. Device-only songs are removed if this browser’s site data is cleared.</p>
      <div className="library-tabs" role="group" aria-label="Song collection">
        <button aria-pressed={view === 'active'} disabled={!!opening} onClick={() => { setView('active'); setActionError(''); }}>Songs</button>
        <button aria-pressed={view === 'archived'} disabled={!!opening} onClick={() => { setView('archived'); setSelected([]); setActionError(''); }}>Archive</button>
      </div>
      {view === 'active' && cloud.user && !!selectable.length && <div className="cloud-selection"><p>Select the device-only songs you want in <strong>{cloud.user.email}</strong>’s backup.</p><button className="button button-secondary" disabled={!selected.length || !!busy} onClick={() => void backUpSelected()}>{busy === 'backup' ? 'Preparing backup…' : `Back up selected${selected.length ? ` (${selected.length})` : ''}`}</button></div>}
      {actionError && <p className="cloud-error" role="alert">{actionError}</p>}
      {loading ? <p role="status">Opening your collection…</p> : error ? <div className="songs-empty"><p role="alert">{error}</p><button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button></div> : !rows.length ? view === 'archived' ? (
        <div className="songs-empty"><h2>No archived songs</h2><p>Archived songs will appear here until you restore or delete them.</p></div>
      ) : <div className="songs-empty"><div className="song-sleeve" aria-hidden="true"><RecordSleeve title="Your next idea" /></div><h2>A place for your next idea.</h2><p>Record a take and it will be waiting here—even before you keep it.</p><a className="button button-primary" href="/studio">Start a song</a></div> : <ul className="songs-list">
        {rows.map(row => {
          const local = row.local;
          const link = local && cloud.links.find(item => item.id === local.id && item.ownerId === cloud.user?.id);
          const remoteId = link?.remoteId ?? row.remote?.id;
          const isOpening = opening === row.id;
          const isArchived = view === 'archived';
          const body = <>
            <SongArtwork id={row.id} artwork={row.artwork} title={row.title} opening={isOpening} returning={flight?.direction === 'songs' && flight.songId === row.id} />
            <div className="song-card-info">
              <h2>{row.title}{link?.recovered && <small>Recovered version</small>}</h2>
              <p>{row.layerCount} {row.layerCount === 1 ? 'layer' : 'layers'} · {timeLabel(row.duration)}{row.hasTake && <span className="song-review-badge">Take to review</span>}</p>
              <time dateTime={new Date(row.updatedAt).toISOString()}>Last saved {dateFormat.format(row.updatedAt)}</time>
              <span className="song-backup-status">{local ? cloud.status(local.id, local.revision) || 'Saved on this device' : 'In your cloud backup'}</span>
            </div>
            {!isArchived && <span className="song-open">{isOpening ? local ? 'Opening…' : 'Downloading…' : 'Open'} <span aria-hidden="true">{local ? '↗' : '↓'}</span></span>}
          </>;
          return <li key={row.id}>
            <div className="song-select-row">
              {!isArchived && local && cloud.user && !local.ownerId && <label className="song-select"><input type="checkbox" aria-label={`Back up ${row.title}`} checked={selected.includes(row.id)} disabled={!!busy} onChange={event => setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} /></label>}
              {isArchived ? <div className="song-card archived-song">{body}</div> : remoteId ? (
                <button className="song-card" aria-disabled={!!busy || (!local && !cloud.online)} aria-busy={isOpening} onClick={() => {
                  if (cloud.online || local) void openSong(row.id, remoteId, row.artwork, true);
                }}>{body}</button>
              ) : <a className="song-card" aria-disabled={!!busy} aria-busy={isOpening} href={`/studio?song=${encodeURIComponent(row.id)}`} onClick={event => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault(); void openSong(row.id, row.id, row.artwork);
              }}>{body}</a>}
              <button className="text-button library-manage song-manage" disabled={!!busy || row.editRemote && !cloud.online} aria-label={`Manage ${row.title}`} onClick={() => setManaging(row)}>Manage</button>
            </div>
            {local && cloud.errors[local.id] && <div className="song-backup-error"><p>{cloud.errors[local.id]}</p><button className="text-button" onClick={cloud.retry}>Retry backup</button></div>}
          </li>;
        })}
      </ul>}
    </main>
  </div>;
}
