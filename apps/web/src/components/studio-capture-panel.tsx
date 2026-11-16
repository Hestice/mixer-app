'use client';

import { useId, useState, useSyncExternalStore, type RefObject } from 'react';
import { Activity, ArrowLeft, AudioLines, Check, ChevronDown, Download, Headphones, LoaderCircle, Mic, MicOff,
  Music2, Pause, Play, RotateCcw, ScanLine, SlidersHorizontal, Square, Timer, Trash2, X, type LucideIcon } from 'lucide-react';
import type { Studio } from '../hooks/use-studio';
import { timeLabel, type Layer } from '../lib/session';
import { TakePicker } from './clip-editor';
import { preciseTime } from './song-timeline';
import { Waveform } from './waveform';

const narrowQuery = '(max-width: 760px)';
const readNarrow = () => window.matchMedia(narrowQuery).matches;
const serverNarrow = () => false;

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(narrowQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function CaptureSwitch({ label, name, description, icon: Icon, checked, disabled, onToggle }: {
  label: string;
  name?: string;
  description: string;
  icon: LucideIcon;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const tooltipId = useId();
  const [dismissed, setDismissed] = useState(false);
  return <div className="studio-switch-option" data-dismissed={dismissed}
    onPointerEnter={() => setDismissed(false)} onBlur={() => setDismissed(false)}>
    <button className="studio-capture-switch" type="button" role="switch" aria-label={name}
      aria-describedby={tooltipId} aria-checked={checked} disabled={disabled} onClick={onToggle}
      onKeyDown={event => { if (event.key === 'Escape') setDismissed(true); }}>
      <Icon size={13} aria-hidden="true" />{label}<span className="studio-switch-track" aria-hidden="true" />
    </button>
    <span className="studio-switch-tooltip" id={tooltipId} role="tooltip">{description}</span>
  </div>;
}

function MicrophoneInput({ studio, recording }: { studio: Studio; recording: boolean }) {
  const level = Math.round(Math.min(100, studio.inputLevel * 100));
  return <div className="studio-input">
    <div className="studio-input-heading">
      <Mic size={14} aria-hidden="true" />
      <span title={studio.microphoneLabel}>{studio.microphoneLabel}</span>
      {!recording && <button className="studio-toolbar-button" type="button" aria-label="Disconnect microphone"
        title="Disconnect microphone" disabled={studio.locked || studio.busy} onClick={studio.disconnectMicrophone}>
        <MicOff size={15} aria-hidden="true" />
      </button>}
    </div>
    <div role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}
      className={`studio-input-meter ${level > 95 ? 'clipping' : ''}`}><i style={{ width: `${level}%` }} /></div>
    {level > 95 ? <small>Move back or lower your input gain.</small>
      : !recording && level <= 1 && <small>Play or sing to check your level.</small>}
  </div>;
}

function BeatIndicator({ index }: { index: number }) {
  const beat = index % 4;
  return <div className="studio-beats" role="img" aria-label={`Beat ${beat + 1} of 4`}>
    {[0, 1, 2, 3].map(step => <span key={step} data-active={step === beat} aria-hidden="true" />)}
  </div>;
}

function BeatSettings({ studio, layerId, onLayerChange }: { studio: Studio; layerId: string; onLayerChange: (id: string) => void }) {
  const reference = studio.layers.find(layer => layer.id === layerId)
    ?? studio.layers.find(layer => layer.kind === 'rhythm') ?? studio.layers[0];

  return <details className="studio-rhythm">
    <summary>
      <AudioLines size={15} aria-hidden="true" />
      <span>Timing &amp; metronome</span>
      <small>{studio.tempo} BPM</small>
      <ChevronDown className="studio-rhythm-chevron" size={13} aria-hidden="true" />
    </summary>
    <fieldset className="studio-timing" disabled={studio.locked || studio.busy}>
      <legend>Timing &amp; metronome</legend>
      <div className="studio-tempo">
        <label>Tempo<input type="number" min="40" max="240" step=".1" value={studio.tempo}
          onChange={event => studio.setTempo(event.target.valueAsNumber)} /><span>BPM</span></label>
      </div>
      {reference && <div className="studio-beat-align">
        <label className="studio-field">Reference layer
          <select value={reference.id} onChange={event => onLayerChange(event.target.value)}>
            {studio.layers.map(layer => <option value={layer.id} key={layer.id}>{layer.name}</option>)}
          </select>
        </label>
        <button type="button" className="button button-light" onClick={() => void studio.alignBeat(reference.id)}>
          <ScanLine size={14} aria-hidden="true" />Align beat
        </button>
      </div>}
      <p className="studio-help studio-beat-alignment-status" role="status">
        {studio.beatAlignmentStatus || (studio.beatOffset !== undefined ? 'Beat aligned to the song.' : '')}
      </p>
      <label className="studio-field">Metronome
        <select value={studio.metronomeMode} onChange={event => studio.setMetronomeMode(event.target.value as 'off' | 'visual' | 'sound')}>
          <option value="off">Off</option>
          <option value="visual">Visual only</option>
          <option value="sound" disabled={!studio.headphones}>Visual + click</option>
        </select>
      </label>
      <label className="studio-check studio-headphones">
        <input type="checkbox" checked={studio.headphones} onChange={event => studio.setHeadphones(event.target.checked)} />
        <Headphones size={15} aria-hidden="true" />I’m using headphones
      </label>
      {!studio.headphones && <p className="studio-help">Use headphones to enable the audible click.</p>}
      <div className="studio-beat-controls">
        <button className="studio-toolbar-button" type="button" disabled={studio.metronomeMode === 'off'}
          onClick={() => void studio.previewMetronome()}>
          {studio.metronomePreview ? <Square size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
          {studio.metronomePreview ? 'Stop beat' : 'Preview beat'}
        </button>
        {studio.metronomePreview && studio.beatIndex >= 0 && <BeatIndicator index={studio.beatIndex} />}
      </div>
    </fieldset>
  </details>;
}

function TakeReview({ studio, take, onDiscard, onRetry }: { studio: Studio; take: Layer; onDiscard: () => void; onRetry: () => void }) {
  const playingTake = studio.playing && studio.previewCandidate;
  const soloPlaying = playingTake && studio.soloId === take.id;
  const mixPlaying = playingTake && studio.soloId === null;
  const silent = !!take.peaks?.length && take.peaks.every(peak => peak === 0);

  return <div className="studio-take">
    <div className="studio-take-heading"><strong>{take.name}</strong><time>{timeLabel(take.duration ?? 0)}</time></div>
    <TakePicker layer={take} studio={studio} draft />
    {silent && <p className="studio-help" role="status">No sound detected. Check your input level before trying again.</p>}
    <div className="studio-review-buttons" role="group" aria-label="Listen to take">
      <button type="button" className="button button-light" data-playing={soloPlaying} disabled={studio.busy}
        onClick={() => soloPlaying ? studio.pausePlayback() : void studio.reviewTake(true)}>
        {soloPlaying ? <Pause size={15} aria-hidden="true" /> : <Headphones size={15} aria-hidden="true" />}
        {soloPlaying ? 'Pause take' : 'Hear take'}
      </button>
      {!!studio.layers.length && <button type="button" className="button button-light" data-playing={mixPlaying} disabled={studio.busy}
        onClick={() => mixPlaying ? studio.pausePlayback() : void studio.reviewTake(false)}>
        {mixPlaying ? <Pause size={15} aria-hidden="true" /> : <Music2 size={15} aria-hidden="true" />}
        {mixPlaying ? 'Pause mix' : 'With song'}
      </button>}
    </div>
    <div className="studio-take-actions" role="group" aria-label="Take actions">
      <button className="studio-toolbar-button" type="button" disabled={studio.busy} onClick={onRetry}>
        <RotateCcw size={14} aria-hidden="true" />New take
      </button>
      {studio.canDiscardTake && <button className="studio-toolbar-button studio-discard-take" type="button" disabled={studio.busy} onClick={onDiscard}>
        <Trash2 size={14} aria-hidden="true" />Discard take
      </button>}
      <button className="studio-toolbar-button studio-take-download" type="button" aria-label="Download take audio"
        title="Download take audio" onClick={() => studio.download(take)}><Download size={15} aria-hidden="true" /></button>
      {studio.microphoneConnected && <button className="studio-toolbar-button" type="button" aria-label="Disconnect microphone"
        title="Disconnect microphone" disabled={studio.busy} onClick={studio.disconnectMicrophone}>
        <MicOff size={15} aria-hidden="true" />
      </button>}
    </div>
  </div>;
}

type CapturePanelProps = {
  studio: Studio;
  panelRef: RefObject<HTMLElement | null>;
  recordButton: RefObject<HTMLButtonElement | null>;
  open: boolean | null;
  onOpenChange: (open: boolean) => void;
  onCapture: () => void;
  onDiscard: () => void;
};

export function StudioCapturePanel({ studio, panelRef, recordButton, open, onOpenChange, onCapture, onDiscard }: CapturePanelProps) {
  const narrow = useSyncExternalStore(subscribeToWidth, readNarrow, serverNarrow);
  const [beatLayerId, setBeatLayerId] = useState('');
  const state = studio.recordingState;
  const recording = state === 'recording';
  const setup = state === 'idle' || state === 'ready';
  const take = state === 'review' ? studio.candidate : null;
  const retaking = !!studio.retakeLayerId;
  const hasOptions = setup || recording || !!take || state === 'requesting';
  const expanded = hasOptions && (!narrow || (open ?? !!take));
  const partName = studio.layers.find(layer => layer.id === studio.retakeLayerId)?.name ?? studio.candidate?.name;
  const title = take ? 'Review take' : recording ? 'Recording' : retaking ? 'Record a retake' : 'Record a layer';
  const action = {
    idle: 'Connect microphone',
    requesting: 'Connecting…',
    ready: retaking ? 'Record retake' : 'Record layer',
    countdown: 'Cancel count-in',
    recording: 'Stop recording',
    processing: 'Preparing take…',
    review: retaking ? 'Use this take' : 'Keep this layer',
  }[state];
  const ActionIcon = recording ? Square : take ? Check : state === 'countdown' ? X
    : state === 'requesting' || state === 'processing' ? LoaderCircle : Mic;
  const showCaptureControls = setup || (!!take && retaking);
  const beatOn = studio.metronomeMode !== 'off';

  return <aside className="studio-capture" id="studio-capture" ref={panelRef} tabIndex={-1} aria-labelledby="capture-title">
    <div className="studio-capture-bar">
      <div className="studio-capture-heading" data-has-options={hasOptions}>
        <span className="studio-mic-icon" aria-hidden="true">{take || recording ? <AudioLines size={20} /> : <Mic size={20} />}</span>
        <div className="studio-capture-title">
          <h2 id="capture-title">{title}</h2>
          {hasOptions && <button className="studio-toolbar-button studio-capture-toggle" type="button" aria-controls="studio-capture-options"
            aria-expanded={expanded} onClick={() => onOpenChange(!expanded)}>
            <SlidersHorizontal size={14} aria-hidden="true" />{take ? 'Take review' : recording ? 'Live input' : retaking ? 'Retake setup' : 'Recording setup'}
            <ChevronDown className="studio-capture-chevron" size={13} aria-hidden="true" />
          </button>}
          {state === 'countdown' ? <p className="capture-position" role="status">
            {studio.countdown ? `Starting in ${studio.countdown}…` : 'Getting ready…'}
          </p> : <p className="capture-position">
            {recording ? 'Elapsed' : take ? 'Cursor' : 'From'} <time>{recording ? timeLabel(studio.elapsed) : preciseTime(studio.position)}</time>
          </p>}
          {retaking && !take && partName && <span className="capture-part-name" title={partName}>{partName}</span>}
        </div>
      </div>
      <button ref={recordButton} className={`button studio-record-action ${recording ? 'button-record' : 'button-dark'}`} type="button"
        disabled={studio.busy || state === 'requesting' || state === 'processing'} onClick={onCapture}>
        <ActionIcon size={16} fill={recording ? 'currentColor' : 'none'} aria-hidden="true" />{action}
      </button>
      {showCaptureControls && <div className="studio-capture-preferences">
        {setup && <div className="studio-capture-switches">
          <CaptureSwitch label="Count-in" description="Gives you four beats before recording starts." icon={Timer}
            checked={studio.countIn} disabled={studio.busy} onToggle={() => studio.setCountIn(!studio.countIn)} />
          <CaptureSwitch label="Beat" name="Beat during take" description="Shows a pulse on screen to help you stay in time while recording." icon={Activity}
            checked={beatOn} disabled={studio.busy} onToggle={() => studio.setMetronomeMode(beatOn ? 'off' : 'visual')} />
        </div>}
        {setup && studio.candidate && <button className="studio-toolbar-button" type="button" disabled={studio.busy} onClick={() => {
          studio.returnToTake();
          recordButton.current?.focus({ preventScroll: true });
        }}><ArrowLeft size={14} aria-hidden="true" />Back to take</button>}
        {retaking && <button className="studio-toolbar-button studio-cancel-retake" type="button" disabled={studio.busy} onClick={() => {
          studio.cancelRetake();
          recordButton.current?.focus({ preventScroll: true });
        }}><X size={15} aria-hidden="true" />Cancel retake</button>}
      </div>}
    </div>
    <div className="studio-capture-drawer" data-expanded={expanded}>
      <div className="studio-capture-options" id="studio-capture-options" inert={!expanded}
        role="region" aria-label="Recording settings and take review" tabIndex={0}>
        {setup && <>
          {!retaking && !studio.candidate && <label className="studio-field studio-part-field">Layer name
            <input list="part-suggestions" value={studio.partName} maxLength={50} disabled={studio.busy}
              onChange={event => studio.setPartName(event.target.value)} placeholder="Guitar, vocals, harmony…" />
            <datalist id="part-suggestions"><option value="Guitar" /><option value="Vocals" /><option value="Harmony" /><option value="Percussion" /></datalist>
          </label>}
          {studio.devices.length > 1 && studio.microphoneConnected && <label className="studio-field">Microphone
            <select value={studio.inputDevice} disabled={studio.busy} onChange={event => studio.changeInput(event.target.value)}>
              {studio.devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}
            </select>
          </label>}
          {studio.microphoneConnected && <MicrophoneInput studio={studio} recording={false} />}
          <BeatSettings studio={studio} layerId={beatLayerId} onLayerChange={setBeatLayerId} />
        </>}
        {state === 'requesting' && <p className="studio-help" role="status">Allow microphone access in your browser.</p>}
        {recording && <>
          <div className="studio-live">
            <Waveform peaks={studio.livePeaks} active compact />
            {beatOn && studio.beatIndex >= 0 && <BeatIndicator index={studio.beatIndex} />}
          </div>
          <MicrophoneInput studio={studio} recording />
        </>}
        {take && <TakeReview studio={studio} take={take} onDiscard={onDiscard} onRetry={() => {
          studio.recordAnother();
          recordButton.current?.focus({ preventScroll: true });
        }} />}
      </div>
    </div>
  </aside>;
}
