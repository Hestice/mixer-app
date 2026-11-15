'use client';

import { useEffect, useState } from 'react';
import { listSongs, type SongSummary } from '../../lib/song-store';
import { timeLabel } from '../../lib/session';
import '../studio.css';

export default function SongsPage() {
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let canceled = false;
    const refresh = () => {
      void listSongs().then((items) => {
        if (!canceled) { setSongs(items); setError(''); }
      }).catch(() => {
        if (!canceled) setError('Could not open your songs. Check that browser storage is available, then try again.');
      }).finally(() => { if (!canceled) setLoading(false); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => { canceled = true; window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); };
  }, []);

  return <div className="studio-app">
    <header className="studio-header"><a className="wordmark" href="/"><span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /></span>listening room.</a><a className="text-button" href="/studio">New song <span aria-hidden="true">+</span></a></header>
    <main className="songs-page">
      <div className="songs-heading"><span className="studio-eyebrow">YOUR RECORD COLLECTION</span><h1>My songs</h1><p>Pick up where you left off.</p></div>
      <p className="songs-local-note">Saved in this browser, on this device. Clearing site data removes these songs. Download your takes for a separate copy.</p>
      {loading ? <p role="status">Opening your collection…</p> : error ? <div className="songs-empty"><p role="alert">{error}</p><button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button></div> : !songs.length ? <div className="songs-empty"><div className="song-sleeve" aria-hidden="true"><span /></div><h2>A place for your next idea.</h2><p>Record a take and it will be waiting here—even before you keep it.</p><a className="button button-primary" href="/studio">Start a song</a></div> : <ul className="songs-list">{songs.map((song) => <li key={song.id}><a className="song-card" href={`/studio?song=${encodeURIComponent(song.id)}`}><div className="song-sleeve" aria-hidden="true"><span /></div><div className="song-card-info"><h2>{song.title}</h2><p>{song.layerCount} {song.layerCount === 1 ? 'layer' : 'layers'} · {timeLabel(song.duration)}{song.hasTake && <span className="song-review-badge">Take to review</span>}</p><time dateTime={new Date(song.updatedAt).toISOString()}>Last saved {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(song.updatedAt)}</time></div><span className="song-open">Open <span aria-hidden="true">↗</span></span></a></li>)}</ul>}
    </main>
  </div>;
}
