import { OUTPUT_DELAY } from './audio-output';
import { nextBeatDelay } from './metronome';

const validDelay = (value: number | undefined) => Number.isFinite(value) && value! >= 0 && value! <= 2 ? value! : 0;
/** Browser estimates, in seconds. Unknown input latency is left at zero rather than guessed. */
export function recordingDelay(context: { baseLatency?: number; outputLatency?: number }, inputLatency?: number) {
  return OUTPUT_DELAY + validDelay(context.baseLatency) + validDelay(context.outputLatency) + validDelay(inputLatency);
}

/** Keep the complete original; compensate through reversible trim metadata. */
export function recordedPlacement(duration: number, position: number, delay: number) {
  return { startAt: Math.max(0, position), trimStart: Math.min(Math.max(0, duration - .05), Math.max(0, delay)), trimEnd: duration };
}

export function recordingSchedule(time: number, tempo: number, countIn: boolean, position = 0, beatOffset?: number) {
  const beatSeconds = 60 / tempo;
  const countAt = time + .12; // Give the worklet and backing tracks a common start time.
  const startAt = countAt + (countIn ? 4 * beatSeconds : 0);
  const beatAt = countAt + OUTPUT_DELAY + (beatOffset === undefined ? 0 : nextBeatDelay(position, tempo, beatOffset));
  return { beatSeconds, countAt, startAt, beatAt };
}
