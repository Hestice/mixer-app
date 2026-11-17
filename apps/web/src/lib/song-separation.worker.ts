import separate from '@audio/neural-separate';
import { env } from 'onnxruntime-web/wasm';
import type { EncodedStem, SplitInput, SplitMessage, StemId } from './song-separation';
import { extractPeaks } from './session';
import { encodeWavBytes } from './wav';

const stemOrder: StemId[] = ['vocals', 'drums', 'bass', 'other'];
env.wasm.numThreads = self.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency || 1, 8) : 1;

self.onmessage = async ({ data }: MessageEvent<SplitInput>) => {
  try {
    const result = await separate(data.channels, {
      model: 'scnet',
      sampleRate: data.sampleRate,
      weights: new URL('/stem-models/', self.location.origin).href,
      device: 'wasm',
      step: .5,
      progress: ({ chunk, totalChunks }) => self.postMessage({ type: 'progress', progress: (chunk - 1) / totalChunks } satisfies SplitMessage),
    });
    self.postMessage({ type: 'progress', progress: 1 } satisfies SplitMessage);
    const stems: EncodedStem[] = stemOrder.map(id => {
      const channels = result.stems[id];
      const peaks = channels.map(channel => extractPeaks(channel, 512)).reduce((left, right) => left.map((value, i) => Math.max(value, right[i])));
      return { id, bytes: encodeWavBytes(channels, result.sampleRate), peaks, duration: channels[0].length / result.sampleRate };
    });
    self.postMessage({ type: 'done', stems } satisfies SplitMessage, { transfer: stems.map(stem => stem.bytes) });
  } catch (reason) {
    console.error('Song separation failed', reason);
    self.postMessage({ type: 'error' } satisfies SplitMessage);
  }
};
