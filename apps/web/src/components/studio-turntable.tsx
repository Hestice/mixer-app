'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useTurntableMotion } from '../hooks/use-turntable-motion';
import type { Studio } from '../hooks/use-studio';
import { secondsForRotation } from '../lib/turntable-position';
import { timeLabel } from '../lib/session';
import { Pause, Play, Square } from './icons';
import { RecordDisc } from './record-artwork';
import { preciseTime } from './song-timeline';
import { Tonearm } from './tonearm';

type Gesture = {
  pointer: number;
  x: number;
  y: number;
  angle: number | null;
  position: number;
  dragging: boolean;
  resume: boolean;
};

function pointerAngle(event: PointerEvent<HTMLElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - bounds.left - bounds.width / 2;
  const y = event.clientY - bounds.top - bounds.height / 2;
  if (Math.hypot(x, y) < bounds.width * .14) return null;
  return Math.atan2(y, x) * 180 / Math.PI;
}

export function StudioTurntable({ studio, span, duration, onEdit }: { studio: Studio; span: number; duration: number; onEdit: () => void }) {
  const { record, arm, cueing, cuePlayback, closeCue } = useTurntableMotion(studio.playing, {
    position: studio.position, readPosition: studio.readSongPosition, stopVersion: studio.stopVersion,
  });
  const gesture = useRef<Gesture | null>(null);
  const disabled = studio.locked || studio.busy;
  const canPlay = !!studio.layers.length || studio.playing;

  function toggle() {
    if (canPlay && !disabled) void studio.togglePlayback(cuePlayback).finally(closeCue);
  }

  function seek(seconds: number) {
    const position = Math.max(0, Math.min(span, seconds));
    void studio.seekSong(Math.min(span, Math.round(position * 100) / 100));
    return position;
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointer: event.pointerId, x: event.clientX, y: event.clientY, angle: pointerAngle(event),
      position: studio.position, dragging: false, resume: false,
    };
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId || disabled) return;
    if (!drag.dragging) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      drag.dragging = true;
      drag.resume = studio.playing;
      drag.position = studio.pausePlayback();
    }
    const angle = pointerAngle(event);
    if (angle !== null && drag.angle !== null) {
      drag.position = seek(drag.position + secondsForRotation(drag.angle, angle));
    }
    drag.angle = angle;
  }

  function endPointer(event: PointerEvent<HTMLDivElement>, tap = false) {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    gesture.current = null;
    if (drag.dragging) {
      if (drag.resume && drag.position < studio.duration) toggle();
    } else if (tap) toggle();
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const steps: Record<string, number> = { ArrowLeft: -.25, ArrowDown: -.25, ArrowRight: .25, ArrowUp: .25, PageDown: -2, PageUp: 2 };
    if (event.key in steps) seek(studio.readSongPosition() + steps[event.key]);
    else if (event.key === 'Home' || event.key === 'End') seek(event.key === 'Home' ? 0 : span);
    else if (event.key === 'Enter' || event.key === ' ') { if (!event.repeat) toggle(); }
    else return;
    event.preventDefault();
  }

  return <div className="studio-song-top">
    <div className="studio-turntable" data-studio-record={studio.songId}>
      <div className="platter-surround">
        <div className="platter studio-jog-wheel" role="slider" tabIndex={0} aria-label="Seek with vinyl" aria-describedby="studio-jog-help"
          aria-valuemin={0} aria-valuemax={span} aria-valuenow={Math.min(span, studio.position)} aria-valuetext={preciseTime(studio.position)}
          aria-disabled={disabled || undefined} onPointerDown={pointerDown} onPointerMove={pointerMove}
          onPointerUp={event => endPointer(event, true)} onPointerCancel={endPointer} onLostPointerCapture={endPointer} onKeyDown={keyDown}>
          <RecordDisc ref={record} artwork={studio.artwork} />
        </div>
        <Tonearm playing={studio.playing || cueing} assemblyRef={arm} />
      </div>
      <button className="text-button studio-art-edit" disabled={disabled} onClick={onEdit}>Edit record</button>
    </div>
    <div className="studio-song-summary">
      <span className="studio-eyebrow">ONE PART AT A TIME</span>
      <h1 id="studio-song-title">Your song</h1>
      <p>{studio.layers.length ? `${studio.layers.length} ${studio.layers.length === 1 ? 'layer' : 'layers'} · ${timeLabel(duration)}` : 'A little room for your next idea.'}</p>
      <div className="studio-transport">
        <button className="button button-light" disabled={!canPlay || disabled} onClick={toggle}>
          {studio.playing ? <Pause size={15} /> : <Play size={15} />}{studio.playing ? 'Pause' : cueing ? 'Cueing…' : 'Play song'}
        </button>
        <button className="button button-light" disabled={studio.locked || (studio.busy && !cueing) || (!studio.playing && !cueing && studio.position === 0)} onClick={() => {
          studio.stopPlayback();
          closeCue();
        }}><Square size={14} />Stop</button>
        <time>{preciseTime(studio.position)}</time>
      </div>
      <p id="studio-jog-help" className="studio-jog-help">Drag the record to seek.</p>
    </div>
  </div>;
}
