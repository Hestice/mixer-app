'use client';

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import type { Studio } from '../hooks/use-studio';
import type { ClipEdits, Layer } from '../lib/session';
import { clipBounds, MAX_START, MIN_CLIP, snapStart, takesOf } from '../lib/clip-edits';
import { Waveform } from './waveform';
import { TimelineWaveform } from './timeline-waveform';

const seconds = (value: number) => `${value.toFixed(2)}s`;
type Drag = { kind: 'move' | 'in' | 'out'; x: number; width: number; base: ReturnType<typeof clipBounds>; patch: ClipEdits };
function ClipNumber({ label, name, value, min, max, step, disabled, onValue }: { label: string; name: string; value: number; min: number; max: number; step: number; disabled: boolean; onValue: (value: number) => void }) {
  const [text, setText] = useState(String(Number(value.toFixed(2))));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(Number(value.toFixed(2)))); }, [value]);
  return <label>{label}<input aria-label={name} type="number" min={min} max={max} step={step} disabled={disabled} value={text}
    onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(String(Number(value.toFixed(2)))); }}
    onChange={(event) => { setText(event.target.value); if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) onValue(event.target.valueAsNumber); }} /><span>seconds</span></label>;
}

export function TakePicker({ layer, studio, draft = false }: { layer: Layer; studio: Studio; draft?: boolean }) {
  const takes = takesOf(layer);
  if (!takes.length) return null;
  return <label className="take-picker">Take<select aria-label={`${layer.name} take${draft ? ' to review' : ''}`} disabled={studio.locked || studio.busy || (!draft && studio.retakeLayerId === layer.id)} value={layer.takeId ?? layer.id} onChange={(event) => studio.chooseTake(layer.id, event.target.value, draft)}>
    {takes.map((take, index) => <option key={take.id} value={take.id}>Take {index + 1} · {seconds(take.duration)}</option>)}
  </select><span>{takes.length === 1 ? 'Original saved' : `${takes.length} attempts saved`}</span></label>;
}

export function ClipEditor({ layer, studio, span, draft = false, timelineOnly = false, detailsOnly = false }: { layer: Layer; studio: Studio; span: number; draft?: boolean; timelineOnly?: boolean; detailsOnly?: boolean }) {
  const [preview, setPreview] = useState<ClipEdits | null>(null);
  const drag = useRef<Drag | null>(null);
  const lane = useRef<HTMLDivElement>(null);
  const trimLane = useRef<HTMLDivElement>(null);
  const clip = clipBounds({ ...layer, ...preview });
  const disabled = studio.locked || studio.busy || (!draft && studio.retakeLayerId === layer.id);
  const anchors = studio.layers.filter((item) => item.id !== layer.id).flatMap((item) => { const bounds = clipBounds(item); return [bounds.startAt, bounds.end]; });

  function start(event: PointerEvent<HTMLButtonElement>, kind: Drag['kind']) {
    if (disabled || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    studio.beginEdit();
    drag.current = { kind, x: event.clientX, width: (kind === 'move' || timelineOnly ? lane : trimLane).current!.getBoundingClientRect().width, base: clipBounds(layer), patch: {} };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current) return;
    const delta = (event.clientX - current.x) / current.width * (current.kind === 'move' || timelineOnly ? span : current.base.duration);
    const base = current.base;
    const patch = current.kind === 'move' ? { startAt: snapStart(Math.min(span - base.length, base.startAt + delta), event.shiftKey ? [] : anchors, event.shiftKey ? 0 : span / current.width * 7) }
      : current.kind === 'in' ? { trimStart: Math.max(0, Math.min(base.trimEnd - MIN_CLIP, base.trimStart + delta)) }
      : { trimEnd: Math.max(base.trimStart + MIN_CLIP, Math.min(base.duration, base.trimEnd + delta)) };
    if (current.kind === 'in') Object.assign(patch, { startAt: Math.max(0, base.startAt + patch.trimStart! - base.trimStart) });
    current.patch = patch; setPreview(patch);
  }
  function finish() {
    if (!drag.current) return;
    studio.updateClip(layer.id, drag.current.patch, draft);
    drag.current = null; setPreview(null);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, field: keyof ClipEdits) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); studio.beginEdit();
    const step = event.shiftKey ? .01 : .1;
    let value = clip[field] + (event.key === 'ArrowRight' ? step : -step);
    const min = field === 'trimEnd' ? clip.trimStart + MIN_CLIP : 0;
    const max = field === 'trimStart' ? clip.trimEnd - MIN_CLIP : field === 'trimEnd' ? clip.duration : MAX_START;
    if (event.key === 'Home') value = min;
    if (event.key === 'End') value = field === 'startAt' ? Math.max(0, span - clip.length) : max;
    studio.updateClip(layer.id, { [field]: Math.max(min, Math.min(max, value)) }, draft);
  }
  const pointer = { onPointerMove: move, onPointerUp: finish, onLostPointerCapture: finish, onPointerCancel: () => { drag.current = null; setPreview(null); } };
  function numberEdit(field: keyof ClipEdits, value: number) {
    if (!Number.isFinite(value)) return;
    studio.beginEdit(); studio.updateClip(layer.id, { [field]: value }, draft);
  }
  return <div className="clip-editor">
    {draft && !timelineOnly && !detailsOnly && <span className="clip-caption">Place in song <small>Drag the part left or right</small></span>}
    {!detailsOnly && <><div ref={lane} className="studio-track-lane clip-lane" aria-label={`${layer.name} timeline`}>
      <button className="clip-body" disabled={disabled} style={{ left: `${clip.startAt / span * 100}%`, width: `${clip.length / span * 100}%` }} aria-label={`Move ${layer.name}. Starts at ${seconds(clip.startAt)}`} onPointerDown={(event) => start(event, 'move')} onKeyDown={(event) => keyboard(event, 'startAt')} {...pointer}>
        <TimelineWaveform layer={{ ...layer, ...preview }} /><span className="clip-grip" aria-hidden="true">⠿</span>
      </button>
      {timelineOnly && <>{(['in', 'out'] as const).map((kind) => <button key={kind} className={`timeline-trim timeline-trim-${kind}`} disabled={disabled} aria-label={`${layer.name}${draft ? ' review' : ''} trim ${kind === 'in' ? 'beginning' : 'ending'} in song`} style={{ left: `${(kind === 'in' ? clip.startAt : clip.end) / span * 100}%` }} onPointerDown={(event) => start(event, kind)} onKeyDown={(event) => keyboard(event, kind === 'in' ? 'trimStart' : 'trimEnd')} {...pointer} />)}</>}
      <span className="studio-playhead" style={{ left: `${Math.min(100, studio.position / span * 100)}%` }} aria-hidden="true" />
    </div>
    </>}
    {!timelineOnly && <><div className="clip-caption"><span>Enters at {seconds(clip.startAt)}</span><span>{seconds(clip.length)} used</span></div>
    <details className="clip-details" open={draft || undefined}>
      <summary>Trim &amp; timing</summary>
      <p className="studio-help">Drag the edges to choose your part. Your full recording stays saved.</p>
      <div ref={trimLane} className="trim-lane">
        <Waveform peaks={layer.peaks} />
        <div className="trim-shade" style={{ left: 0, width: `${clip.trimStart / clip.duration * 100}%` }} />
        <div className="trim-shade" style={{ right: 0, width: `${(clip.duration - clip.trimEnd) / clip.duration * 100}%` }} />
        <div className="trim-selection" style={{ left: `${clip.trimStart / clip.duration * 100}%`, width: `${clip.length / clip.duration * 100}%` }} />
        <button className="trim-handle trim-in" disabled={disabled} aria-label={`${layer.name} trim beginning`} title="Choose where the part begins" style={{ left: `${clip.trimStart / clip.duration * 100}%` }} onPointerDown={(event) => start(event, 'in')} onKeyDown={(event) => keyboard(event, 'trimStart')} {...pointer}><span /></button>
        <button className="trim-handle trim-out" disabled={disabled} aria-label={`${layer.name} trim ending`} title="Choose where the part ends" style={{ left: `${clip.trimEnd / clip.duration * 100}%` }} onPointerDown={(event) => start(event, 'out')} onKeyDown={(event) => keyboard(event, 'trimEnd')} {...pointer}><span /></button>
      </div>
      <div className="clip-numbers">
        <ClipNumber label="Keep from" name={`${layer.name} keep from seconds`} value={clip.trimStart} min={0} max={clip.trimEnd - MIN_CLIP} step={.01} disabled={disabled} onValue={(value) => numberEdit('trimStart', value)} />
        <ClipNumber label="Keep until" name={`${layer.name} keep until seconds`} value={clip.trimEnd} min={clip.trimStart + MIN_CLIP} max={clip.duration} step={.01} disabled={disabled} onValue={(value) => numberEdit('trimEnd', value)} />
        <ClipNumber label="Enter at" name={`${layer.name} start in song seconds`} value={clip.startAt} min={0} max={MAX_START} step={.1} disabled={disabled} onValue={(value) => numberEdit('startAt', value)} />
      </div>
      <button className="text-button clip-reset" disabled={disabled || (clip.trimStart === 0 && clip.trimEnd === clip.duration)} onClick={() => { studio.beginEdit(); studio.updateClip(layer.id, { trimStart: 0, trimEnd: clip.duration }, draft); }}>Use full recording</button>
    </details></>}
  </div>;
}
