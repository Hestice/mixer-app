import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { encodeWav } from './wav';
import { MicrophoneRecorder } from './microphone-recorder';
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
  processor.port.onmessage({ data: { type: 'start', takeId: 1, frame: 3 } });
  const output = new Float32Array(8).fill(1);
  processor.process([[new Float32Array([1, 1, 1, .25, .25, .25, .25, .25])]], [[output]]);
  processor.port.onmessage({ data: { type: 'stop' } });
  assert.deepEqual(Array.from(output), Array(8).fill(0), 'microphone monitoring must not feed the speakers');
  assert.deepEqual(Array.from(messages.find((message) => message.type === 'samples').samples), Array(5).fill(.25), 'count-in audio before the scheduled start is excluded');
  assert.equal(messages.at(-1).type, 'done');
  assert.equal(messages.at(-1).takeId, 1);
  assert.equal(messages.at(-1).firstFrame, 3);
  messages.length = 0;
  scope.currentFrame = 8;
  processor.process([[new Float32Array(8).fill(.5)]], [[output]]);
  assert.equal(messages.some((message) => message.type === 'samples'), false, 'stopped capture cannot add more audio');
});

test('calibration auto-stops on its scheduled end frame without a UI timer', () => {
  let Processor: any;
  const messages: any[] = [];
  const scope = {
    currentFrame: 128, sampleRate: 48000,
    AudioWorkletProcessor: class { port = { onmessage: null, postMessage: (message: any) => messages.push(message) }; },
    registerProcessor: (_: string, value: any) => { Processor = value; },
  };
  runInNewContext(readFileSync(new URL('../../public/microphone-recorder.js', import.meta.url), 'utf8'), scope);
  const processor = new Processor();
  processor.port.onmessage({ data: { type: 'start', takeId: 1, frame: 127, endFrame: 132 } });
  processor.process([[new Float32Array([.1, .2, .3, .4, .5])]], [[new Float32Array(5)]]);
  assert.equal(messages[0].samples.length, 4);
  assert.equal(messages[1].type, 'done');
  assert.equal(messages[1].firstFrame, 128, 'use the actual capture start if the message arrived late');
});

test('canceling a count-in discards it and a new take begins with an empty buffer', () => {
  let Processor: any;
  const messages: any[] = [];
  const scope = { currentFrame: 0, sampleRate: 100, AudioWorkletProcessor: class { port = { onmessage: null, postMessage: (message: any) => messages.push(message) }; }, registerProcessor: (_: string, value: any) => { Processor = value; } };
  runInNewContext(readFileSync(new URL('../../public/microphone-recorder.js', import.meta.url), 'utf8'), scope);
  const processor = new Processor();
  processor.port.onmessage({ data: { type: 'start', takeId: 1, frame: 100 } });
  processor.process([[new Float32Array(8).fill(1)]], [[new Float32Array(8)]]);
  processor.port.onmessage({ data: { type: 'cancel' } });
  scope.currentFrame = 8;
  processor.port.onmessage({ data: { type: 'start', takeId: 2, frame: 8 } });
  processor.process([[new Float32Array(8).fill(.5)]], [[new Float32Array(8)]]);
  processor.port.onmessage({ data: { type: 'stop' } });
  assert.deepEqual(Array.from(messages.find((message) => message.type === 'samples').samples), Array(8).fill(.5));
});

test('a connected microphone can record again and ignores late messages from canceled takes', async () => {
  type Message = { type: string; takeId?: number; endFrame?: number; firstFrame?: number; value?: number; samples?: Float32Array };
  const messages: Message[] = [];
  const port = {
    onmessage: null as ((event: { data: Message }) => void) | null,
    postMessage: (message: Message) => messages.push(message),
    close() {},
  };
  let stoppedTracks = 0;
  const track = { onended: null, stop: () => stoppedTracks++ };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const context = {
    audioWorklet: { addModule: async () => {} },
    sampleRate: 48000, currentTime: 0,
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    destination: {},
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioWorkletNode');
  Object.defineProperty(globalThis, 'AudioWorkletNode', {
    configurable: true,
    value: class AudioWorkletNode { port = port; connect() {} disconnect() {} },
  });

  try {
    const recorder = await MicrophoneRecorder.open(context as unknown as AudioContext, stream as unknown as MediaStream, () => {}, () => {});
    const deliver = (data: Message) => port.onmessage!({ data });
    const calibration = recorder.capture(.1, .2);
    assert.equal(messages.at(-1)?.endFrame, 9600);
    deliver({ type: 'samples', takeId: 1, samples: new Float32Array([.125]) });
    deliver({ type: 'done', takeId: 1, firstFrame: 4800 });
    assert.deepEqual(await calibration, { samples: new Float32Array([.125]), firstFrame: 4800 });
    recorder.start(1);
    const first = recorder.stop();
    deliver({ type: 'samples', takeId: 2, samples: new Float32Array([.25]) });
    deliver({ type: 'done', takeId: 2 });
    assert.deepEqual(Array.from(await first), [.25]);
    assert.equal(stoppedTracks, 0);

    recorder.start(2);
    recorder.cancel();
    recorder.start(3);
    const retake = recorder.stop();
    deliver({ type: 'samples', takeId: 3, samples: new Float32Array([1]) });
    deliver({ type: 'done', takeId: 3 });
    deliver({ type: 'samples', takeId: 4, samples: new Float32Array([-.5]) });
    deliver({ type: 'done', takeId: 4 });
    assert.deepEqual(Array.from(await retake), [-.5]);
    assert.deepEqual(messages.filter(message => message.type === 'start').map(message => message.takeId), [1, 2, 3, 4]);
    assert.equal(stoppedTracks, 0);
    recorder.dispose();
    assert.equal(stoppedTracks, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'AudioWorkletNode', original);
    else Reflect.deleteProperty(globalThis, 'AudioWorkletNode');
  }
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
