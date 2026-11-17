'use client';

import { useLayoutEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Studio } from '../hooks/use-studio';
import { useStudioDeckControls } from '../hooks/use-studio-deck-controls';
import { useStudioTransportShortcut } from '../hooks/use-studio-transport-shortcut';
import { useDetachedStudioPanels } from '../hooks/use-detached-studio-panels';
import { RotateCcw } from './icons';
import { useRecordNavigation } from './record-transition';
import { StudioDeck } from './studio-deck';
import { StudioFeedback } from './studio-panel-content';
import '../app/studio.css';

export function RecordingConsole({ studio }: { studio: Studio }) {
  const { arrive, flight, finish, returnToSongs, rememberArtwork } = useRecordNavigation();
  const deck = useStudioDeckControls(studio);
  useStudioTransportShortcut(deck);
  const tabs = useDetachedStudioPanels(deck);
  const state = studio.recordingState;

  useLayoutEffect(() => { if (studio.songId) rememberArtwork(studio.songId, studio.artwork); }, [rememberArtwork, studio.songId, studio.artwork]);
  useLayoutEffect(() => {
    if (flight?.direction !== 'studio') return;
    if (studio.loadError) finish();
    else if (studio.localReady && studio.songId) arrive('studio', studio.songId);
  }, [arrive, finish, flight, studio.loadError, studio.localReady, studio.songId]);

  if (!studio.localReady) return <div className="studio-app studio-workspace"><main className="studio-desk studio-loading"><span className="studio-eyebrow">LISTENING ROOM</span><h1>{studio.loadError ? 'Could not open this song' : 'Opening your song…'}</h1><p role={studio.loadError ? 'alert' : 'status'}>{studio.loadError || 'Bringing your layers back to the desk.'}</p>{studio.loadError && <div className="songs-actions"><button className="button button-primary" onClick={() => window.location.reload()}>Try again</button><a className="button button-secondary" href="/songs">My songs</a></div>}</main></div>;

  return <div className="studio-app studio-workspace">
    <a className="skip-link" href="#studio-capture" onClick={event => { event.preventDefault(); deck.revealRecording(); }}>Skip to recording controls</a>
    <main className="studio-desk" aria-label="Recording console">
      <header className="studio-project">
        <button className="studio-toolbar-button studio-library-link" disabled={studio.locked || studio.busy} onClick={() => void studio.openMySongs(() => returnToSongs(studio.songId, studio.artwork))}><ArrowLeft size={16} aria-hidden="true" />My songs</button>
        <div className="studio-project-name">
          <label htmlFor="song-title">Song name</label>
          <input id="song-title" maxLength={70} value={studio.title} onChange={event => studio.setTitle(event.target.value)} />
        </div>
        <span className={`studio-storage ${studio.saveState === 'error' ? 'save-failed' : ''}`} role="status"><span aria-hidden="true" />{studio.saveState === 'error' ? 'Not saved' : state === 'recording' ? 'Recording · save when stopped' : state === 'processing' ? 'Preparing take…' : studio.audioError ? 'Audio unavailable' : studio.saveState === 'saved' ? 'Saved on this device' : 'Saving…'}</span>
        <button className="studio-toolbar-button studio-undo" aria-label="Undo last change" title="Undo last change" disabled={studio.locked || studio.busy || !studio.canUndoEdit} onClick={() => { studio.undoEdit(); deck.setNotice('Last change undone.'); }}><RotateCcw size={16} aria-hidden="true" /></button>
      </header>
      {studio.audioError && !studio.saveError && <div className="studio-save-error" role="alert"><p>{studio.audioError}</p></div>}
      {studio.saveError && <div className="studio-save-error" role="alert"><p>{studio.saveError}</p><button className="text-button" onClick={() => void studio.retrySave()}>Retry save</button></div>}
      {studio.cloudStatus && <div className="studio-cloud-status" role="status"><span>{studio.cloudStatus}</span>{studio.cloudError && <><p>{studio.cloudError}</p><button className="text-button" onClick={studio.retryCloud}>Retry backup</button></>}</div>}
      <StudioDeck deck={deck} tabs={tabs} />
    </main>
    <StudioFeedback deck={deck} />
  </div>;
}
