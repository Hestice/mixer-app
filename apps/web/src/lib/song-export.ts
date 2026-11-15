import { createSongOutput, OUTPUT_DELAY } from './audio-output';
import { clipBounds, selectTake } from './clip-edits';
import type { Layer } from './session';
import { encodeWavChannels } from './wav';

export const EXPORT_SAMPLE_RATE = 48_000;
const DEMO_IDS = new Set(['guitar', 'keys', 'rhythm', 'harmony']);

export function songFilename(title: string) {
  const name = title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 100);
  return `${name || 'Untitled song'}.wav`;
}

/** Only kept layers belong to a song export. Temporary solo/review state is not an edit. */
export async function exportSong(layers: Layer[], volume: number, onStage?: (stage: string) => void): Promise<Blob> {
  if (!layers.length) throw new Error('Keep a layer in your song before downloading it.');
  if (!(volume > 0) || !layers.some((layer) => layer.enabled && layer.volume > 0)) {
    throw new Error('Your song is silent. Unmute a layer and turn up its volume and the song volume.');
  }
  // Take a stable snapshot before decoding. Edits made afterwards belong to the next download.
  const snapshot = layers.map((layer) => layer.takeId ? selectTake(layer, layer.takeId) : { ...layer });
  if (typeof OfflineAudioContext === 'undefined') throw new Error('This browser cannot export audio. Try a current Safari, Chrome, Edge or Firefox.');
  onStage?.('Preparing audio…');
  const decoder = new OfflineAudioContext(2, 1, EXPORT_SAMPLE_RATE);
  const decoded: { layer: Layer; buffer: AudioBuffer }[] = [];
  let end = 0;
  for (const layer of snapshot) {
    // Silent parts still define the arrangement's end, as they do during playback.
    if (!layer.enabled || layer.volume <= 0) { end = Math.max(end, clipBounds(layer).end); continue; }
    let bytes: ArrayBuffer;
    if (layer.recorded) {
      if (!layer.blob) throw new Error(`The recording for “${layer.name}” is missing. Reopen the song from your backup and try again.`);
      bytes = await layer.blob.arrayBuffer();
    } else {
      if (!DEMO_IDS.has(layer.id)) throw new Error(`The audio for “${layer.name}” is unavailable.`);
      const response = await fetch(`/audio/${layer.id}.wav`);
      if (!response.ok) throw new Error('A demo layer could not load. Check your connection and try again.');
      bytes = await response.arrayBuffer();
    }
    let buffer: AudioBuffer;
    try { buffer = await decoder.decodeAudioData(bytes); }
    catch { throw new Error(`Could not read the recording for “${layer.name}”. Try reopening the song from your backup.`); }
    end = Math.max(end, clipBounds({ ...layer, duration: buffer.duration }).end);
    decoded.push({ layer, buffer });
  }
  onStage?.('Mixing your song…');
  const frames = Math.ceil(end * EXPORT_SAMPLE_RATE);
  const delay = Math.round(OUTPUT_DELAY * EXPORT_SAMPLE_RATE);
  const context = new OfflineAudioContext(2, frames + delay, EXPORT_SAMPLE_RATE);
  const master = createSongOutput(context, volume);
  for (const { layer, buffer } of decoded) {
    const clip = clipBounds({ ...layer, duration: buffer.duration });
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = layer.volume;
    source.connect(gain); gain.connect(master);
    source.start(clip.startAt, clip.trimStart, clip.length);
  }
  const rendered = await context.startRendering();
  onStage?.('Preparing download…');
  return encodeWavChannels([0, 1].map((channel) => rendered.getChannelData(channel).subarray(delay, delay + frames)), EXPORT_SAMPLE_RATE);
}
