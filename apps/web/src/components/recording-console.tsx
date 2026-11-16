'use client';

import { useEffect, useRef, useState } from 'react';
import type { Studio } from '../hooks/use-studio';
import { timeLabel, type Layer } from '../lib/session';
import { Mic, Play, Pause, Square, Plus, Download, RotateCcw, Headphones, Check, X } from './icons';
import { Tonearm } from './tonearm';
import { ClipEditor, TakePicker } from './clip-editor';
import { clipBounds } from '../lib/clip-edits';
import { Waveform } from './waveform';
import { RecordDisc } from './record-artwork';
import { RecordCustomizer } from './record-customizer';
import { SongTimeline, preciseTime } from './song-timeline';
import '../app/studio.css';

function Track({ layer, studio, span }: { layer: Layer; studio: Studio; span: number }) {
  const duration = clipBounds(layer).length;
  const audible = studio.soloId ? studio.soloId === layer.id : layer.enabled;
  return <article className={`studio-track ${audible ? '' : 'is-muted'}`} aria-label={`${layer.name} layer`}>
    <div className="studio-track-head"><span className={`layer-color ${layer.kind}-color`} /><h3>{layer.name}</h3><time>{timeLabel(duration)}</time></div>
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

export function RecordingConsole({ studio }: { studio: Studio }) {
  const { title, setTitle } = studio;
  const [notice, setNotice] = useState('');
  const [customizing,setCustomizing]=useState(false);
  const recordButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLInputElement>(null);
  const state = studio.recordingState;
  const recording = state === 'recording';
  const review = state === 'review' && !!studio.candidate;
  const setup = state === 'idle' || state === 'ready';
  const duration = Math.max(0, ...studio.layers.map((layer) => clipBounds(layer).end));
  const span = Math.max(16, duration + 4, studio.candidate ? clipBounds(studio.candidate).end + 4 : 0, recording ? studio.recordFrom + studio.elapsed + 4 : 0);
  const meter = Math.min(100, studio.inputLevel * 100);
  const action = { idle: 'Connect microphone', requesting: 'Connecting microphone…', ready: 'Record layer', countdown: 'Cancel count-in', recording: 'Stop recording', processing: 'Preparing take…', review: studio.retakeLayerId ? 'Use this take' : 'Keep this layer' }[state];

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [studio.localReady]);

  function keep() {
    const name = studio.candidate?.name;
    studio.keepCandidate(); setNotice(studio.retakeLayerId ? `${name} now uses this take. Earlier takes are still saved.` : `${name} added to your song.`);
  }
  function capture() {
    setNotice('');
    if (state === 'recording') void studio.stopRecording();
    else if (state === 'countdown') studio.cancelSetup();
    else if (state === 'ready') void studio.record();
    else if (review) keep();
    else void studio.enableMicrophone();
  }
  function firstLayer() {
    recordButton.current?.focus();
    recordButton.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    void studio.enableMicrophone();
  }

  if (!studio.localReady) return <div className="studio-app"><main className="songs-page studio-loading"><span className="studio-eyebrow">LISTENING ROOM</span><h1>{studio.loadError ? 'Could not open this song' : 'Opening your song…'}</h1><p role={studio.loadError ? 'alert' : 'status'}>{studio.loadError || 'Bringing your layers back to the desk.'}</p>{studio.loadError && <div className="songs-actions"><button className="button button-primary" onClick={() => window.location.reload()}>Try again</button><a className="button button-secondary" href="/songs">My songs</a></div>}</main></div>;

  return <div className="studio-app">
    {customizing && <RecordCustomizer title={title} artwork={studio.artwork} onClose={()=>setCustomizing(false)} onDone={art=>{studio.setArtwork(art);setCustomizing(false);setNotice('Record appearance saved.');}} />}
    <a className="skip-link" href="#studio-capture">Skip to recording controls</a>
    <header className="studio-header"><span className="wordmark"><span className="brand-icon" aria-hidden="true"><i /><i /><i /><i /></span>listening room.</span><button className="text-button studio-library-link" disabled={studio.locked || studio.busy} onClick={() => void studio.openMySongs()}>My songs <span aria-hidden="true">↗</span></button></header>
    <main className="studio-desk" aria-label="Recording console">
      <div className="studio-project"><div><label htmlFor="song-title">YOUR SESSION</label><input id="song-title" ref={heading} aria-label="Song name" maxLength={70} value={title} onChange={(event) => setTitle(event.target.value)} /></div><span className={`studio-storage ${studio.saveState === 'error' ? 'save-failed' : ''}`} role="status"><span aria-hidden="true" />{studio.saveState === 'error' ? 'Not saved' : recording ? 'Recording · save when stopped' : state === 'processing' ? 'Preparing take…' : studio.audioError ? 'Audio unavailable' : studio.saveState === 'saved' ? 'Saved on this device' : 'Saving…'}</span></div>
      {studio.audioError && !studio.saveError && <div className="studio-save-error" role="alert"><p>{studio.audioError}</p></div>}
      {studio.saveError && <div className="studio-save-error" role="alert"><p>{studio.saveError}</p><button className="text-button" onClick={() => void studio.retrySave()}>Retry save</button></div>}
      {studio.cloudStatus && <div className="studio-cloud-status" role="status"><span>{studio.cloudStatus}</span>{studio.cloudError && <><p>{studio.cloudError}</p><button className="text-button" onClick={studio.retryCloud}>Retry backup</button></>}</div>}
      <div className="studio-body">
        <section className="studio-song" aria-labelledby="studio-song-title">
          <div className="studio-song-top">
            <div className="studio-turntable"><div className="platter-surround"><button className={`platter ${studio.playing ? 'spinning' : ''}`} aria-label={studio.playing ? 'Pause song' : 'Play song'} disabled={!studio.layers.length || studio.locked || studio.busy} onClick={() => void studio.togglePlayback()}><RecordDisc artwork={studio.artwork}><span className="studio-record-caption">SIDE A</span>{studio.playing ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}<span className="studio-record-caption">YOUR SONG</span></RecordDisc></button><Tonearm playing={studio.playing} teach={false} /></div><button className="text-button studio-art-edit" disabled={studio.locked || studio.busy} onClick={()=>setCustomizing(true)}>Edit record</button></div>
            <div className="studio-song-summary"><span className="studio-eyebrow">ONE PART AT A TIME</span><h1 id="studio-song-title">Your song</h1><p>{studio.layers.length ? `${studio.layers.length} ${studio.layers.length === 1 ? 'layer' : 'layers'} · ${timeLabel(duration)}` : 'A little room for your next idea.'}</p><div className="studio-transport"><button className="button button-light" disabled={!studio.layers.length || studio.locked || studio.busy} onClick={() => void studio.togglePlayback()}>{studio.playing ? <Pause size={15} /> : <Play size={15} />}{studio.playing ? 'Pause' : 'Play song'}</button><time>{preciseTime(studio.position)}</time></div></div>
          </div>
          <div className="studio-layers-heading"><h2>Layers in your song</h2><span>Record freely · No looping</span></div>
          <SongTimeline studio={studio} span={span} />
          <div className="studio-tracks">{studio.layers.map((layer) => <Track key={layer.id} layer={layer} studio={studio} span={span} />)}</div>
          {!studio.layers.length && <div className="studio-empty"><span className="studio-empty-lines" aria-hidden="true">{[9, 18, 30, 42, 24, 12, 22].map((height, index) => <i key={index} style={{ height }} />)}</span><h2>Start with a small idea.</h2><p>A chord progression. A melody.<br />Something you want to remember.</p><button className="button button-dark" disabled={state !== 'idle' || studio.busy} onClick={firstLayer}><Mic size={17} />Record your first layer</button></div>}
          {!!studio.layers.length && <button className="studio-add" disabled={studio.locked || studio.busy || !!studio.candidate} onClick={() => { recordButton.current?.focus(); recordButton.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (state === 'idle') void studio.enableMicrophone(); }}><Plus size={16} />Add another layer</button>}
          <div className="studio-song-bottom"><label>Song volume<input type="range" min="0" max="1" step=".01" value={studio.volume} aria-label="Song volume" onChange={(event) => studio.setVolume(Number(event.target.value))} /></label><span>All parts share the song timeline. Volume and take choices are below.</span></div>
          {!!studio.layers.length && <div className="studio-export">
            <button className="button button-light" disabled={studio.locked || studio.busy} onClick={() => void studio.downloadSong()} aria-describedby="song-export-help"><Download size={16} />{studio.exportBusy ? 'Preparing song…' : 'Download song'}</button>
            <p id="song-export-help">One WAV with your kept takes, trims, timing and volumes. Muted layers stay silent.{studio.soloId ? ' “Hear alone” is only for listening; this downloads the song mix.' : ''}{studio.candidate ? ' The take under review is not included until you keep it.' : ''}</p>
            <p className="studio-export-status" role="status">{studio.exportStatus}</p>
          </div>}
          {notice && <p className="studio-notice" role="status"><Check size={15} />{notice}</p>}
        </section>

        <aside className="studio-capture" id="studio-capture" aria-labelledby="capture-title">
          <div className="studio-capture-heading"><span className="studio-mic-icon"><Mic size={21} /></span><div><span className="studio-eyebrow">THE NEXT PART</span><h2 id="capture-title">{review ? 'Listen to your take' : 'Record a layer'}</h2></div></div>
          <p className="studio-capture-intro">{review ? 'Hear how it fits before you add it.' : 'Sing or play. Stop when you’re finished.'}</p>
          <p className="capture-position">{recording || state === 'countdown' ? 'Recording from' : review ? 'Listening at song cursor' : 'Record from song cursor'} <strong>{preciseTime(recording || state === 'countdown' ? studio.recordFrom : studio.position)}</strong><small>{review ? 'This take is shown beside your layers on the timeline.' : 'Set the cursor in the timeline. Your take lands at that same position.'}</small></p>
          <label className="studio-field">Name this part<input list="part-suggestions" value={review ? studio.candidate!.name : studio.partName} maxLength={50} disabled={!setup || studio.busy} onChange={(event) => studio.setPartName(event.target.value)} placeholder="e.g. Guitar, vocals, harmony" /></label>
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
          {state === 'countdown' && <p className="studio-countdown" role="status">{studio.countdown ? `Starting in ${studio.countdown}…` : 'Getting ready…'}</p>}
          {review && studio.candidate && <div className="studio-take"><div><strong>{studio.candidate.name}</strong><time>{timeLabel(studio.candidate.duration ?? 0)}</time></div><TakePicker layer={studio.candidate} studio={studio} draft /><p className="studio-help">Move or trim this take on the song timeline to compare it with your other layers.</p><span>{studio.candidate.peaks?.every((peak) => peak === 0) ? 'No sound detected. Check your microphone and try again.' : studio.retakeLayerId ? 'Your current layer stays until you use this take' : 'Not added to your song yet'}</span><div className="studio-review-buttons"><button className="button button-light" disabled={studio.busy} onClick={() => void studio.reviewTake(true)}><Play size={14} />Hear take</button><button className="button button-light" disabled={studio.busy || !studio.layers.length} onClick={() => void studio.reviewTake(false)}><Play size={14} />With song</button>{studio.playing && <button className="text-button" onClick={() => void studio.togglePlayback()}><Pause size={14} />Pause</button>}</div></div>}
          <button ref={recordButton} className={`button studio-record-action ${recording ? 'button-record' : 'button-dark'}`} disabled={studio.busy || state === 'requesting' || state === 'processing'} onClick={capture}>{recording ? <Square size={17} fill="currentColor" /> : review ? <Check size={17} /> : state === 'countdown' ? <X size={17} /> : <Mic size={17} />}{action}</button>
          {(state === 'requesting' || state === 'processing') && <p className="studio-help" role="status">{state === 'requesting' ? 'Allow microphone access in your browser.' : 'Preparing the waveform and your WAV recording.'}</p>}
          {review && <div className="studio-take-actions"><button className="text-button" disabled={studio.busy} onClick={() => studio.recordAnother()}><RotateCcw size={14} />Record another take</button><button className="text-button" onClick={() => studio.download(studio.candidate!)}><Download size={14} />Download original WAV</button></div>}
          {state === 'ready' && <button className="text-button studio-disconnect" onClick={studio.cancelSetup}>{studio.candidate ? 'Back to previous take' : 'Disconnect microphone'}</button>}
          {state === 'ready' && studio.candidate && <p className="studio-help">Your earlier takes stay saved. Recording again adds another choice.</p>}
          <p className="studio-capture-footnote">{review ? 'Every attempt and edit saves automatically. Switch takes to compare; keep the one you like.' : 'Only your microphone is recorded. The click is a listening guide.'}</p>
        </aside>
      </div>
      <footer className="studio-footer"><p>Saved on this device first. My songs has your backup options.</p><button className="text-button" disabled={studio.locked || studio.busy || !studio.canUndoEdit} onClick={() => { studio.undoEdit(); setNotice('Last change undone. Your recordings are still saved.'); }}><RotateCcw size={14} />Undo last change</button></footer>
    </main>
    {studio.error && <div className="error-toast" role="alert"><span>{studio.error}</span><button onClick={() => studio.setError('')} aria-label="Dismiss message"><X size={18} /></button></div>}
  </div>;
}
