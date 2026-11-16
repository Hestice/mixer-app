import type { Lifecycle } from './library-entry';
import demoPeaks from './demo-peaks.json';
import { layerReveal, STORY_BOUNDARIES } from './story-motion';

export const layerColors = {
  moss: 'Moss', teal: 'Teal', slate: 'Slate blue', plum: 'Plum', clay: 'Clay', ochre: 'Ochre',
} as const;
export type LayerColor = keyof typeof layerColors;

export type LayerKind = 'guitar' | 'keys' | 'rhythm' | 'harmony' | 'recording';
export interface ClipEdits { trimStart?: number; trimEnd?: number; startAt?: number }
export interface RecordingTake extends ClipEdits {
  id: string;
  blob?: Blob;
  peaks?: number[];
  duration: number;
}
export interface Layer extends ClipEdits, Lifecycle {
  id: string;
  name: string;
  kind: LayerKind;
  color?: LayerColor;
  enabled: boolean;
  volume: number;
  recorded?: boolean;
  takeId?: string;
  takes?: RecordingTake[];
  blob?: Blob;
  peaks?: number[];
  duration?: number;
}

export const demoLayers: Layer[] = [
  { id: 'guitar', name: 'Guitar', kind: 'guitar', enabled: true, volume: 0.8, peaks: demoPeaks.guitar },
  { id: 'keys', name: 'Keys', kind: 'keys', enabled: false, volume: 0.7, peaks: demoPeaks.keys },
  { id: 'rhythm', name: 'Rhythm', kind: 'rhythm', enabled: false, volume: 0.7, peaks: demoPeaks.rhythm },
];

export const harmonyLayer: Layer = {
  id: 'harmony', name: 'Harmony', kind: 'harmony', enabled: true, volume: 0.65, peaks: demoPeaks.harmony,
};

/** Tour entry is deterministic in either direction; the workspace owns its mix. */
export function tourScene(chapter: number, buildStage: 0 | 1 | 2 = chapter >= 2 ? 2 : 0): { layers: Layer[]; candidate: Layer | null } {
  const stage = chapter >= 3 ? 2 : chapter === 0 ? 0 : buildStage;
  const layers = demoLayers.map((layer) => ({ ...layer, enabled: layer.id === 'guitar' || (layer.id === 'keys' ? stage >= 1 : stage >= 2) }));
  if (chapter >= 4) layers.push({ ...harmonyLayer });
  return { layers, candidate: chapter === 3 ? { ...harmonyLayer } : null };
}

/** A kept candidate becomes one independently editable layer, never a duplicate. */
export function commitLayer(layers: Layer[], candidate: Layer): Layer[] {
  return layers.some((layer) => layer.id === candidate.id)
    ? layers
    : [...layers, { ...candidate, enabled: true }];
}

export function chapterFromProgress(progress: number): number {
  return STORY_BOUNDARIES.filter((boundary) => progress >= boundary).length;
}

/** Harmony stays a preview while its card travels; commit on arrival. */
export function mixChapterFromProgress(progress: number): number {
  return layerReveal('harmony', progress) === 1 ? 4 : chapterFromProgress(progress);
}

export function timeLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

export function extractPeaks(samples: Float32Array, count = 64): number[] {
  const values = Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * samples.length / count);
    const stop = Math.floor((index + 1) * samples.length / count);
    let sum = 0;
    for (let i = start; i < stop; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / Math.max(1, stop - start));
  });
  const maximum = Math.max(...values, 0.0001);
  return values.map((value) => Number((value / maximum).toFixed(3)));
}
