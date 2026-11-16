import { clipBounds } from './clip-edits';
import { layerAudioId, type Layer } from './session';

export const SCRATCH_HOP_SECONDS = .03;

/** Read a short section of the audible mix in the direction and at the speed of the drag. */
export function scratchBuffer(context: AudioContext, buffers: ReadonlyMap<string, AudioBuffer>, layers: Layer[], position: number, rate: number) {
  const step = rate / context.sampleRate;
  const hopFrames = Math.round(SCRATCH_HOP_SECONDS * context.sampleRate);
  const frames = hopFrames * 2;
  const grain = context.createBuffer(2, frames, context.sampleRate);
  const output = [grain.getChannelData(0), grain.getChannelData(1)];
  const lastPosition = position + frames * step;

  for (const layer of layers) {
    if (!layer.enabled || layer.volume <= 0) continue;
    const buffer = buffers.get(layerAudioId(layer));
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

  // The fading halves add to unity when consecutive snippets read the same samples.
  for (let frame = 0; frame < hopFrames; frame++) {
    const fadeIn = (1 - Math.cos(Math.PI * frame / hopFrames)) / 2;
    output[0][frame] *= fadeIn;
    output[1][frame] *= fadeIn;
    output[0][hopFrames + frame] *= 1 - fadeIn;
    output[1][hopFrames + frame] *= 1 - fadeIn;
  }
  return grain;
}
