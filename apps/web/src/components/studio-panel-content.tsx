'use client';

import { useEffect, useRef, useState } from 'react';
import { Archive, AudioLines, Disc3, Mic } from 'lucide-react';
import type { StudioDeckControls } from '../hooks/use-studio-deck-controls';
import { useTurntableMotion } from '../hooks/use-turntable-motion';
import { Check, Download, Plus, X } from './icons';
import { RecordCustomizer } from './record-customizer';
import { SongTimeline } from './song-timeline';
import { SongImport } from './song-import';
import { StudioCapturePanel } from './studio-capture-panel';
import { LayerActions } from './studio-layer';
import { StudioTurntable } from './studio-turntable';
import { StudioVolumeSlider } from './studio-volume-slider';

export const panelIcons = { turntable: Disc3, timeline: AudioLines, recorder: Mic };

export function TurntablePanel({ deck }: { deck: StudioDeckControls }) {
  const { studio, registerTurntable } = deck;
  const [customizing, setCustomizing] = useState(false);
  const motion = useTurntableMotion(studio.playing, {
    position: studio.position, readPosition: studio.readSongPosition, stopVersion: studio.stopVersion,
  });
  const { cuePlayback, closeCue } = motion;

  useEffect(() => {
    const stopIfHidden = () => { if (document.hidden) closeCue(); };
    const unregister = registerTurntable({
      start: async () => { if (!document.hidden) await cuePlayback(); },
      stop: closeCue,
    });
    const leave = () => { closeCue(); unregister(); };
    document.addEventListener('visibilitychange', stopIfHidden);
    window.addEventListener('pagehide', leave);
    return () => {
      unregister();
      document.removeEventListener('visibilitychange', stopIfHidden);
      window.removeEventListener('pagehide', leave);
    };
  }, [registerTurntable, cuePlayback, closeCue]);

  return <div className="studio-playback" data-compact={deck.compactDeck}>
    {customizing && <RecordCustomizer title={studio.title} artwork={studio.artwork} onClose={() => setCustomizing(false)}
      onDone={art => { studio.setArtwork(art); setCustomizing(false); deck.setNotice('Record appearance saved.'); }} />}
    <StudioTurntable studio={studio} span={deck.span} duration={deck.duration} motion={motion}
      onTogglePlayback={deck.toggleTransport} onStopPlayback={deck.stopTransport} onEdit={() => setCustomizing(true)}
      compact={deck.compactDeck} onToggleCompact={() => deck.setCompactDeck(value => !value)} />
    <div className="studio-mix" role="group" aria-label="Song mix">
      <label>Song volume<StudioVolumeSlider value={studio.volume} onChange={studio.setVolume} /></label>
      {!!studio.layers.length && <button className="button button-light" disabled={studio.locked || studio.busy} onClick={() => void studio.downloadSong()} aria-describedby="song-export-help"><Download size={16} />{studio.exportBusy ? 'Preparing song…' : 'Download song'}</button>}
      {!!studio.layers.length && <p id="song-export-help" className="studio-export-help">One WAV with your kept takes, trims, timing and volumes. Muted layers stay silent.{studio.soloId ? ' Downloads use the full song mix.' : ''}{studio.candidate ? ' Keep the take under review to include it.' : ''}</p>}
      <p className="studio-export-status" role="status">{studio.exportStatus}</p>
    </div>
  </div>;
}

export function TimelinePanel({ deck, detached = false }: { deck: StudioDeckControls; detached?: boolean }) {
  const { studio } = deck;
  return <SongTimeline studio={studio} span={deck.span} onRetake={deck.retakeLayer}
    cueing={deck.cueing} onToggleMix={() => void deck.toggleTransport({ keptMix: true })}
    detached={detached} onStop={deck.stopTransport}>
    {!studio.layers.length && !studio.candidate && <div className="studio-empty">
      {!studio.retakeLayerId && <SongImport studio={studio} />}
      <div className="studio-empty-record">
        <h2>Start with a small idea.</h2>
        <p>A chord progression or a melody.</p>
        <button className="button button-dark" disabled={studio.locked || studio.busy} onClick={event => deck.addLayer(event.detail === 0)}><Mic size={17} aria-hidden="true" />Record your first layer</button>
      </div>
    </div>}
    {!!studio.archivedLayers.length && <details className="layer-archive">
      <summary><Archive size={14} aria-hidden="true" /> Archived layers <span>{studio.archivedLayers.length}</span></summary>
      <ul>{studio.archivedLayers.map(layer => <li key={layer.id}><span>{layer.name}</span><LayerActions layer={layer} studio={studio} archived /></li>)}</ul>
    </details>}
    {!!studio.layers.length && <button className="studio-add" disabled={studio.locked || studio.busy || !!studio.candidate} onClick={event => deck.addLayer(event.detail === 0)}><Plus size={16} />Add another layer</button>}
    {deck.notice && <p className="studio-notice" role="status"><Check size={15} />{deck.notice}</p>}
  </SongTimeline>;
}

export function RecorderPanel({ deck, detached }: { deck: StudioDeckControls; detached?: boolean }) {
  const { registerRecorder } = deck;
  const recordButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const unregister = registerRecorder(moveFocus => {
      if (document.hidden) window.focus();
      const target = recordButton.current?.disabled ? panel.current : recordButton.current;
      if (moveFocus) target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest' });
    });
    window.addEventListener('pagehide', unregister);
    return () => { unregister(); window.removeEventListener('pagehide', unregister); };
  }, [registerRecorder]);

  return <StudioCapturePanel studio={deck.studio} panelRef={panel} recordButton={recordButton}
    open={deck.captureOptions} onOpenChange={deck.setCaptureOptions} onCapture={deck.capture}
    onDiscard={deck.discardTake} detached={detached} />;
}

export function StudioFeedback({ deck, countIn = true }: { deck: StudioDeckControls; countIn?: boolean }) {
  const { studio } = deck;
  const beat = studio.beatIndex % 4;
  return <>
    {countIn && <div className="studio-count-in-overlay" data-active={studio.recordingState === 'countdown' && studio.countdown > 0} aria-hidden="true">
      <div className="studio-count-in-display">
        <span className="studio-count-in-number" key={studio.countdown}>{studio.countdown || ''}</span><span>Count-in</span>
      </div>
    </div>}
    {studio.beatIndex >= 0 && <div key={studio.beatIndex} className="studio-beat-pulse" aria-hidden="true"
      data-downbeat={beat === 0} data-side={beat % 2 === 0 ? 'left' : 'right'} />}
    {studio.error && <div className="error-toast" role="alert"><span>{studio.error}</span><button onClick={() => studio.setError('')} aria-label="Dismiss message"><X size={18} /></button></div>}
  </>;
}
