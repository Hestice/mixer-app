'use client';

import { useState } from 'react';
import type { Studio } from '../hooks/use-studio';
import { ClipEditor } from './clip-editor';
import { clipBounds } from '../lib/clip-edits';

export function preciseTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${minutes.toString().padStart(2, '0')}:${(Math.max(0, seconds) % 60).toFixed(2).padStart(5, '0')}`;
}

export function SongTimeline({ studio, span }: { studio: Studio; span: number }) {
  const [zoom, setZoom] = useState(1);
  const rows = [...studio.layers.map(layer => ({layer, draft:false})), ...(studio.candidate ? [{layer:studio.candidate, draft:true}] : [])];
  return <section className="song-timeline" aria-label="Song timeline">
    <div className="timeline-toolbar"><label>Song position <output>{preciseTime(studio.position)}</output></label><div><button disabled={studio.locked || studio.busy} onClick={() => void studio.seekSong(0)}>To start</button><label>Zoom<select aria-label="Timeline zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[1,2,4,8].map(value => <option key={value} value={value}>{value}×</option>)}</select></label></div></div>
    <p className="timeline-help">Click or drag the ruler to listen from there. Drag a waveform to move it; drag its edges to trim.</p>
    <div className="timeline-scroll"><div className="timeline-canvas" style={{ minWidth: `${zoom * 100}%` }}>
      <div className="timeline-row timeline-ruler-row"><span className="timeline-label">SONG TIME</span><div className="timeline-ruler">
        <div className="timeline-ticks" aria-hidden="true">{Array.from({length:9},(_,i)=><span key={i}>{preciseTime(span*i/8)}</span>)}</div>
        <input aria-label="Song position" aria-valuetext={preciseTime(studio.position)} type="range" min="0" max={span} step=".01" value={Math.min(span,studio.position)} disabled={studio.locked || studio.busy} onChange={event=>void studio.seekSong(Number(event.target.value))} />
      </div></div>
      {rows.map(({layer,draft}) => <div key={`${layer.id}-${draft}`} className={`timeline-row ${draft?'timeline-draft':''} ${!draft && !(studio.soloId ? studio.soloId===layer.id : layer.enabled) ? 'timeline-muted' : ''}`}>
        <div className="timeline-label"><span>{layer.name}</span><small>{draft?'Take to review':`${preciseTime(clipBounds(layer).startAt)} → ${preciseTime(clipBounds(layer).end)}`}</small></div>
        <ClipEditor layer={layer} studio={studio} span={span} draft={draft} timelineOnly />
      </div>)}
      {!rows.length && <p className="timeline-empty">Your first recording will appear here.</p>}
    </div></div>
  </section>;
}
