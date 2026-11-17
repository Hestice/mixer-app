import { MAX_BACKUP_AUDIO_BYTES, recordingBlob } from './recording-storage';
import { timeLabel, type Layer, type LayerColor } from './session';

const sampleRate = 44_100;
const maxSeconds = Math.floor((MAX_BACKUP_AUDIO_BYTES - 44) / (sampleRate * 4));
export const splitDurationLimit = timeLabel(maxSeconds);

export const splitStems = {
  vocals: { name: 'Vocals', color: 'plum' },
  drums: { name: 'Drums', color: 'clay' },
  bass: { name: 'Bass', color: 'teal' },
  other: { name: 'Other instruments', color: 'ochre' },
} satisfies Record<string, { name: string; color: LayerColor }>;

export type StemId = keyof typeof splitStems;
export type EncodedStem = { id: StemId; bytes: ArrayBuffer; peaks: number[]; duration: number };
export type SplitInput = { channels: Float32Array[]; sampleRate: number };
export type SplitMessage = { type: 'progress'; progress: number } | { type: 'done'; stems: EncodedStem[] } | { type: 'error' };

export async function splitAudioFile(file: File, signal: AbortSignal, onProgress: (progress: number) => void): Promise<Layer[]> {
  if (!/\.(mp3|wav)$/i.test(file.name)) throw new Error('Choose an MP3 or WAV file.');
  if (!file.size) throw new Error('This file is empty. Choose another song.');
  if (file.size > 100 * 1024 * 1024) throw new Error('Choose a file smaller than 100 MB.');
  if (typeof Worker === 'undefined' || typeof OfflineAudioContext === 'undefined' || typeof WebAssembly === 'undefined') {
    throw new Error('This browser can’t split songs. Try a current version of Safari, Chrome or Firefox.');
  }

  const decoder = new OfflineAudioContext(2, 1, sampleRate);
  let audio: AudioBuffer;
  try { audio = await decoder.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error('This audio couldn’t be opened. Try another MP3 or WAV file.'); }
  signal.throwIfAborted();
  if (!audio.duration || audio.duration > maxSeconds) throw new Error(`Choose a song up to ${splitDurationLimit} long.`);
  if (audio.numberOfChannels > 2) throw new Error('Choose a mono or stereo audio file.');

  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i).slice());
  onProgress(0);
  const result = await new Promise<EncodedStem[]>((resolve, reject) => {
    const worker = new Worker(new URL('./song-separation.worker.ts', import.meta.url), { type: 'module' });
    function cleanup() {
      signal.removeEventListener('abort', abort);
      worker.terminate();
    }
    function abort() { cleanup(); reject(signal.reason); }
    function fail() { cleanup(); reject(new Error('This song couldn’t be split on this device. Try a shorter file or another browser.')); }
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.onmessage = ({ data }: MessageEvent<SplitMessage>) => {
      if (data.type === 'progress') onProgress(data.progress);
      else if (data.type === 'done') { cleanup(); resolve(data.stems); }
      else fail();
    };
    try { worker.postMessage({ channels, sampleRate } satisfies SplitInput, channels.map(channel => channel.buffer)); }
    catch { fail(); }
  });
  signal.throwIfAborted();
  return result.map(({ id, bytes, peaks, duration }): Layer => {
    const take = { id: `take-${crypto.randomUUID()}`, blob: recordingBlob(bytes), peaks, duration, startAt: 0 };
    return { ...take, ...splitStems[id], kind: 'recording', recorded: true, enabled: true, volume: 1, takeId: take.id, takes: [take] };
  });
}
