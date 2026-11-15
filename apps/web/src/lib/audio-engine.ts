import { clipBounds, playbackWindow } from './clip-edits';
import { extractPeaks, type Layer } from './session';

/** The tour loops; the recording workspace plays each part once on a shared clock. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sources = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private loading: Promise<void> | null = null;
  private startedAt = 0;
  private pausedAt = 0;
  private loopDuration = 80 / 7;
  private looping = true;
  playing = false;

  async ready() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = 0.65;
      // A gentle limiter keeps layered auditioning from clipping the destination.
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.ratio.value = 8;
      this.master.connect(limiter);
      limiter.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

  async loadDemo() {
    await this.ready();
    if (!this.loading) {
      this.loading = Promise.all(['guitar', 'keys', 'rhythm', 'harmony'].map(async (id) => {
        const response = await fetch(`/audio/${id}.wav`);
        if (!response.ok) throw new Error('The demo could not load. Please try again.');
        const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(id, buffer);
      })).then(() => undefined).catch((error: unknown) => { this.loading = null; throw error; });
    }
    await this.loading;
  }

  async addRecording(id: string, blob: Blob) {
    const context = await this.ready();
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    this.buffers.set(id, buffer);
    return buffer.duration;
  }

  addSamples(id: string, samples: Float32Array, sampleRate: number) {
    if (!this.context) throw new Error('Connect your microphone first.');
    const buffer = this.context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    this.buffers.set(id, buffer);
    return buffer.duration;
  }

  configureSession(layers: Layer[]) {
    this.reset();
    this.looping = false;
    this.loopDuration = Math.max(0, ...layers.map((layer) => clipBounds({ ...layer, duration: layer.duration ?? this.buffers.get(layer.id)?.duration }).end));
  }

  removeRecording(id: string) { this.buffers.delete(id); }

  setLoopDuration(duration: number) {
    if (Number.isFinite(duration) && duration > 0) this.loopDuration = duration;
  }

  get duration() { return this.loopDuration; }
  peaks(id: string) {
    const buffer = this.buffers.get(id);
    return buffer ? extractPeaks(buffer.getChannelData(0)) : [];
  }
  get position() {
    if (!this.context || !this.playing) return this.pausedAt;
    const elapsed = Math.max(0, this.context.currentTime - this.startedAt);
    return this.looping ? elapsed % this.loopDuration : Math.min(elapsed, this.loopDuration);
  }

  async play(layers: Layer[], restart = false, from?: number) {
    const context = await this.ready();
    if (!this.looping) this.loopDuration = Math.max(0, ...layers.map((layer) => clipBounds(layer).end));
    if (restart) this.pausedAt = from ?? 0;
    this.stopSources();
    const offset = this.looping ? this.pausedAt % this.loopDuration : this.pausedAt >= this.loopDuration ? 0 : this.pausedAt;
    const when = context.currentTime + 0.04;
    this.start(layers, when, offset);
  }

  /** Schedule backing tracks at the exact same audio time as microphone capture. */
  playAt(layers: Layer[], when: number) {
    if (!this.context) throw new Error('Audio is not ready.');
    this.stopSources();
    this.start(layers, when, 0);
  }

  private start(layers: Layer[], when: number, offset: number) {
    this.startedAt = when - offset;
    this.pausedAt = offset;
    this.playing = layers.length > 0;
    for (const layer of layers) this.attach(layer, when, offset);
  }

  private attach(layer: Layer, when: number, offset: number) {
    const buffer = this.buffers.get(layer.id);
    if (!buffer || !this.context || !this.master) return;
    const window = playbackWindow({ ...layer, duration: buffer.duration }, offset);
    if (!this.looping && !window) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    // Pad shorter takes so they repeat on the composition boundary, not their own length.
    const frames = Math.max(1, Math.round(this.loopDuration * buffer.sampleRate));
    if (this.looping && buffer.length !== frames) {
      const aligned = this.context.createBuffer(buffer.numberOfChannels, frames, buffer.sampleRate);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        aligned.copyToChannel(buffer.getChannelData(channel).subarray(0, frames), channel);
      }
      source.buffer = aligned;
    } else source.buffer = buffer;
    source.loop = this.looping;
    source.loopEnd = this.loopDuration;
    gain.gain.value = layer.enabled ? layer.volume : 0;
    source.connect(gain);
    gain.connect(this.master);
    if (this.looping) source.start(when, offset);
    else source.start(when + window!.delay, window!.offset, window!.duration);
    this.sources.set(layer.id, { source, gain });
    if (!this.looping) source.onended = () => {
      // A stopped or replaced source must not end a later playback session.
      if (this.sources.get(layer.id)?.source !== source || !this.context) return;
      if (this.context.currentTime >= this.startedAt + this.loopDuration - .01) {
        this.pausedAt = this.loopDuration;
        this.playing = false;
      }
    };
  }

  sync(layers: Layer[]) {
    if (!this.context || !this.playing) return;
    const ids = new Set(layers.map((layer) => layer.id));
    for (const [id, nodes] of this.sources) {
      if (!ids.has(id)) { nodes.source.stop(); nodes.source.disconnect(); nodes.gain.disconnect(); this.sources.delete(id); }
    }
    for (const layer of layers) {
      const nodes = this.sources.get(layer.id);
      if (nodes) nodes.gain.gain.setTargetAtTime(layer.enabled ? layer.volume : 0, this.context.currentTime, 0.025);
      else this.attach(layer, this.context.currentTime, this.position);
    }
  }

  volume(value: number) {
    if (this.context && this.master) this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.025);
  }

  pause() {
    this.pausedAt = this.position;
    this.playing = false;
    this.stopSources();
  }

  reset() { this.pause(); this.pausedAt = 0; }
  private stopSources() {
    for (const { source, gain } of this.sources.values()) {
      source.stop(); source.disconnect(); gain.disconnect();
    }
    this.sources.clear();
  }
  dispose() { this.reset(); void this.context?.close(); }
}
