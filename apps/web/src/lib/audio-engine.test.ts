import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from './audio-engine';
import { tourBuildStage } from './story-motion';
import { demoLayers, extractPeaks, harmonyLayer, tourScene } from './session';

class FakeParam { value = 0; setTargetAtTime(value: number) { this.value = value; } }
class FakeNode { connect() {} disconnect() {} }
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeBuffer {
  numberOfChannels = 1; sampleRate = 100; length = 1143; duration = 11.43;
  getChannelData() { return new Float32Array(this.length); }
  copyToChannel() {}
}
class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null; loop = false; loopEnd = 0; stopped = false;
  started: number[] = [];
  start(when: number, offset: number) { this.started = [when, offset]; }
  stop() { this.stopped = true; }
}
class FakeContext {
  static current: FakeContext;
  currentTime = 0; state = 'running'; destination = new FakeNode();
  sources: FakeSource[] = []; gains: FakeGain[] = [];
  constructor() { FakeContext.current = this; }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createDynamicsCompressor() { return Object.assign(new FakeNode(), { threshold: new FakeParam(), ratio: new FakeParam() }); }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  createBuffer(_channels: number, length: number) { const buffer = new FakeBuffer(); buffer.length = length; return buffer; }
  async decodeAudioData() { return new FakeBuffer(); }
  async resume() {} async close() { this.state = 'closed'; }
}
const originalFetch = globalThis.fetch;
const originalContext = globalThis.AudioContext;
beforeEach(() => {
  globalThis.AudioContext = FakeContext as unknown as typeof AudioContext;
  globalThis.fetch = async () => new Response(new Uint8Array([0]));
});
afterEach(() => { globalThis.fetch = originalFetch; globalThis.AudioContext = originalContext; });

test('demo parts start together; a new candidate joins the existing musical position', async () => {
  const engine = new AudioEngine();
  await engine.loadDemo();
  await engine.play(demoLayers);
  const context = FakeContext.current;
  assert.equal(context.sources.length, 3);
  assert.deepEqual(context.sources.map((source) => source.started), [[.04, 0], [.04, 0], [.04, 0]]);
  context.currentTime = 2.04;
  engine.sync([...demoLayers, harmonyLayer]);
  assert.deepEqual(context.sources[3].started, [2.04, 2]);
  engine.sync([...demoLayers, harmonyLayer]);
  assert.equal(context.sources.length, 4, 'keeping or toggling the candidate must not double its audio');
  engine.dispose();
});

test('pausing preserves position; resetting removes all sounding sources and returns to the beginning', async () => {
  const engine = new AudioEngine();
  await engine.loadDemo(); await engine.play(demoLayers);
  FakeContext.current.currentTime = 3.04;
  engine.pause(); assert.equal(engine.position, 3);
  assert.ok(FakeContext.current.sources.every((source) => source.stopped));
  await engine.play(demoLayers); assert.equal(FakeContext.current.sources[3].started[1], 3);
  engine.reset(); assert.equal(engine.position, 0); assert.equal(engine.playing, false);
  engine.dispose();
});

test('waveform extraction preserves silence and normalizes recorded amplitude', () => {
  assert.deepEqual(extractPeaks(new Float32Array(8), 4), [0, 0, 0, 0]);
  assert.deepEqual(extractPeaks(new Float32Array([0, 0, 0.5, -0.5, 1, -1, 0, 0]), 4), [0, 0.5, 1, 0]);
});

test('muting a candidate changes its gain without restarting the composition', async () => {
  const engine = new AudioEngine();
  await engine.loadDemo(); await engine.play([...demoLayers, harmonyLayer]);
  const context = FakeContext.current;
  context.currentTime = 4.04;
  engine.sync([...demoLayers, { ...harmonyLayer, enabled: false }]);
  assert.equal(context.gains[4].gain.value, 0);
  assert.equal(context.gains[1].gain.value, demoLayers[0].volume);
  assert.equal(context.sources.length, 4);
  assert.ok(context.sources.every((source) => !source.stopped));
  assert.equal(engine.position, 4);
  engine.sync([...demoLayers, harmonyLayer]);
  assert.equal(context.gains[4].gain.value, harmonyLayer.volume);
  assert.equal(context.sources.length, 4);
  engine.dispose();
});

test('scene changes update sounding layers in both directions without restarting or duplicating audio', async () => {
  const sceneMix = (chapter: number) => {
    const scene = tourScene(chapter);
    return [...scene.layers, ...(scene.candidate ? [scene.candidate] : [])];
  };
  const engine = new AudioEngine();
  await engine.loadDemo(); await engine.play(sceneMix(0));
  const context = FakeContext.current;
  const guitar = context.sources[0];
  context.currentTime = 4.04;
  for (const chapter of [1, 2, 3, 4, 3, 2, 1, 0, 4, 0]) {
    engine.sync(sceneMix(chapter));
    const audible = context.sources.filter((source, index) => !source.stopped && context.gains[index + 1].gain.value > 0);
    assert.equal(audible.length, chapter < 2 ? 1 : chapter === 2 ? 3 : 4);
    assert.equal(guitar.stopped, false);
    assert.equal(engine.position, 4);
  }
  engine.pause();
  engine.sync(sceneMix(4));
  assert.equal(engine.playing, false, 'scrolling must not resume audio after an explicit pause');
  assert.ok(context.sources.every((source) => source.stopped));
  engine.dispose();
});


test('the build adds keys then rhythm, and removes them in reverse without restarting', async () => {
  const engine = new AudioEngine();
  await engine.loadDemo(); await engine.play(tourScene(1).layers);
  const context = FakeContext.current;
  context.currentTime = 3.04;
  for (const [progress, sounding] of [[.27, [true, false, false]], [.40, [true, true, false]], [.50, [true, true, true]], [.40, [true, true, false]], [.27, [true, false, false]]] as const) {
    engine.sync(tourScene(2, tourBuildStage(progress)).layers);
    assert.deepEqual(context.gains.slice(1).map((gain) => gain.gain.value > 0), sounding);
    assert.equal(engine.position, 3);
    assert.equal(context.sources.length, 3);
    assert.ok(context.sources.every((source) => !source.stopped));
  }
  engine.dispose();
});
