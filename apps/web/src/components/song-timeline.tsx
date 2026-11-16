'use client';

import { Fragment, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { Studio } from '../hooks/use-studio';
import { ClipEditor } from './clip-editor';
import { clipBounds } from '../lib/clip-edits';
import { Headphones, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
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
  children: ReactNode;
};

export function SongTimeline({ studio, span, onRetake, cueing, onToggleMix, children }: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const [openLayer, setOpenLayer] = useState<string | null>(null);
  const optionsId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const scrub = useRef<{ pointer: number; x: number; moved: boolean } | null>(null);
  const disabled = studio.locked || studio.busy;
  const rows = studio.layers.map(layer => ({ layer, draft: false }));
  if (studio.candidate) rows.push({ layer: studio.candidate, draft: true });

  function beginScrub(event: PointerEvent<HTMLInputElement>) {
    if (disabled || event.button !== 0 || !event.isPrimary || !studio.beginScrub()) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub.current = { pointer: event.pointerId, x: event.clientX, moved: false };
  }

  function moveScrub(event: PointerEvent<HTMLInputElement>) {
    const drag = scrub.current;
    if (drag?.pointer === event.pointerId && Math.abs(event.clientX - drag.x) >= 3) drag.moved = true;
  }

  function endScrub(event: PointerEvent<HTMLInputElement>) {
    if (scrub.current?.pointer !== event.pointerId) return;
    scrub.current = null;
    studio.endScrub();
  }

  function seekToStart() {
    viewport.current?.scrollTo({ left: 0, behavior: 'instant' });
    void studio.seekSong(0);
  }

  return <section className="studio-song" aria-labelledby="studio-layers-title">
    <div className="timeline-toolbar">
      <h2 id="studio-layers-title">Layers</h2>
      <div className="timeline-actions">
        <button disabled={disabled} onClick={seekToStart}>To start</button>
        <label>Zoom<select aria-label="Timeline zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}>
          {[1, 2, 4, 8].map(value => <option key={value} value={value}>{value}×</option>)}
        </select></label>
      </div>
    </div>
    <p className="timeline-help">Drag the ruler to scrub. Drag a waveform to move it or drag its edges to trim.</p>
    <div className="timeline-scroll" ref={viewport} role="region" aria-label="Song timeline and layers" tabIndex={0}>
      <div className="timeline-canvas" style={{ width: `${zoom * 100}%` }}>
        <div className="timeline-row timeline-ruler-row">
          <div className="timeline-label">
            <span>Song time</span>
            <output aria-live="off">{preciseTime(studio.position)}</output>
          </div>
          <div className="timeline-ruler">
            <div className="timeline-ticks" aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => <span key={index}>{preciseTime(span * index / 8)}</span>)}
            </div>
            <input aria-label="Song position" aria-valuetext={preciseTime(studio.position)} type="range" min="0" max={span} step=".01"
              value={Math.min(span, studio.position)} disabled={disabled}
              onPointerDown={beginScrub} onPointerMove={moveScrub} onPointerUp={endScrub}
              onPointerCancel={endScrub} onLostPointerCapture={endScrub}
              onChange={event => {
                const position = Number(event.target.value);
                if (scrub.current) studio.scrubSong(position, scrub.current.moved);
                else void studio.seekSong(position);
              }} />
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
