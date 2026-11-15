import demoPeaks from './demo-peaks.json';

export type LayerKind = 'guitar' | 'keys' | 'rhythm' | 'harmony' | 'recording';
export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  enabled: boolean;
  volume: number;
  recorded?: boolean;
  blob?: Blob;
  peaks?: number[];
}

export const demoLayers: Layer[] = [
  { id: 'guitar', name: 'Guitar', kind: 'guitar', enabled: true, volume: 0.8, peaks: demoPeaks.guitar },
  { id: 'keys', name: 'Keys', kind: 'keys', enabled: false, volume: 0.7, peaks: demoPeaks.keys },
  { id: 'rhythm', name: 'Rhythm', kind: 'rhythm', enabled: false, volume: 0.7, peaks: demoPeaks.rhythm },
];

export const harmonyLayer: Layer = {
  id: 'harmony', name: 'Harmony', kind: 'harmony', enabled: true, volume: 0.65, peaks: demoPeaks.harmony,
};

/** A kept candidate becomes one independently editable layer, never a duplicate. */
export function commitLayer(layers: Layer[], candidate: Layer): Layer[] {
  return layers.some((layer) => layer.id === candidate.id)
    ? layers
    : [...layers, { ...candidate, enabled: true }];
}

export function chapterFromProgress(progress: number): number {
  return Math.max(0, Math.min(4, Math.floor(Math.min(1, Math.max(0, progress)) * 5)));
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
