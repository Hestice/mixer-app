/** Keep the playback and download output stages identical. */
export function createSongOutput(context: BaseAudioContext, volume: number) {
  const master = context.createGain();
  master.gain.value = volume;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.ratio.value = 8;
  master.connect(limiter);
  limiter.connect(context.destination);
  return master;
}

// Web Audio's compressor has a fixed 6 ms look-ahead. Render it, then remove
// that delay from the file so the timeline starts at zero without losing its end.
export const OUTPUT_DELAY = .006;
