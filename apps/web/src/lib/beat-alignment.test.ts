import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateBeatAlignment } from './beat-alignment';
import { nextBeatDelay } from './metronome';

function signal(attacks: number[], duration: number) {
  const sampleRate = 8000;
  const samples = new Float32Array(sampleRate * duration);
  for (const attack of attacks) {
    const start = Math.round(attack * sampleRate);
    for (let i = 0; i < .07 * sampleRate && start + i < samples.length; i++) {
      samples[start + i] += .65 * Math.sin(i * .14) * Math.exp(-i / 125);
    }
  }
  return { sampleRate, length: samples.length, numberOfChannels: 1, getChannelData: () => samples };
}

test('alignment detects tempo and phase, accounting for clip trims and song position', () => {
  const tempo = 113;
  const attacks = Array.from({ length: 29 }, (_, index) => 1.37 + index * 60 / tempo);
  const alignment = estimateBeatAlignment(signal(attacks, 18), { trimStart: 1.1, trimEnd: 17, startAt: 2.4 });
  assert.ok(alignment);
  assert.ok(Math.abs(alignment.tempo - tempo) < .5);
  const first = 2.4 + attacks[0] - 1.1;
  assert.ok(Math.abs(nextBeatDelay(first - .1, alignment.tempo, alignment.beatOffset) - .1) < .025);
});

test('silence and irregular attacks do not replace a beat grid', () => {
  const clip = { trimStart: 0, trimEnd: 12, startAt: 0 };
  assert.equal(estimateBeatAlignment(signal([], 12), clip), null);
  assert.equal(estimateBeatAlignment(signal([.21, 1.27, 2.93, 4.53, 4.89, 7.4, 9.91, 11.61], 12), clip), null);
});
