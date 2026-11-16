import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { encodeWav } from './wav';
import { Metronome, canSoundClick, metronomeBeatAt } from './metronome';

test('WAV download preserves microphone sample count, sample rate and silence', async () => {
  const blob = encodeWav(new Float32Array([0, .5, -.5, 1, -1]), 48000);
  const bytes = await blob.arrayBuffer();
  const view = new DataView(bytes);
  assert.equal(blob.type, 'audio/wav');
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint32(40, true), 10);
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => view.getInt16(44 + index * 2, true)), [0, 16384, -16384, 32767, -32768]);
});

test('microphone worklet starts on the scheduled frame and outputs silence', () => {
  let Processor: any;
  const messages: any[] = [];
  const scope = {
    currentFrame: 0, sampleRate: 100,
    AudioWorkletProcessor: class { port = { onmessage: null, postMessage: (message: any) => messages.push(message) }; },
    registerProcessor: (_name: string, value: any) => { Processor = value; },
  };
  runInNewContext(readFileSync(new URL('../../public/microphone-recorder.js', import.meta.url), 'utf8'), scope);
  const processor = new Processor();
  processor.port.onmessage({ data: { type: 'start', frame: 3 } });
  const output = new Float32Array(8).fill(1);
  processor.process([[new Float32Array([1, 1, 1, .25, .25, .25, .25, .25])]], [[output]]);
  processor.port.onmessage({ data: { type: 'stop' } });
  assert.deepEqual(Array.from(output), Array(8).fill(0), 'microphone monitoring must not feed the speakers');
  assert.deepEqual(Array.from(messages.find((message) => message.type === 'samples').samples), Array(5).fill(.25), 'count-in audio before the scheduled start is excluded');
  assert.equal(messages.at(-1).type, 'done');
  messages.length = 0;
  scope.currentFrame = 8;
  processor.process([[new Float32Array(8).fill(.5)]], [[output]]);
  assert.equal(messages.some((message) => message.type === 'samples'), false, 'stopped capture cannot add more audio');
});

test('canceling a count-in discards it and a new take begins with an empty buffer', () => {
  let Processor: any;
  const messages: any[] = [];
  const scope = { currentFrame: 0, sampleRate: 100, AudioWorkletProcessor: class { port = { onmessage: null, postMessage: (message: any) => messages.push(message) }; }, registerProcessor: (_: string, value: any) => { Processor = value; } };
  runInNewContext(readFileSync(new URL('../../public/microphone-recorder.js', import.meta.url), 'utf8'), scope);
  const processor = new Processor();
  processor.port.onmessage({ data: { type: 'start', frame: 100 } });
  processor.process([[new Float32Array(8).fill(1)]], [[new Float32Array(8)]]);
  processor.port.onmessage({ data: { type: 'cancel' } });
  scope.currentFrame = 8;
  processor.port.onmessage({ data: { type: 'start', frame: 8 } });
  processor.process([[new Float32Array(8).fill(.5)]], [[new Float32Array(8)]]);
  processor.port.onmessage({ data: { type: 'stop' } });
  assert.deepEqual(Array.from(messages.find((message) => message.type === 'samples').samples), Array(8).fill(.5));
});

test('visual beats start on the audio clock and advance across measures', () => {
  assert.equal(metronomeBeatAt(.99, 1, .5), -1);
  assert.equal(metronomeBeatAt(1, 1, .5), 0);
  assert.equal(metronomeBeatAt(1.49, 1, .5), 0);
  assert.equal(metronomeBeatAt(1.5, 1, .5), 1);
  assert.equal(metronomeBeatAt(3, 1, .5), 4);
  assert.equal(metronomeBeatAt(5.25, 1, .5), 8);
});

test('clicks are silent without explicit headphone confirmation and route only to output', () => {
  assert.equal(canSoundClick('sound', false), false);
  assert.equal(canSoundClick('visual', true), false);
  assert.equal(canSoundClick('off', true), false);
  assert.equal(canSoundClick('sound', true), true);
  const connections: unknown[] = [];
  const oscillators: any[] = [];
  const destination = {};
  const context = {
    currentTime: 0, destination,
    createOscillator() { const node = { frequency: { value: 0 }, onended: null, start: () => {}, stop: () => {}, disconnect: () => {}, connect: (target: unknown) => connections.push(target) }; oscillators.push(node); return node; },
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, disconnect() {}, connect: (target: unknown) => connections.push(target) }; },
  };
  const metronome = new Metronome(context as unknown as AudioContext);
  metronome.start(.01, 84, false);
  assert.equal(oscillators.length, 0);
  metronome.start(.01, 84, true);
  assert.equal(oscillators.length, 1);
  assert.equal(connections.at(-1), destination, 'clicks connect directly to listening output, never a recording destination');
  metronome.stop();
});
