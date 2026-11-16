import { OUTPUT_DELAY } from './audio-output';
import type { MicrophoneRecorder } from './microphone-recorder';

export const calibrationPulseOffsets = [.15, .91, 1.69] as const;
const maxDelay = .65;
const pulseDuration = .035;
const tolerance = .018;
const profilePrefix = 'listening-room:recording-calibration:';

export function calibrationPulse(sampleRate: number) {
  return Float32Array.from({ length: Math.round(sampleRate * pulseDuration) }, (_, frame) => {
    const time = frame / sampleRate;
    const phase = 2 * Math.PI * (700 * time + 1100 * time * time / pulseDuration);
    return Math.sin(phase) * Math.sin(Math.PI * time / pulseDuration) ** 2;
  });
}

function downsample(samples: Float32Array, step: number) {
  return Float32Array.from({ length: Math.floor(samples.length / step) }, (_, index) => {
    let sum = 0;
    for (let offset = 0; offset < step; offset++) sum += samples[index * step + offset];
    return sum / step;
  });
}

/** Find the same test tone at each scheduled beat and require a repeatable delay. */
export function measureCalibration(
  samples: Float32Array, sampleRate: number, scheduledPulses: readonly number[] = calibrationPulseOffsets,
): number | null {
  const step = Math.max(1, Math.round(sampleRate / 8000));
  const rate = sampleRate / step;
  const reference = downsample(calibrationPulse(sampleRate), step);
  const input = downsample(samples, step);
  const referenceEnergy = reference.reduce((sum, value) => sum + value * value, 0);
  const delays: number[] = [];

  for (const pulse of scheduledPulses) {
    const first = Math.max(0, Math.floor(pulse * rate));
    const last = Math.min(input.length - reference.length, Math.ceil((pulse + maxDelay) * rate));
    let bestScore = .33;
    let bestOffset = -1;
    for (let offset = first; offset <= last; offset++) {
      let dot = 0;
      let energy = 0;
      for (let frame = 0; frame < reference.length; frame++) {
        const sample = input[offset + frame];
        dot += sample * reference[frame];
        energy += sample * sample;
      }
      if (energy < reference.length * .0007 ** 2) continue;
      const score = Math.abs(dot) / Math.sqrt(energy * referenceEnergy);
      if (score > bestScore) {
        bestScore = score;
        bestOffset = offset;
      }
    }
    if (bestOffset < 0) return null;
    delays.push(Math.max(0, bestOffset / rate - pulse));
  }

  delays.sort((a, b) => a - b);
  if (delays.at(-1)! - delays[0] > tolerance) return null;
  return delays[Math.floor(delays.length / 2)];
}

export async function calibrateRecording(context: AudioContext, recorder: MicrophoneRecorder) {
  const pulse = calibrationPulse(context.sampleRate);
  const buffer = context.createBuffer(1, pulse.length, context.sampleRate);
  buffer.copyToChannel(pulse, 0);
  const output = context.createGain();
  output.gain.value = .3;
  output.connect(context.destination);
  const sources: AudioBufferSourceNode[] = [];

  try {
    const when = context.currentTime + .15;
    const until = when + calibrationPulseOffsets[calibrationPulseOffsets.length - 1] + maxDelay + pulseDuration + .04;
    for (const offset of calibrationPulseOffsets) {
      const source = context.createBufferSource();
      sources.push(source);
      source.buffer = buffer;
      source.connect(output);
      source.start(when + offset);
    }
    const { samples, firstFrame } = await recorder.capture(when, until);
    if (firstFrame === null) return null;
    const scheduledPulses = calibrationPulseOffsets.map(offset => when + offset - firstFrame / context.sampleRate);
    const measured = measureCalibration(samples, context.sampleRate, scheduledPulses);
    // Calibration tones bypass the mix limiter. Backing audio and the click are both 6 ms later.
    return measured === null ? null : measured + OUTPUT_DELAY;
  } finally {
    for (const source of sources) { source.stop(); source.disconnect(); }
    output.disconnect();
  }
}

type Device = Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'groupId' | 'label'>;
type Output = { sampleRate: number; outputLatency?: number; sinkId?: unknown };
export type CalibrationSetup = { key: string; outputLatency: number | null; outputKnown: boolean };
export type CalibrationProfile = { delay: number; outputLatency: number | null };

export function calibrationSetup(input: { deviceId?: string; label: string }, output: Output, devices: readonly Device[]): CalibrationSetup {
  const microphone = input.deviceId && input.deviceId !== 'default' ? input.deviceId : input.label;
  const sinks = devices.filter(device => device.kind === 'audiooutput');
  const systemOutput = sinks.find(device => device.deviceId === 'default');
  const actualOutput = systemOutput?.groupId
    ? sinks.find(device => device.deviceId !== 'default' && device.groupId === systemOutput.groupId)
    : undefined;
  const outputId = typeof output.sinkId === 'string' && output.sinkId && output.sinkId !== 'default' ? output.sinkId
    : actualOutput?.deviceId || systemOutput?.label || systemOutput?.groupId || '';
  const outputLatency = typeof output.outputLatency === 'number' && Number.isFinite(output.outputLatency) && output.outputLatency >= 0
    ? output.outputLatency : null;
  return { key: profilePrefix + JSON.stringify([microphone, outputId, output.sampleRate]), outputLatency, outputKnown: !!outputId };
}

export function sameCalibrationOutput(previous: number | null, current: number | null) {
  return previous === null || current === null || Math.abs(previous - current) < .04;
}

export function readCalibration(store: Pick<Storage, 'getItem'>, setup: CalibrationSetup): CalibrationProfile | null {
  try {
    const profile = JSON.parse(store.getItem(setup.key) ?? 'null');
    if (profile && Number.isFinite(profile.delay) && profile.delay >= 0 && profile.delay <= maxDelay + OUTPUT_DELAY
      && (profile.outputLatency === null || (Number.isFinite(profile.outputLatency) && profile.outputLatency >= 0))) return profile;
  } catch {
    // Storage can be unavailable in private browsing or contain an older value.
  }
  return null;
}
