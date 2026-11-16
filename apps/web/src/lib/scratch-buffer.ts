import { clipBounds } from './clip-edits';
import type { Layer } from './session';

const GRAIN_SECONDS = .056;

/** Read a short section of the audible mix in the direction and at the speed of the drag. */
export function scratchBuffer(context: AudioContext, buffers: ReadonlyMap<string, AudioBuffer>, layers: Layer[], position: number, velocity: number) {
  const rate = Math.max(.65, Math.min(5, Math.abs(velocity)));
  const step = Math.sign(velocity) * rate / context.sampleRate;
  const frames = Math.round(GRAIN_SECONDS * context.sampleRate);
  const grain = context.createBuffer(2, frames, context.sampleRate);
  const output = [grain.getChannelData(0), grain.getChannelData(1)];
  const lastPosition = position + frames * step;

  for (const layer of layers) {
    if (!layer.enabled || layer.volume <= 0) continue;
    const buffer = buffers.get(layer.id);
    if (!buffer) continue;
    const clip = clipBounds({ ...layer, duration: buffer.duration });
    if (Math.max(position, lastPosition) <= clip.startAt || Math.min(position, lastPosition) >= clip.end) continue;
    const firstFrame = (clip.trimStart + position - clip.startAt) * buffer.sampleRate;
    const stride = step * buffer.sampleRate;
    const trimStart = clip.trimStart * buffer.sampleRate;
    const trimEnd = Math.min(buffer.length, clip.trimEnd * buffer.sampleRate);

    for (let channel = 0; channel < output.length; channel++) {
      const input = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
      for (let frame = 0; frame < frames; frame++) {
        const sample = firstFrame + frame * stride;
        if (sample < trimStart || sample >= trimEnd) continue;
        const index = Math.floor(sample);
        const next = index + 1 < trimEnd ? input[index + 1] : input[index];
        output[channel][frame] += (input[index] + (next - input[index]) * (sample - index)) * layer.volume;
      }
    }
  }

  // Taper the snippets so they can overlap without clicks at their boundaries.
  for (let frame = 0; frame < frames; frame++) {
    const envelope = Math.min(1, frame / (frames * .2), (frames - 1 - frame) / (frames * .45));
    output[0][frame] *= envelope;
    output[1][frame] *= envelope;
  }
  return grain;
}
