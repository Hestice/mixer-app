import { nextBeatDelay } from './metronome';

type BeatAudio = Pick<AudioBuffer, 'getChannelData' | 'length' | 'numberOfChannels' | 'sampleRate'>;
type ClipWindow = { trimStart: number; trimEnd: number; startAt: number };
type Onset = { time: number; weight: number };

function findOnsets(buffer: BeatAudio, clip: ClipWindow): Onset[] {
  const start = Math.min(buffer.length, Math.round(clip.trimStart * buffer.sampleRate));
  const end = Math.min(buffer.length, Math.round(clip.trimEnd * buffer.sampleRate));
  const hop = Math.max(1, Math.round(buffer.sampleRate * .01));
  const hopSeconds = hop / buffer.sampleRate;
  const count = Math.min(4000, Math.floor((end - start) / hop));
  if (count < 100) return [];
  const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, index) => buffer.getChannelData(index));
  const strength = new Float32Array(count);
  let previous = 0;
  let maximum = 0;
  for (let frame = 0; frame < count; frame++) {
    const from = start + frame * hop;
    let power = 0;
    for (const samples of channels) {
      for (let sample = from; sample < from + hop; sample++) power += samples[sample] ** 2;
    }
    const envelope = Math.log1p(32 * Math.sqrt(power / (hop * channels.length)));
    const rise = frame === 0 && start > 0 ? 0 : Math.max(0, envelope - previous);
    strength[frame] = rise;
    maximum = Math.max(maximum, rise);
    previous = envelope;
  }

  const onsets: Onset[] = [];
  const threshold = Math.max(.08, maximum * .13);
  for (let frame = 0; frame < count; frame++) {
    const weight = strength[frame];
    if (weight < threshold || weight < (strength[frame - 1] ?? 0) || weight <= (strength[frame + 1] ?? 0)) continue;
    const time = frame * hopSeconds;
    const last = onsets.at(-1);
    if (!last || time - last.time >= .085) onsets.push({ time, weight });
    else if (weight > last.weight) onsets[onsets.length - 1] = { time, weight };
  }
  return onsets;
}

/** Estimate a constant beat grid from the note attacks in the audible portion of one take. */
export function estimateBeatAlignment(buffer: BeatAudio, clip: ClipWindow) {
  const onsets = findOnsets(buffer, clip);
  if (onsets.length < 5) return null;
  const totalWeight = onsets.reduce((total, onset) => total + onset.weight, 0);
  let best: { period: number; phase: number; score: number } | undefined;

  // Fold attacks onto candidate beat periods. Check for a consistent phase and
  // count occupied beats so half-empty subdivisions are less likely to win.
  for (let milliseconds = 250; milliseconds <= 1500; milliseconds++) {
    const period = milliseconds / 1000;
    const rate = 2 * Math.PI / period;
    let x = 0;
    let y = 0;
    for (const { time, weight } of onsets) {
      x += Math.cos(time * rate) * weight;
      y += Math.sin(time * rate) * weight;
    }
    const coherence = Math.hypot(x, y) / totalWeight;
    if (coherence < .47) continue;

    const phase = Math.atan2(y, x) / rate;
    const hits = new Set<number>();
    let matchedWeight = 0;
    for (const { time, weight } of onsets) {
      const beat = Math.round((time - phase) / period);
      if (Math.abs(time - (phase + beat * period)) > Math.min(.065, period * .13)) continue;
      hits.add(beat);
      matchedWeight += weight;
    }
    const firstBeat = Math.round((onsets[0].time - phase) / period);
    const lastBeat = Math.round((onsets[onsets.length - 1].time - phase) / period);
    const coverage = hits.size / (lastBeat - firstBeat + 1);
    if (hits.size < 5 || coverage < .65 || matchedWeight / totalWeight < .56) continue;
    const score = matchedWeight / totalWeight * .55 + coverage * .25 + coherence * .20;
    if (!best || score > best.score) best = { period, phase, score };
  }
  if (!best) return null;
  const tempo = Number((60 / best.period).toFixed(1));
  return { tempo, beatOffset: nextBeatDelay(0, tempo, clip.startAt + best.phase) };
}
