'use client';

import { Fragment, useEffect, useEffectEvent, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { Studio } from '../hooks/use-studio';
import { ClipEditor } from './clip-editor';
import { clipBounds } from '../lib/clip-edits';
import { Headphones, Pause, Play, SlidersHorizontal, Square, Volume2, VolumeX } from 'lucide-react';
import { LayerIconButton, LayerOptions } from './studio-layer';

export function preciseTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${minutes.toString().padStart(2, '0')}:${(Math.max(0, seconds) % 60).toFixed(2).padStart(5, '0')}`;
}

type TimelineProps = {
  studio: Studio;
  span: number;
  onRetake: (id: string) => void;
  cueing: boolean;
  onToggleMix: () => void;
  detached: boolean;
  onStop: () => void;
  children: ReactNode;
};

export function SongTimeline({ studio, span, onRetake, cueing, onToggleMix, detached, onStop, children }: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const [openLayer, setOpenLayer] = useState<string | null>(null);
  const optionsId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const scrub = useRef<{ input: HTMLInputElement; pointer: number; x: number; moved: boolean; scratching: boolean } | null>(null);

  function finishScrub() {
    const drag = scrub.current;
    if (!drag) return;
    scrub.current = null;
    if (drag.input.hasPointerCapture(drag.pointer)) drag.input.releasePointerCapture(drag.pointer);
    if (drag.scratching) studio.endScrub();
  }

  const finishOnLeave = useEffectEvent(finishScrub);
  useEffect(() => {
    const leave = () => finishOnLeave();
    window.addEventListener('blur', leave);
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('blur', leave);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, []);

  const disabled = studio.locked || studio.busy;
  const rows = studio.layers.map(layer => ({ layer, draft: false }));
  if (studio.candidate) rows.push({ layer: studio.candidate, draft: true });

  function moveCursor(x: number, audible: boolean) {
    const bounds = ruler.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    const seconds = Math.max(0, Math.min(1, (x - bounds.left) / bounds.width)) * span;
    const position = Math.min(span, Math.round(seconds * 100) / 100);
    if (scrub.current?.scratching) studio.scrubSong(position, audible);
    else void studio.seekSong(position);
  }

  function beginScrub(event: PointerEvent<HTMLInputElement>) {
    if (disabled || event.button !== 0 || !event.isPrimary) return;
    // The browser's range drag and pointer capture would both drive the same gesture.
    event.preventDefault();
    if (scrub.current) return;
    const input = event.currentTarget;
    input.setPointerCapture(event.pointerId);
    scrub.current = { input, pointer: event.pointerId, x: event.clientX, moved: false, scratching: studio.beginScrub() };
    moveCursor(event.clientX, false);
  }

  function moveScrub(event: PointerEvent<HTMLInputElement>) {
    const drag = scrub.current;
    if (drag?.pointer !== event.pointerId) return;
    if (!(event.buttons & 1)) { finishScrub(); return; }
    if (!drag.moved && Math.abs(event.clientX - drag.x) < 3) return;
    drag.moved = true;
    moveCursor(event.clientX, true);
  }

  function endScrub(event: PointerEvent<HTMLInputElement>) {
    if (scrub.current?.pointer === event.pointerId) finishScrub();
  }

  function seekToStart() {
    viewport.current?.scrollTo({ left: 0, behavior: 'instant' });
    void studio.seekSong(0);
  }

  return <section className="studio-song" aria-labelledby="studio-layers-title">
    <div className="timeline-toolbar">
      <h2 id="studio-layers-title" className="studio-sr-only">Layers</h2>
      <div className="timeline-actions">
        {detached && <>
          <button disabled={disabled || !studio.layers.length} onClick={onToggleMix}>
            {studio.playing ? <Pause size={13} /> : <Play size={13} />}{studio.playing ? 'Pause' : 'Play song'}
          </button>
          <button disabled={studio.locked || (studio.busy && !cueing) || (!studio.playing && !cueing && studio.position === 0)} onClick={onStop}>
            <Square size={13} />Stop
          </button>
        </>}
        <button disabled={disabled} onClick={seekToStart}>To start</button>
        <label>Zoom<select aria-label="Timeline zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}>
          {[1, 2, 4, 8].map(value => <option key={value} value={value}>{value}×</option>)}
        </select></label>
      </div>
    </div>
    <p className="timeline-help">Drag the ruler to scrub. Drag a waveform to move it or drag its edges to trim. <kbd>Space</kbd> to play or pause.</p>
    <div className="timeline-scroll" ref={viewport} role="region" aria-label="Song timeline and layers" tabIndex={0}>
      <div className="timeline-canvas" style={{ width: `${zoom * 100}%` }}>
        <div className="timeline-row timeline-ruler-row">
          <div className="timeline-label">
            <span>Song time</span>
            <output aria-live="off">{preciseTime(studio.position)}</output>
          </div>
          <div className="timeline-ruler" ref={ruler}>
            <div className="timeline-ticks" aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => <span key={index}>{preciseTime(span * index / 8)}</span>)}
            </div>
            <input aria-label="Song position" aria-valuetext={preciseTime(studio.position)} aria-keyshortcuts="Space" type="range" min="0" max={span} step=".01"
              value={Math.min(span, studio.position)} disabled={disabled}
              onPointerDown={beginScrub} onPointerMove={moveScrub} onPointerUp={endScrub}
              onPointerCancel={endScrub} onLostPointerCapture={endScrub}
              onKeyDown={event => { if (event.key === ' ') finishScrub(); }}
              onChange={event => { finishScrub(); void studio.seekSong(Number(event.target.value)); }} />
          </div>
        </div>
        {rows.map(({ layer, draft }) => {
          const bounds = clipBounds(layer);
          const reviewing = studio.recordingState === 'review' && studio.previewCandidate;
          const replaced = !draft && reviewing && studio.retakeLayerId === layer.id;
          const solo = studio.soloId === layer.id;
          const inMix = draft ? reviewing : !replaced;
          const audible = inMix && (studio.soloId ? solo : draft || layer.enabled);
          const expanded = !draft && openLayer === layer.id;

          return <Fragment key={`${layer.id}-${draft}`}>
            <div className={`timeline-row ${draft ? 'timeline-draft' : ''} ${audible ? '' : 'timeline-muted'}`} data-layer-color={layer.color}>
              <div className="timeline-label">
                <span title={layer.name}>{layer.name}</span>
                <small>{draft ? 'Take to review' : `${preciseTime(bounds.startAt)} → ${preciseTime(bounds.end)}`}</small>
                {!draft && <div className="timeline-layer-actions" role="group" aria-label={`${layer.name} controls`}>
                  <LayerIconButton label={`Mute ${layer.name}`} hint={layer.enabled ? 'Mute' : 'Unmute'} aria-pressed={!layer.enabled}
                    disabled={disabled || replaced} onClick={() => void studio.toggleLayer(layer.id)}>
                    {layer.enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
                  </LayerIconButton>
                  <LayerIconButton label={`Solo ${layer.name}`} hint={solo && !replaced ? 'Clear solo' : 'Solo'} aria-pressed={solo && !replaced}
                    disabled={disabled || replaced} onClick={() => studio.setSoloId(solo ? null : layer.id)}>
                    <Headphones aria-hidden="true" />
                  </LayerIconButton>
                  <LayerIconButton label={`${layer.name} options`} hint={expanded ? 'Hide options' : 'Layer options'} aria-expanded={expanded}
                    aria-controls={expanded ? optionsId : undefined} onClick={() => setOpenLayer(expanded ? null : layer.id)}>
                    <SlidersHorizontal aria-hidden="true" />
                  </LayerIconButton>
                </div>}
              </div>
              <ClipEditor layer={layer} studio={studio} span={span} draft={draft} timelineOnly />
            </div>
            {expanded && <LayerOptions id={optionsId} layer={layer} studio={studio} span={span} onRetake={onRetake} cueing={cueing} onToggleMix={onToggleMix} />}
          </Fragment>;
        })}
        <div className="timeline-details">{children}</div>
      </div>
    </div>
  </section>;
}
