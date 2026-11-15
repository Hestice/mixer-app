import { extractPeaks, type Layer } from './session';

/** All parts use one AudioContext and one loop boundary, so toggling never drifts. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sources = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private loading: Promise<void> | null = null;
  private startedAt = 0;
  private pausedAt = 0;
  private loopDuration = 80 / 7;
  playing = false;

  async ready() {
    if (!this.context) {
      this.context = new AudioContext();
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
    return Math.max(0, this.context.currentTime - this.startedAt) % this.loopDuration;
  }

  async play(layers: Layer[], restart = false) {
    const context = await this.ready();
    if (restart) this.pausedAt = 0;
    if (this.playing) this.stopSources();
    const offset = this.pausedAt % this.loopDuration;
    const when = context.currentTime + 0.04;
    this.startedAt = when - offset;
    this.playing = true;
    for (const layer of layers) this.attach(layer, when, offset);
  }

  private attach(layer: Layer, when: number, offset: number) {
    const buffer = this.buffers.get(layer.id);
    if (!buffer || !this.context || !this.master) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    // Pad shorter takes so they repeat on the composition boundary, not their own length.
    const frames = Math.max(1, Math.round(this.loopDuration * buffer.sampleRate));
    if (buffer.length !== frames) {
      const aligned = this.context.createBuffer(buffer.numberOfChannels, frames, buffer.sampleRate);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        aligned.copyToChannel(buffer.getChannelData(channel).subarray(0, frames), channel);
      }
      source.buffer = aligned;
    } else source.buffer = buffer;
    source.loop = true;
    source.loopEnd = this.loopDuration;
    gain.gain.value = layer.enabled ? layer.volume : 0;
    source.connect(gain);
    gain.connect(this.master);
    source.start(when, offset);
    this.sources.set(layer.id, { source, gain });
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
