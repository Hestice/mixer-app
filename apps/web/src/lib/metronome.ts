export type MetronomeMode = 'off' | 'visual' | 'sound';
export const canSoundClick = (mode: MetronomeMode, headphones: boolean) => mode === 'sound' && headphones;

export function metronomeBeatAt(time: number, start: number, beatSeconds: number) {
  return time < start ? -1 : Math.floor((time - start) / beatSeconds);
}

/** Output-only click track. It never connects to the microphone recorder. */
export class Metronome {
  private timer: ReturnType<typeof setInterval> | undefined;
  private notes = new Set<OscillatorNode>();
  private next = 0;
  private index = 0;
  constructor(private context: AudioContext) {}

  start(when: number, bpm: number, audible: boolean, until = Infinity) {
    this.stop();
    if (!audible) return;
    const beat = 60 / Math.max(40, Math.min(240, bpm));
    this.next = when; this.index = 0;
    const schedule = () => {
      // Skip missed clicks after throttling rather than firing them all together.
      if (this.next < this.context.currentTime) {
        const skipped = Math.ceil((this.context.currentTime - this.next) / beat);
        this.next += skipped * beat; this.index += skipped;
      }
      while (this.next < this.context.currentTime + .12 && this.next < until) {
        const oscillator = this.context.createOscillator();
        const envelope = this.context.createGain();
        oscillator.frequency.value = this.index % 4 === 0 ? 1100 : 760;
        envelope.gain.setValueAtTime(0, this.next);
        envelope.gain.linearRampToValueAtTime(.12, this.next + .002);
        envelope.gain.exponentialRampToValueAtTime(.0001, this.next + .035);
        oscillator.connect(envelope); envelope.connect(this.context.destination);
        this.notes.add(oscillator);
        oscillator.onended = () => { this.notes.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
        oscillator.start(this.next); oscillator.stop(this.next + .04);
        this.next += beat; this.index++;
      }
    };
    schedule();
    this.timer = setInterval(schedule, 25);
  }
  stop() {
    clearInterval(this.timer);
    this.notes.forEach((note) => { note.stop(); note.disconnect(); });
    this.notes.clear();
  }
}
