import type { ClipEdits, Layer, RecordingTake } from './session';

export const MIN_CLIP = .05;
export const MAX_START = 60 * 60;
const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
export function clipBounds(layer: ClipEdits & { duration?: number }) {
  const duration = Math.max(MIN_CLIP, finite(layer.duration, 80 / 7));
  const trimStart = Math.max(0, Math.min(duration - MIN_CLIP, finite(layer.trimStart, 0)));
  const trimEnd = Math.max(trimStart + MIN_CLIP, Math.min(duration, finite(layer.trimEnd, duration)));
  const startAt = Math.max(0, Math.min(MAX_START, finite(layer.startAt, 0)));
  return { duration, trimStart, trimEnd, startAt, length: trimEnd - trimStart, end: startAt + trimEnd - trimStart };
}
export function takesOf(layer: Layer): RecordingTake[] {
  if (!layer.recorded) return [];
  return layer.takes?.length ? layer.takes : [{ id: layer.takeId ?? layer.id, blob: layer.blob, duration: layer.duration ?? 0, peaks: layer.peaks, trimStart: layer.trimStart, trimEnd: layer.trimEnd, startAt: layer.startAt }];
}
export function selectTake(layer: Layer, id: string): Layer {
  const takes = takesOf(layer);
  const take = takes.find((item) => item.id === id);
  return take ? { ...layer, ...take, id: layer.id, takeId: take.id, takes,
    trimStart: take.trimStart ?? 0, trimEnd: take.trimEnd ?? take.duration, startAt: take.startAt ?? 0 } : layer;
}
export function appendTake(layer: Layer, take: RecordingTake): Layer {
  return selectTake({ ...layer, takes: [...takesOf(layer), take] }, take.id);
}
/** Remove the selected draft take. Existing takes in a kept layer stay available. */
export function discardDraftTake(layer: Layer, keptLayer?: Layer): Layer | null {
  const selected = layer.takeId ?? layer.id;
  const kept = new Set(keptLayer ? takesOf(keptLayer).map(take => take.id) : []);
  if (kept.has(selected)) return layer;
  const takes = takesOf(layer).filter(take => take.id !== selected);
  const next = takes.filter(take => !kept.has(take.id)).at(-1);
  return next ? selectTake({ ...layer, takes }, next.id) : null;
}

export function editClip(layer: Layer, patch: ClipEdits): Layer {
  const previous = clipBounds(layer);
  const next = clipBounds({ ...layer, ...patch });
  // Cutting silence off the front must not pull the performance earlier in the song.
  const startAt = patch.trimStart !== undefined && patch.startAt === undefined
    ? Math.max(0, previous.startAt + next.trimStart - previous.trimStart) : next.startAt;
  const bounds = clipBounds({ ...layer, ...patch, startAt });
  const edits = { trimStart: bounds.trimStart, trimEnd: bounds.trimEnd, startAt: bounds.startAt };
  if (!layer.recorded) return { ...layer, ...edits };
  const takeId = layer.takeId ?? layer.id;
  return { ...layer, ...edits, takeId, takes: takesOf(layer).map((take) => take.id === takeId ? { ...take, ...edits } : take) };
}
/** Resume inside a clip without replaying its trimmed or already-heard audio. */
export function playbackWindow(layer: ClipEdits & { duration?: number }, position: number) {
  const clip = clipBounds(layer);
  if (position >= clip.end) return null;
  const elapsed = Math.max(0, position - clip.startAt);
  return { delay: Math.max(0, clip.startAt - position), offset: clip.trimStart + elapsed, duration: clip.length - elapsed };
}
export function snapStart(value: number, anchors: number[], tolerance: number) {
  const bounded = Math.max(0, Math.min(MAX_START, value));
  const nearest = [0, ...anchors].reduce((best, anchor) => Math.abs(anchor - bounded) < Math.abs(best - bounded) ? anchor : best, 0);
  return Math.abs(nearest - bounded) <= tolerance ? nearest : Math.round(bounded * 100) / 100;
}
