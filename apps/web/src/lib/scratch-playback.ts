import { scratchBuffer, SCRATCH_HOP_SECONDS } from './scratch-buffer';
import type { Layer } from './session';

const LOOKAHEAD = .028;
const MOTION_TIMEOUT = .085;
const RELEASE = .012;

function scratchRate(velocity: number) {
  const speed = Math.abs(velocity);
  const rate = speed < .82 ? .55 + .45 * speed / .82 : Math.min(1.7, 1 + Math.max(0, speed - 1.18) * .22);
  return Math.sign(velocity) * rate;
}

export class ScratchPlayback {
  private gain: GainNode;
  private sources = new Set<AudioBufferSourceNode>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private latest: { position: number; time: number };
  private speedSample: { position: number; time: number };
  private velocity = 0;
  private nextTime = 0;
  private previous?: { position: number; rate: number };
  private layers: Layer[] = [];
  private hop: number;
  private released = false;

  constructor(private context: AudioContext, output: GainNode, private buffers: ReadonlyMap<string, AudioBuffer>, position: number, heldFor: number) {
    this.hop = Math.round(SCRATCH_HOP_SECONDS * context.sampleRate) / context.sampleRate;
    const now = context.currentTime;
    this.latest = { position, time: now };
    this.speedSample = { position, time: now - Math.max(this.hop, heldFor) };
    this.gain = context.createGain();
    this.gain.gain.value = .7;
    this.gain.connect(output);
  }

  move(layers: Layer[], position: number, audible: boolean) {
    const time = this.context.currentTime;
    if (!audible) {
      this.latest = { position, time };
      this.speedSample = { position, time: time - this.hop };
      return;
    }
    this.layers = layers;
    const delta = position - this.latest.position;
    if (!delta) return;
    const elapsed = time - this.speedSample.time;
    const reversed = this.velocity && Math.sign(delta) !== Math.sign(this.velocity);
    if (!this.velocity || reversed || elapsed >= .022) {
      const sample = reversed ? this.latest : this.speedSample;
      const seconds = Math.max(.016, Math.min(.25, time - sample.time));
      const measured = (position - sample.position) / seconds;
      this.velocity = !this.velocity || reversed ? measured : .6 * this.velocity + .4 * measured;
      this.speedSample = { position, time };
    }

    this.latest = { position, time };
    this.schedule();
    this.timer ??= setInterval(() => this.schedule(), 12);
  }

  private schedule() {
    const now = this.context.currentTime;
    if (now - this.latest.time > MOTION_TIMEOUT) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.velocity = 0;
      this.speedSample = { position: this.latest.position, time: now - this.hop };
      return;
    }

    if (this.nextTime < now) {
      this.nextTime = now + .005;
      this.previous = undefined;
    }
    const rate = scratchRate(this.velocity);
    while (this.nextTime <= Math.min(now + LOOKAHEAD, this.latest.time + 2 * this.hop)) {
      const target = this.latest.position + rate * (this.nextTime - this.latest.time - this.hop / 2);
      const previous = this.previous;
      const expected = previous ? previous.position + previous.rate * this.hop : target;
      // At regular playing speed, keep the waveforms aligned across overlaps despite pointer jitter.
      const position = Math.abs(rate) === 1 && previous?.rate === rate && Math.abs(expected - target) < .055 ? expected : target;
      const source = this.context.createBufferSource();
      source.buffer = scratchBuffer(this.context, this.buffers, this.layers, position, rate);
      source.connect(this.gain);
      this.sources.add(source);
      source.onended = () => {
        source.disconnect();
        this.sources.delete(source);
        if (this.released && !this.sources.size) this.gain.disconnect();
      };
      source.start(this.nextTime);
      this.previous = { position, rate };
      this.nextTime += this.hop;
    }
  }

  stop(fade: boolean) {
    clearInterval(this.timer);
    this.released = true;
    if (fade && this.sources.size) {
      const now = this.context.currentTime;
      this.gain.gain.setValueAtTime(this.gain.gain.value, now);
      this.gain.gain.linearRampToValueAtTime(0, now + RELEASE);
      for (const source of this.sources) source.stop(now + RELEASE);
      return RELEASE;
    }
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    this.gain.disconnect();
    return 0;
  }
}
