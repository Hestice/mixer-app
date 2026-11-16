import { readRecording } from './recording-storage';
import { estimateBeatAlignment } from './beat-alignment';
import { createSongOutput } from './audio-output';
import { clipBounds, playbackWindow } from './clip-edits';
import { scratchBuffer } from './scratch-buffer';
import { extractPeaks, type Layer } from './session';

const SCRATCH_INTERVAL = .032;
const SCRATCH_RELEASE = .012;

type Scrub = {
  gain: GainNode;
  sources: Set<AudioBufferSourceNode>;
  lastTime: number;
  lastPosition: number;
};

/** The tour loops; the recording workspace plays each part once on a shared clock. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sources = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private loading: Promise<void> | null = null;
  private scrub: Scrub | null = null;
  private startedAt = 0;
  private pausedAt = 0;
  private loopDuration = 80 / 7;
  private looping = true;
  playing = false;

  async ready() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = createSongOutput(this.context, .65);
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

  async addRecording(id: string, blob: Blob | undefined, name = id) {
    const context = await this.ready();
    const data = await readRecording(blob, name);
    let buffer: AudioBuffer;
    try { buffer = await context.decodeAudioData(data); }
    catch (cause) { throw new Error(`The audio in “${name}” could not be decoded. Try restoring that take from your cloud backup.`, { cause }); }
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

  configureSession(layers: Layer[], position = 0) {
    this.reset();
    this.looping = false;
    this.loopDuration = Math.max(0, ...layers.map((layer) => clipBounds({ ...layer, duration: layer.duration ?? this.buffers.get(layer.id)?.duration }).end));
    this.pausedAt = Math.max(0, position);
  }

  removeRecording(id: string) { this.buffers.delete(id); }

  setLoopDuration(duration: number) {
    if (Number.isFinite(duration) && duration > 0) this.loopDuration = duration;
  }

  get duration() { return this.loopDuration; }
  get playbackClock() {
    return this.context && this.playing && !this.scrub ? { context: this.context, startTime: this.startedAt } : null;
  }

  measureBeat(layer: Layer) {
    const buffer = this.buffers.get(layer.id);
    return buffer ? estimateBeatAlignment(buffer, clipBounds({ ...layer, duration: buffer.duration })) : null;
  }
  peaks(id: string) {
    const buffer = this.buffers.get(id);
    return buffer ? extractPeaks(buffer.getChannelData(0)) : [];
  }
  get position() {
    if (!this.context || !this.playing || this.scrub) return this.pausedAt;
    const elapsed = Math.max(0, this.context.currentTime - this.startedAt);
    return this.looping ? elapsed % this.loopDuration : Math.min(elapsed, this.loopDuration);
  }

  async play(layers: Layer[], restart = false, from?: number) {
    const context = await this.ready();
    if (!this.looping) this.loopDuration = Math.max(0, ...layers.map((layer) => clipBounds(layer).end));
    if (restart) this.pausedAt = from ?? 0;
    this.clearScrub();
    this.stopSources();
    const offset = this.looping ? this.pausedAt % this.loopDuration : this.pausedAt >= this.loopDuration ? 0 : this.pausedAt;
    const when = context.currentTime + 0.04;
    this.start(layers, when, offset);
  }

  /** Schedule backing tracks at the exact same audio time as microphone capture. */
  playAt(layers: Layer[], when: number, position = 0) {
    if (!this.context) throw new Error('Audio is not ready.');
    this.clearScrub();
    this.stopSources();
    this.start(layers, when, position);
  }

  /** Move the shared cursor without starting playback when paused. */
  seek(layers: Layer[], position: number) {
    const wasPlaying = this.playing;
    this.pause();
    this.pausedAt = Math.max(0, position);
    if (wasPlaying && this.context && position < this.loopDuration) this.start(layers, this.context.currentTime + .04, this.pausedAt);
  }

  beginScrub() {
    if (!this.context || !this.master || !this.playing || this.looping || this.scrub) return false;
    this.pausedAt = this.position;
    this.stopSources();
    const gain = this.context.createGain();
    gain.gain.value = .8;
    gain.connect(this.master);
    this.scrub = {
      gain, sources: new Set(), lastTime: this.context.currentTime - SCRATCH_INTERVAL,
      lastPosition: this.pausedAt,
    };
    return true;
  }

  scrubTo(layers: Layer[], position: number, audible: boolean) {
    const { scrub, context } = this;
    if (!scrub || !context) return;
    this.pausedAt = position;
    if (!audible) {
      scrub.lastPosition = position;
      return;
    }
    const now = context.currentTime;
    const elapsed = now - scrub.lastTime;
    const distance = position - scrub.lastPosition;
    if (elapsed < SCRATCH_INTERVAL - .001 || !distance) return;
    const velocity = distance / Math.min(.08, elapsed);
    const lead = Math.min(Math.abs(distance), Math.min(5, Math.abs(velocity)) * .022);
    const source = context.createBufferSource();
    source.buffer = scratchBuffer(context, this.buffers, layers, position - Math.sign(distance) * lead, velocity);
    source.connect(scrub.gain);
    scrub.sources.add(source);
    source.onended = () => {
      source.disconnect();
      scrub.sources.delete(source);
      if (this.scrub !== scrub && !scrub.sources.size) scrub.gain.disconnect();
    };
    source.start(now);
    scrub.lastTime = now;
    scrub.lastPosition = position;
  }

  endScrub(layers: Layer[]) {
    if (!this.scrub || !this.context) return false;
    this.clearScrub(SCRATCH_RELEASE);
    if (this.pausedAt < this.loopDuration) this.start(layers, this.context.currentTime + SCRATCH_RELEASE, this.pausedAt);
    else this.playing = false;
    return true;
  }

  private clearScrub(fade = 0) {
    const scrub = this.scrub;
    if (!scrub) return;
    this.scrub = null;
    if (fade && this.context && scrub.sources.size) {
      const now = this.context.currentTime;
      scrub.gain.gain.setValueAtTime(scrub.gain.gain.value, now);
      scrub.gain.gain.linearRampToValueAtTime(0, now + fade);
      for (const source of scrub.sources) source.stop(now + fade);
    } else {
      for (const source of scrub.sources) {
        source.onended = null;
        source.stop();
        source.disconnect();
      }
      scrub.gain.disconnect();
    }
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
    if (!this.context || !this.playing || this.scrub) return;
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
    this.clearScrub();
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
