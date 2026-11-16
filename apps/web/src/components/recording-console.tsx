'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { Studio } from '../hooks/use-studio';
import { useTurntableMotion } from '../hooks/use-turntable-motion';
import { Mic, Plus, Download, RotateCcw, Check, X } from './icons';
import { clipBounds } from '../lib/clip-edits';
import { useRecordNavigation } from './record-transition';
import { StudioTurntable } from './studio-turntable';
import { RecordCustomizer } from './record-customizer';
import { Archive, ArrowLeft } from 'lucide-react';
import { LayerActions } from './studio-layer';
import { SongTimeline } from './song-timeline';
import { StudioCapturePanel } from './studio-capture-panel';
import '../app/studio.css';

export function RecordingConsole({ studio }: { studio: Studio }) {
  const { title, setTitle } = studio;
  const { arrive, flight, finish, returnToSongs, rememberArtwork } = useRecordNavigation();
  const [notice, setNotice] = useState('');
  const [compactDeck, setCompactDeck] = useState(false);
  const turntable = useTurntableMotion(studio.playing, {
    position: studio.position, readPosition: studio.readSongPosition, stopVersion: studio.stopVersion,
  });
  const [customizing,setCustomizing]=useState(false);
  const recordButton = useRef<HTMLButtonElement>(null);
  const [captureOptions, setCaptureOptions] = useState<boolean | null>(null);
  const recordingPanel = useRef<HTMLElement>(null);
  const state = studio.recordingState;
  const recording = state === 'recording';
  const review = state === 'review' && !!studio.candidate;
  const duration = Math.max(0, ...studio.layers.map((layer) => clipBounds(layer).end));
  const span = Math.max(16, duration + 4, studio.candidate ? clipBounds(studio.candidate).end + 4 : 0, recording ? studio.recordFrom + studio.elapsed + 4 : 0);
  const beat = studio.beatIndex % 4;

  useLayoutEffect(() => { if (studio.songId) rememberArtwork(studio.songId, studio.artwork); }, [rememberArtwork, studio.songId, studio.artwork]);
  useLayoutEffect(() => {
    if (flight?.direction !== 'studio') return;
    if (studio.loadError) finish();
    else if (studio.localReady && studio.songId) arrive('studio', studio.songId);
  }, [arrive, finish, flight, studio.loadError, studio.localReady, studio.songId]);

  function toggleTransport(keptMix = false) {
    void studio.togglePlayback({ cue: turntable.cuePlayback, closeCue: turntable.closeCue, keptMix });
  }

  function stopTransport() {
    studio.stopPlayback();
    turntable.closeCue();
  }

  function keep() {
    const name = studio.candidate?.name;
    studio.keepCandidate(); setNotice(studio.retakeLayerId ? `${name} now uses this take. Earlier takes are still saved.` : `${name} added to your song.`);
  }
  function discardTake() {
    if (!studio.discardTake()) return;
    setNotice('Take discarded. Undo brings it back.');
    recordButton.current?.focus({ preventScroll: true });
  }

  function capture() {
    setNotice('');
    if (recording) {
      setCaptureOptions(true);
      void studio.stopRecording();
    } else if (state === 'countdown') studio.cancelCountIn();
    else if (state === 'ready') void studio.record();
    else if (review) {
      setCaptureOptions(null);
      keep();
    } else {
      setCaptureOptions(true);
      void studio.enableMicrophone();
    }
  }

  function revealRecording() {
    const target = recordButton.current?.disabled ? recordingPanel.current : recordButton.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }

  function retakeLayer(id: string) {
    setCaptureOptions(true);
    setNotice('');
    studio.recordAnother(id);
    revealRecording();
  }

  function addLayer() {
    revealRecording();
    if (state === 'idle') capture();
    else setCaptureOptions(true);
  }

  if (!studio.localReady) return <div className="studio-app studio-workspace"><main className="studio-desk studio-loading"><span className="studio-eyebrow">LISTENING ROOM</span><h1>{studio.loadError ? 'Could not open this song' : 'Opening your song…'}</h1><p role={studio.loadError ? 'alert' : 'status'}>{studio.loadError || 'Bringing your layers back to the desk.'}</p>{studio.loadError && <div className="songs-actions"><button className="button button-primary" onClick={() => window.location.reload()}>Try again</button><a className="button button-secondary" href="/songs">My songs</a></div>}</main></div>;

  return <div className="studio-app studio-workspace">
    {customizing && <RecordCustomizer title={title} artwork={studio.artwork} onClose={()=>setCustomizing(false)} onDone={art=>{studio.setArtwork(art);setCustomizing(false);setNotice('Record appearance saved.');}} />}
    <a className="skip-link" href="#studio-capture" onClick={event => { event.preventDefault(); revealRecording(); }}>Skip to recording controls</a>
    <main className="studio-desk" aria-label="Recording console">
      <header className="studio-project">
        <button className="studio-toolbar-button studio-library-link" disabled={studio.locked || studio.busy} onClick={() => void studio.openMySongs(() => returnToSongs(studio.songId, studio.artwork))}><ArrowLeft size={16} aria-hidden="true" />My songs</button>
        <div className="studio-project-name">
          <label htmlFor="song-title">Song name</label>
          <input id="song-title" maxLength={70} value={title} onChange={event => setTitle(event.target.value)} />
        </div>
        <span className={`studio-storage ${studio.saveState === 'error' ? 'save-failed' : ''}`} role="status"><span aria-hidden="true" />{studio.saveState === 'error' ? 'Not saved' : recording ? 'Recording · save when stopped' : state === 'processing' ? 'Preparing take…' : studio.audioError ? 'Audio unavailable' : studio.saveState === 'saved' ? 'Saved on this device' : 'Saving…'}</span>
        <button className="studio-toolbar-button studio-undo" aria-label="Undo last change" title="Undo last change" disabled={studio.locked || studio.busy || !studio.canUndoEdit} onClick={() => { studio.undoEdit(); setNotice('Last change undone.'); }}><RotateCcw size={16} aria-hidden="true" /></button>
      </header>
      <div className="studio-playback" data-compact={compactDeck}>
        <StudioTurntable studio={studio} span={span} duration={duration} motion={turntable}
          onTogglePlayback={toggleTransport} onStopPlayback={stopTransport} onEdit={() => setCustomizing(true)}
          compact={compactDeck} onToggleCompact={() => setCompactDeck(value => !value)} />
        <div className="studio-mix" role="group" aria-label="Song mix">
          <label>Song volume<input type="range" min="0" max="1" step=".01" value={studio.volume} onChange={event => studio.setVolume(Number(event.target.value))} /></label>
          {!!studio.layers.length && <button className="button button-light" disabled={studio.locked || studio.busy} onClick={() => void studio.downloadSong()} aria-describedby="song-export-help"><Download size={16} />{studio.exportBusy ? 'Preparing song…' : 'Download song'}</button>}
          {!!studio.layers.length && <p id="song-export-help" className="studio-export-help">One WAV with your kept takes, trims, timing and volumes. Muted layers stay silent.{studio.soloId ? ' Downloads use the full song mix.' : ''}{studio.candidate ? ' Keep the take under review to include it.' : ''}</p>}
          <p className="studio-export-status" role="status">{studio.exportStatus}</p>
        </div>
      </div>
      <div className="studio-tools">
        {studio.audioError && !studio.saveError && <div className="studio-save-error" role="alert"><p>{studio.audioError}</p></div>}
        {studio.saveError && <div className="studio-save-error" role="alert"><p>{studio.saveError}</p><button className="text-button" onClick={() => void studio.retrySave()}>Retry save</button></div>}
        {studio.cloudStatus && <div className="studio-cloud-status" role="status"><span>{studio.cloudStatus}</span>{studio.cloudError && <><p>{studio.cloudError}</p><button className="text-button" onClick={studio.retryCloud}>Retry backup</button></>}</div>}
        <div className="studio-body">
          <SongTimeline studio={studio} span={span} onRetake={retakeLayer}
            cueing={turntable.cueing} onToggleMix={() => toggleTransport(true)}>
            {!studio.layers.length && <div className="studio-empty"><span className="studio-empty-lines" aria-hidden="true">{[9, 18, 30, 42, 24, 12, 22].map((height, index) => <i key={index} style={{ height }} />)}</span><h2>Start with a small idea.</h2><p>A chord progression. A melody.<br />Something you want to remember.</p><button className="button button-dark" disabled={state !== 'idle' || studio.busy} onClick={addLayer}><Mic size={17} />Record your first layer</button></div>}
            {!!studio.archivedLayers.length && <details className="layer-archive">
              <summary><Archive size={14} aria-hidden="true" /> Archived layers <span>{studio.archivedLayers.length}</span></summary>
              <ul>{studio.archivedLayers.map(layer => <li key={layer.id}><span>{layer.name}</span><LayerActions layer={layer} studio={studio} archived /></li>)}</ul>
            </details>}
            {!!studio.layers.length && <button className="studio-add" disabled={studio.locked || studio.busy || !!studio.candidate} onClick={addLayer}><Plus size={16} />Add another layer</button>}
            {notice && <p className="studio-notice" role="status"><Check size={15} />{notice}</p>}
          </SongTimeline>

          <StudioCapturePanel studio={studio} panelRef={recordingPanel} recordButton={recordButton}
            open={captureOptions} onOpenChange={setCaptureOptions} onCapture={capture} onDiscard={discardTake} />
        </div>
      </div>
    </main>
    <div className="studio-count-in-overlay" data-active={state === 'countdown' && studio.countdown > 0} aria-hidden="true">
      <div className="studio-count-in-display">
        <span className="studio-count-in-number" key={studio.countdown}>{studio.countdown || ''}</span>
        <span>Count-in</span>
      </div>
    </div>
    {studio.beatIndex >= 0 && <div key={studio.beatIndex} className="studio-beat-pulse" aria-hidden="true"
      data-downbeat={beat === 0} data-side={beat % 2 === 0 ? 'left' : 'right'} />}
    {studio.error && <div className="error-toast" role="alert"><span>{studio.error}</span><button onClick={() => studio.setError('')} aria-label="Dismiss message"><X size={18} /></button></div>}
  </div>;
}
