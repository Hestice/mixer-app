'use client';

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Studio } from '../hooks/use-studio';
import { timeLabel, type Layer } from '../lib/session';
import { Mic, Play, Pause, Square, Plus, Download, RotateCcw, Headphones, Check, X } from './icons';
import { ClipEditor, TakePicker } from './clip-editor';
import { clipBounds } from '../lib/clip-edits';
import { Waveform } from './waveform';
import { useRecordNavigation } from './record-transition';
import { StudioTurntable } from './studio-turntable';
import { RecordCustomizer } from './record-customizer';
import { Archive, ArrowLeft, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { LibraryActions } from './library-actions';
import { SongTimeline, preciseTime } from './song-timeline';
import '../app/studio.css';

function LayerActions({ layer, studio, archived }: { layer: Layer; studio: Studio; archived?: boolean }) {
  return <LibraryActions kind="layer" title={layer.name} archived={archived}
    disabled={studio.locked || studio.busy || studio.retakeLayerId === layer.id}
    onAction={action => action.type === 'rename' ? studio.renameLayer(layer.id, action.title) : studio.manageLayer(layer.id, action.type)}
    onError={studio.setError} />;
}

function Track({ layer, studio, span }: { layer: Layer; studio: Studio; span: number }) {
  const duration = clipBounds(layer).length;
  const audible = studio.soloId ? studio.soloId === layer.id : layer.enabled;
  return <article className={`studio-track ${audible ? '' : 'is-muted'}`} aria-label={`${layer.name} layer`}>
    <div className="studio-track-head"><span className={`layer-color ${layer.kind}-color`} /><h3>{layer.name}</h3><time>{timeLabel(duration)}</time><LayerActions layer={layer} studio={studio} /></div>
    <TakePicker layer={layer} studio={studio} />
    <ClipEditor layer={layer} studio={studio} span={span} detailsOnly />
    <div className="studio-track-controls">
      <button aria-pressed={!layer.enabled} disabled={studio.locked || studio.busy} onClick={() => void studio.toggleLayer(layer.id)}>{layer.enabled ? 'Mute' : 'Unmute'}</button>
      <button aria-pressed={studio.soloId === layer.id} disabled={studio.locked || studio.busy} onClick={() => studio.soloId === layer.id ? studio.setSoloId(null) : void studio.auditionLayer(layer, true)}>{studio.soloId === layer.id ? 'Hear all' : 'Hear alone'}</button>
      <label>Volume<input aria-label={`${layer.name} volume`} type="range" min="0" max="1" step=".01" disabled={studio.locked} value={layer.volume} onChange={(event) => studio.setLayerVolume(layer.id, Number(event.target.value))} /></label>
      <button disabled={studio.locked || studio.busy} onClick={() => void studio.auditionLayer(layer, false)}>Listen from cursor</button>
      {layer.recorded && <button disabled={studio.locked || studio.busy || !!studio.candidate} onClick={() => studio.recordAnother(layer.id)}>Record another take</button>}
      {layer.recorded && <button className="studio-download" onClick={() => studio.download(layer)} aria-label={`Download ${layer.name} original WAV`}><Download size={14} /><span>Original WAV</span></button>}
    </div>
  </article>;
}

const narrowStudioQuery = '(max-width: 760px)';
const readNarrowStudio = () => window.matchMedia(narrowStudioQuery).matches;
const serverNarrowStudio = () => false;

function subscribeToStudioWidth(onChange: () => void) {
  const width = window.matchMedia(narrowStudioQuery);
  width.addEventListener('change', onChange);
  return () => width.removeEventListener('change', onChange);
}

export function RecordingConsole({ studio }: { studio: Studio }) {
  const { title, setTitle } = studio;
  const { arrive, flight, finish, returnToSongs, rememberArtwork } = useRecordNavigation();
  const [notice, setNotice] = useState('');
  const [compactDeck, setCompactDeck] = useState(false);
  const narrow = useSyncExternalStore(subscribeToStudioWidth, readNarrowStudio, serverNarrowStudio);
  const [customizing,setCustomizing]=useState(false);
  const recordButton = useRef<HTMLButtonElement>(null);
  const [captureOptions, setCaptureOptions] = useState<boolean | null>(null);
  const recordingPanel = useRef<HTMLElement>(null);
  const state = studio.recordingState;
  const recording = state === 'recording';
  const review = state === 'review' && !!studio.candidate;
  const setup = state === 'idle' || state === 'ready';
  const captureOptionsOpen = captureOptions ?? (review || !narrow);
  const duration = Math.max(0, ...studio.layers.map((layer) => clipBounds(layer).end));
  const span = Math.max(16, duration + 4, studio.candidate ? clipBounds(studio.candidate).end + 4 : 0, recording ? studio.recordFrom + studio.elapsed + 4 : 0);
  const meter = Math.min(100, studio.inputLevel * 100);
  const action = { idle: 'Connect microphone', requesting: 'Connecting microphone…', ready: 'Record layer', countdown: 'Cancel count-in', recording: 'Stop recording', processing: 'Preparing take…', review: studio.retakeLayerId ? 'Use this take' : 'Keep this layer' }[state];

  useLayoutEffect(() => { if (studio.songId) rememberArtwork(studio.songId, studio.artwork); }, [rememberArtwork, studio.songId, studio.artwork]);
  useLayoutEffect(() => {
    if (flight?.direction !== 'studio') return;
    if (studio.loadError) finish();
    else if (studio.localReady && studio.songId) arrive('studio', studio.songId);
  }, [arrive, finish, flight, studio.loadError, studio.localReady, studio.songId]);

  function keep() {
    const name = studio.candidate?.name;
    studio.keepCandidate(); setNotice(studio.retakeLayerId ? `${name} now uses this take. Earlier takes are still saved.` : `${name} added to your song.`);
  }
  function capture() {
    setNotice('');
    if (recording) {
      setCaptureOptions(true);
      void studio.stopRecording();
    } else if (state === 'countdown') studio.cancelSetup();
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
        <StudioTurntable studio={studio} span={span} duration={duration} onEdit={() => setCustomizing(true)}
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
          <SongTimeline studio={studio} span={span}>
            <div className="studio-tracks">{studio.layers.map((layer) => <Track key={layer.id} layer={layer} studio={studio} span={span} />)}</div>
            {!studio.layers.length && <div className="studio-empty"><span className="studio-empty-lines" aria-hidden="true">{[9, 18, 30, 42, 24, 12, 22].map((height, index) => <i key={index} style={{ height }} />)}</span><h2>Start with a small idea.</h2><p>A chord progression. A melody.<br />Something you want to remember.</p><button className="button button-dark" disabled={state !== 'idle' || studio.busy} onClick={addLayer}><Mic size={17} />Record your first layer</button></div>}
            {!!studio.archivedLayers.length && <details className="layer-archive">
              <summary><Archive size={14} aria-hidden="true" /> Archived layers <span>{studio.archivedLayers.length}</span></summary>
              <ul>{studio.archivedLayers.map(layer => <li key={layer.id}><span>{layer.name}</span><LayerActions layer={layer} studio={studio} archived /></li>)}</ul>
            </details>}
            {!!studio.layers.length && <button className="studio-add" disabled={studio.locked || studio.busy || !!studio.candidate} onClick={addLayer}><Plus size={16} />Add another layer</button>}
            {notice && <p className="studio-notice" role="status"><Check size={15} />{notice}</p>}
          </SongTimeline>

          <aside className="studio-capture" id="studio-capture" ref={recordingPanel} tabIndex={-1} aria-labelledby="capture-title">
            <div className="studio-capture-bar">
              <div className="studio-capture-heading">
                <span className="studio-mic-icon" aria-hidden="true"><Mic size={21} /></span>
                <div>
                  <h2 id="capture-title">{review ? 'Review take' : recording ? 'Recording' : 'Record a layer'}</h2>
                  {state === 'countdown' ? (
                    <p className="capture-position" role="status">{studio.countdown ? `Starting in ${studio.countdown}…` : 'Getting ready…'}</p>
                  ) : (
                    <p className="capture-position">
                      {recording ? 'Elapsed' : review ? 'Cursor' : 'From'} <time>{recording ? timeLabel(studio.elapsed) : preciseTime(studio.position)}</time>
                    </p>
                  )}
                </div>
              </div>
              <button className="studio-toolbar-button studio-capture-toggle" aria-label="Recording settings" aria-controls="studio-capture-options"
                title={captureOptionsOpen ? 'Hide recording settings' : 'Show recording settings'} aria-expanded={captureOptionsOpen}
                onClick={() => setCaptureOptions(!captureOptionsOpen)}>
                <SlidersHorizontal size={17} aria-hidden="true" />
                <ChevronDown className="studio-capture-chevron" size={12} aria-hidden="true" />
              </button>
              <button ref={recordButton} className={`button studio-record-action ${recording ? 'button-record' : 'button-dark'}`}
                disabled={studio.busy || state === 'requesting' || state === 'processing'} onClick={capture}>
                {recording ? <Square size={16} fill="currentColor" /> : review ? <Check size={16} /> : state === 'countdown' ? <X size={16} /> : <Mic size={16} />}
                {action}
              </button>
            </div>
            <div className="studio-capture-drawer" data-expanded={captureOptionsOpen}>
              <div className="studio-capture-options" id="studio-capture-options" inert={!captureOptionsOpen}
                role="region" aria-label="Recording settings and take review" tabIndex={0}>
                {setup && <p className="studio-help">Your take starts at the timeline cursor.</p>}
                {!review && <label className="studio-field">Name this part<input list="part-suggestions" value={studio.partName} maxLength={50} disabled={!setup || studio.busy} onChange={(event) => studio.setPartName(event.target.value)} placeholder="e.g. Guitar, vocals, harmony" /></label>}
                <datalist id="part-suggestions"><option value="Guitar" /><option value="Vocals" /><option value="Harmony" /><option value="Percussion" /></datalist>
                {!review && <>
                  <details className="studio-rhythm"><summary><span>Timing &amp; metronome</span><small>{studio.tempo} BPM · {studio.metronomeMode === 'off' ? 'Beat off' : studio.metronomeMode === 'visual' ? 'Silent beat' : 'Headphone click'}{studio.countIn ? ' · Count-in on' : ''}</small></summary><fieldset className="studio-timing" disabled={studio.locked || studio.busy}><legend>Find your rhythm</legend>
                    <div className="studio-tempo"><label>Tempo<input type="number" min="40" max="240" step="1" value={studio.tempo} onChange={(event) => studio.setTempo(event.target.valueAsNumber)} /><span>BPM</span></label><label className="studio-check"><input type="checkbox" checked={studio.countIn} onChange={(event) => studio.setCountIn(event.target.checked)} />4-beat count-in</label></div>
                    <label className="studio-field">Metronome<select aria-label="Metronome" value={studio.metronomeMode} onChange={(event) => studio.setMetronomeMode(event.target.value as 'off' | 'visual' | 'sound')}><option value="off">Off</option><option value="visual">Visual beat · silent</option><option value="sound" disabled={!studio.headphones}>Sound + visual · headphones</option></select></label>
                    <label className="studio-check studio-headphones"><input type="checkbox" checked={studio.headphones} onChange={(event) => studio.setHeadphones(event.target.checked)} /><Headphones size={15} />I’m using headphones</label>
                    <p className="studio-help">{studio.headphones ? 'Keep headphone volume low. Wired headphones are best for recording in time.' : 'Use headphones to enable clicks. Speakers can put the click and song back into your microphone.'}</p>
                    <button className="text-button" disabled={studio.metronomeMode === 'off'} onClick={() => void studio.previewMetronome()}>{studio.metronomePreview ? 'Stop beat' : 'Try the beat'}</button>
                  </fieldset></details>
                  <div className="studio-beats" aria-label={state === 'countdown' ? `${studio.countdown} beats until recording` : 'Metronome in four beats'}>{[0, 1, 2, 3].map((index) => <span key={index} className={studio.beat === index ? 'active' : ''} aria-hidden="true">{index + 1}</span>)}</div>
                </>}
                {setup && studio.devices.length > 1 && <label className="studio-field">Microphone<select value={studio.inputDevice} disabled={studio.busy} onChange={(event) => studio.changeInput(event.target.value)}>{studio.devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}</select></label>}
                {!review && <div className="studio-input"><span>{studio.microphoneLabel}</span><div role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter)} className={`studio-input-meter ${meter > 95 ? 'clipping' : ''}`}><i style={{ width: `${meter}%` }} /></div><small>{meter > 95 ? 'Too loud — move back or lower your input gain.' : state === 'ready' ? meter > 1 ? 'Signal detected. You’re ready.' : 'Sing or play a note to check your level.' : 'Microphone audio is never played through your speakers.'}</small></div>}
                {recording && <div className="studio-live"><span><i />Recording <time>{timeLabel(studio.elapsed)}</time></span><Waveform peaks={studio.livePeaks} active compact /></div>}
                {review && studio.candidate && <div className="studio-take"><div><strong>{studio.candidate.name}</strong><time>{timeLabel(studio.candidate.duration ?? 0)}</time></div><TakePicker layer={studio.candidate} studio={studio} draft /><p className="studio-help">Move or trim this take on the song timeline to compare it with your other layers.</p><span>{studio.candidate.peaks?.every((peak) => peak === 0) ? 'No sound detected. Check your microphone and try again.' : studio.retakeLayerId ? 'Your current layer stays until you use this take' : 'Not added to your song yet'}</span><div className="studio-review-buttons"><button className="button button-light" disabled={studio.busy} onClick={() => void studio.reviewTake(true)}><Play size={14} />Hear take</button><button className="button button-light" disabled={studio.busy || !studio.layers.length} onClick={() => void studio.reviewTake(false)}><Play size={14} />With song</button>{studio.playing && <button className="text-button" onClick={() => void studio.togglePlayback()}><Pause size={14} />Pause</button>}</div></div>}
                {(state === 'requesting' || state === 'processing') && <p className="studio-help" role="status">{state === 'requesting' ? 'Allow microphone access in your browser.' : 'Preparing the waveform and your WAV recording.'}</p>}
                {review && <div className="studio-take-actions"><button className="text-button" disabled={studio.busy} onClick={() => studio.recordAnother()}><RotateCcw size={14} />Record another take</button><button className="text-button" onClick={() => studio.download(studio.candidate!)}><Download size={14} />Download original WAV</button></div>}
                {state === 'ready' && <button className="text-button studio-disconnect" onClick={studio.cancelSetup}>{studio.candidate ? 'Back to previous take' : 'Disconnect microphone'}</button>}
                {state === 'ready' && studio.candidate && <p className="studio-help">Your earlier takes stay saved. Recording again adds another choice.</p>}
                <p className="studio-capture-footnote">{review ? 'Every attempt and edit saves automatically. Switch takes to compare; keep the one you like.' : 'Only your microphone is recorded. The click is a listening guide.'}</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
    {studio.error && <div className="error-toast" role="alert"><span>{studio.error}</span><button onClick={() => studio.setError('')} aria-label="Dismiss message"><X size={18} /></button></div>}
  </div>;
}
