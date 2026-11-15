'use client';

import { useEffect, useState } from 'react';
import { listSongs, type SongSummary } from '../../lib/song-store';
import { timeLabel } from '../../lib/session';
import { CloudAccount } from '../../components/cloud-account';
import { useCloud } from '../../components/cloud-provider';
import { cloudMessage } from '../../lib/supabase-transport';
import '../studio.css';

export default function SongsPage() {
  const cloud = useCloud();
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  useEffect(() => { setSelected([]); setActionError(''); }, [cloud.user?.id]);
  useEffect(() => {
    let canceled = false;
    const refresh = () => {
      void listSongs().then((items) => { if (!canceled) { setSongs(items); setError(''); } })
        .catch(() => { if (!canceled) setError('Could not open your songs. Check that browser storage is available, then try again.'); })
        .finally(() => { if (!canceled) setLoading(false); });
    };
    refresh();
    window.addEventListener('focus', refresh); window.addEventListener('pageshow', refresh);
    return () => { canceled = true; window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); };
  }, [cloud.version]);

  const visible = songs.filter((song) => !song.ownerId || cloud.ready && song.ownerId === cloud.user?.id);
  const cloudOnly = cloud.remoteSongs.filter((song) => !cloud.links.some((link) => link.ownerId === cloud.user?.id && link.remoteId === song.id && visible.some((local) => local.id === link.id)));
  async function backUpSelected() {
    setBusy('backup'); setActionError('');
    try { await cloud.selectSongs(selected); setSelected([]); }
    catch (reason) { setActionError(cloudMessage(reason)); }
    finally { setBusy(''); }
  }
  async function openRemote(id: string) {
    setBusy(id); setActionError('');
    try { const localId = await cloud.openRemote(id); window.location.assign(`/studio?song=${encodeURIComponent(localId)}`); }
    catch (reason) { setActionError(cloudMessage(reason)); }
    finally { setBusy(''); }
  }
  return <div className="studio-app">
    <header className="studio-header"><a className="wordmark" href="/"><span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /></span>listening room.</a><a className="text-button" href="/studio">New song <span aria-hidden="true">+</span></a></header>
    <main className="songs-page">
      <div className="songs-heading"><span className="studio-eyebrow">YOUR RECORD COLLECTION</span><h1>My songs</h1><p>Pick up where you left off.</p></div>
      <CloudAccount />
      <p className="songs-local-note">Local autosave is always on. Only selected songs are backed up. Device-only songs are removed if this browser’s site data is cleared.</p>
      {cloud.user && visible.some((song) => !song.ownerId) && <div className="cloud-selection"><p>Select the device-only songs you want in <strong>{cloud.user.email}</strong>’s backup.</p><button className="button button-secondary" disabled={!selected.length || !!busy} onClick={() => void backUpSelected()}>{busy === 'backup' ? 'Preparing backup…' : `Back up selected${selected.length ? ` (${selected.length})` : ''}`}</button></div>}
      {actionError && <p className="cloud-error" role="alert">{actionError}</p>}
      {loading ? <p role="status">Opening your collection…</p> : error ? <div className="songs-empty"><p role="alert">{error}</p><button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button></div> : !visible.length && !cloudOnly.length ? <div className="songs-empty"><div className="song-sleeve" aria-hidden="true"><span /></div><h2>A place for your next idea.</h2><p>Record a take and it will be waiting here—even before you keep it.</p><a className="button button-primary" href="/studio">Start a song</a></div> : <ul className="songs-list">
        {visible.map((song) => {
          const link = cloud.links.find((item) => item.id === song.id && item.ownerId === cloud.user?.id);
          const body = <><div className="song-sleeve" aria-hidden="true"><span /></div><div className="song-card-info"><h2>{song.title}{link?.recovered && <small>Recovered version</small>}</h2><p>{song.layerCount} {song.layerCount === 1 ? 'layer' : 'layers'} · {timeLabel(song.duration)}{song.hasTake && <span className="song-review-badge">Take to review</span>}</p><time dateTime={new Date(song.updatedAt).toISOString()}>Last saved {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(song.updatedAt)}</time><span className="song-backup-status">{cloud.status(song.id, song.revision) || 'Saved on this device'}</span></div><span className="song-open">{busy === link?.remoteId ? 'Opening…' : 'Open'} <span aria-hidden="true">↗</span></span></>;
          return <li key={song.id}><div className="song-select-row">{cloud.user && !song.ownerId && <label className="song-select"><input type="checkbox" aria-label={`Back up ${song.title}`} checked={selected.includes(song.id)} disabled={!!busy} onChange={(event) => setSelected((current) => event.target.checked ? [...current, song.id] : current.filter((id) => id !== song.id))} /></label>}{link ? <button className="song-card" disabled={!!busy} onClick={() => void openRemote(link.remoteId)}>{body}</button> : <a className="song-card" href={`/studio?song=${encodeURIComponent(song.id)}`}>{body}</a>}</div>{cloud.errors[song.id] && <div className="song-backup-error"><p>{cloud.errors[song.id]}</p><button className="text-button" onClick={cloud.retry}>Retry backup</button></div>}</li>;
        })}
        {cloudOnly.map((song) => <li key={`cloud-${song.id}`}><button className="song-card" disabled={!!busy || !cloud.online} onClick={() => void openRemote(song.id)}><div className="song-sleeve" aria-hidden="true"><span /></div><div className="song-card-info"><h2>{song.content.title || 'Untitled song'}</h2><p>{song.content.layers.length} layers{song.content.candidate && <span className="song-review-badge">Take to review</span>}</p><span className="song-backup-status">In your cloud backup · download to open</span></div><span className="song-open">{busy === song.id ? 'Downloading…' : 'Open'} <span aria-hidden="true">↓</span></span></button></li>)}
      </ul>}
    </main>
  </div>;
}
