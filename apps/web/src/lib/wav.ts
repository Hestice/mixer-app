/** Preserve the mono microphone format used by existing saved recordings. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  return encodeWavChannels([samples], sampleRate);
}

/** Interleaved 16-bit PCM WAV, preserving mono or stereo channel layout. */
export function encodeWavChannels(channels: Float32Array[], sampleRate: number): Blob {
  const frames = channels[0]?.length ?? 0;
  if (!channels.length || channels.length > 2 || channels.some((channel) => channel.length !== frames)) {
    throw new Error('Audio channels must have the same length.');
  }
  const blockAlign = channels.length * 2;
  const bytes = new ArrayBuffer(44 + frames * blockAlign);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * blockAlign, true);
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels.length; channel++) {
      const sample = channels[channel][frame];
      const value = Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample)) : 0;
      view.setInt16(44 + frame * blockAlign + channel * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
