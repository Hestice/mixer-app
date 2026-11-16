'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Layer } from '../lib/session';
import { clipBounds } from '../lib/clip-edits';

const cache = new WeakMap<Blob, Promise<number[]>>();
function detailedPeaks(blob: Blob) {
  let loaded = cache.get(blob);
  if (!loaded) {
    loaded = (async () => {
      const context = new OfflineAudioContext(1, 1, 48_000);
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      const count = Math.min(4096, buffer.length);
      const peaks = new Array<number>(count).fill(0);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let i = 0; i < count; i++) {
          for (let frame = Math.floor(i * samples.length / count); frame < Math.floor((i + 1) * samples.length / count); frame++) peaks[i] = Math.max(peaks[i], Math.abs(samples[frame]));
        }
      }
      const maximum = Math.max(.001, ...peaks);
      return peaks.map((peak) => peak / maximum);
    })();
    cache.set(blob, loaded);
  }
  return loaded;
}

/** Source coordinates stay fixed when the clip is trimmed or the timeline zooms. */
export function TimelineWaveform({ layer }: { layer: Layer }) {
  const [detail, setDetail] = useState<{ blob: Blob; peaks: number[] } | null>(null);
  useEffect(() => {
    let canceled = false;
    if (layer.blob) { const blob = layer.blob; void detailedPeaks(blob).then((peaks) => { if (!canceled) setDetail({ blob, peaks }); }).catch(() => {}); }
    return () => { canceled = true; };
  }, [layer.blob]);
  const peaks = detail && detail.blob === layer.blob ? detail.peaks : layer.peaks;
  const clip = clipBounds(layer);
  const geometry = useMemo(() => {
    if (!peaks?.length) return null;
    const from = clip.trimStart / clip.duration * peaks.length;
    const width = clip.length / clip.duration * peaks.length;
    const first = Math.max(0, Math.floor(from)); const last = Math.min(peaks.length, Math.ceil(from + width));
    const top = Array.from({ length: last - first }, (_, i) => `${first + i},${50 - peaks[first + i] * 46}`).join(' ');
    const bottom = Array.from({ length: last - first }, (_, i) => { const index = last - 1 - i; return `${index},${50 + peaks[index] * 46}`; }).join(' ');
    return { viewBox: `${from} 0 ${Math.max(.001, width)} 100`, points: `${top} ${bottom}` };
  }, [peaks, clip.trimStart, clip.duration, clip.length]);
  return geometry ? <svg className="timeline-waveform" viewBox={geometry.viewBox} preserveAspectRatio="none" aria-hidden="true"><polygon points={geometry.points} /></svg> : <span className="timeline-silence" />;
}
