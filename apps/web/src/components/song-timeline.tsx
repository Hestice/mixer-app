'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Minimize2 } from 'lucide-react';
import type { Studio } from '../hooks/use-studio';
import { ClipEditor } from './clip-editor';
import { clipBounds } from '../lib/clip-edits';

export function preciseTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${minutes.toString().padStart(2, '0')}:${(Math.max(0, seconds) % 60).toFixed(2).padStart(5, '0')}`;
}

type TimelineProps = {
  studio: Studio;
  span: number;
  compact: boolean;
  onToggleCompact: () => void;
  children: ReactNode;
};

export function SongTimeline({ studio, span, compact, onToggleCompact, children }: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const disabled = studio.locked || studio.busy;
  const rows = studio.layers.map(layer => ({ layer, draft: false }));
  if (studio.candidate) rows.push({ layer: studio.candidate, draft: true });

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
        <button className="timeline-density" aria-label="Compact view" aria-pressed={compact} onClick={onToggleCompact}>
          <Minimize2 size={13} aria-hidden="true" /> Compact
        </button>
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
              value={Math.min(span, studio.position)} disabled={disabled} onChange={event => void studio.seekSong(Number(event.target.value))} />
          </div>
        </div>
        {rows.map(({ layer, draft }) => {
          const bounds = clipBounds(layer);
          const muted = !draft && !(studio.soloId ? studio.soloId === layer.id : layer.enabled);
          return <div key={`${layer.id}-${draft}`} className={`timeline-row ${draft ? 'timeline-draft' : ''} ${muted ? 'timeline-muted' : ''}`}>
            <div className="timeline-label">
              <span>{layer.name}</span>
              <small>{draft ? 'Take to review' : `${preciseTime(bounds.startAt)} → ${preciseTime(bounds.end)}`}</small>
            </div>
            <ClipEditor layer={layer} studio={studio} span={span} draft={draft} timelineOnly />
          </div>;
        })}
        <div className="timeline-details">{children}</div>
      </div>
    </div>
  </section>;
}
