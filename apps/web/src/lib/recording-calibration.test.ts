import assert from 'node:assert/strict';
import test from 'node:test';
import { calibrationPulse, calibrationPulseOffsets, calibrationSetup, measureCalibration, readCalibration,
  sameCalibrationOutput } from './recording-calibration';

function simulatedMic(sampleRate: number, delays: number[], capturedLate = 0) {
  const pulse = calibrationPulse(sampleRate);
  let seed = 157;
  const signal = Float32Array.from({ length: Math.round(2.5 * sampleRate) }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 2 ** 32 - .5) * .01;
  });
  delays.forEach((delay, index) => {
    const offset = Math.round((calibrationPulseOffsets[index] + delay - capturedLate) * sampleRate);
    for (let frame = 1; frame < pulse.length; frame++) {
      // An inverted, filtered signal arriving through a quiet room with a short echo.
      signal[offset + frame] -= (pulse[frame] + .4 * pulse[frame - 1]) * .024;
      signal[offset + frame + 251] += pulse[frame] * .006;
    }
  });
  return signal;
}

test('the test tones measure a consistent late input despite noise, filtering and resampling', () => {
  for (const sampleRate of [44100, 48000]) {
    const delay = .146;
    const capturedLate = .008;
    const measured = measureCalibration(simulatedMic(sampleRate, [delay, delay, delay], capturedLate), sampleRate,
      calibrationPulseOffsets.map(pulse => pulse - capturedLate));
    assert.ok(measured !== null && Math.abs(measured - delay) < .002);
  }
});

test('silence, missing tones, and disagreeing delays fail calibration', () => {
  assert.equal(measureCalibration(new Float32Array(120_000), 48000), null);
  assert.equal(measureCalibration(simulatedMic(48000, [.15, .15]), 48000), null);
  assert.equal(measureCalibration(simulatedMic(48000, [.15, .25, .15]), 48000), null);
});

test('the profile identifies microphone and output when the browser exposes them', () => {
  const mic = { deviceId: 'mic', label: 'USB' };
  const context = { sampleRate: 48000, outputLatency: .11 };
  const speakers = [{ kind: 'audiooutput', deviceId: 'default', groupId: 'speakers', label: 'Default - Speakers' }] as const;
  const headphones = [{ kind: 'audiooutput', deviceId: 'default', groupId: 'headphones', label: 'Default - Headphones' }] as const;
  const setup = calibrationSetup(mic, context, headphones);
  assert.ok(setup.outputKnown);
  assert.notEqual(setup.key, calibrationSetup(mic, context, speakers).key);
  assert.notEqual(setup.key, calibrationSetup({ ...mic, deviceId: 'other' }, context, headphones).key);
  assert.equal(calibrationSetup(mic, context, []).outputKnown, false);
  assert.ok(sameCalibrationOutput(.1, .11));
  assert.equal(sameCalibrationOutput(.1, .01), false);
});

test('a profile round-trips in browser storage and rejects invalid calibration values', () => {
  const setup = calibrationSetup({ deviceId: 'mic', label: 'USB' }, { sampleRate: 48000 }, []);
  const profile = { delay: .146, outputLatency: null };
  const values = new Map([[setup.key, JSON.stringify(profile)]]);
  const store = { getItem: (key: string) => values.get(key) ?? null };
  assert.deepEqual(readCalibration(store, setup), profile);
  values.set(setup.key, '{"delay":99,"outputLatency":null}');
  assert.equal(readCalibration(store, setup), null);
});
