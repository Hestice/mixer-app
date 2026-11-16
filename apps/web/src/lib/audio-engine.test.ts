import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from './audio-engine';
import { tourBuildStage } from './story-motion';
import { demoLayers, extractPeaks, harmonyLayer, tourScene } from './session';

class FakeParam {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
}
class FakeNode { connect() {} disconnect() {} }
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeBuffer {
  private channels: Float32Array[];
  constructor(public numberOfChannels = 1, public length = 1143, public sampleRate = 100) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() { return this.length / this.sampleRate; }
  getChannelData(channel: number) { return this.channels[channel]; }
  copyToChannel(samples: Float32Array, channel: number) { this.channels[channel].set(samples); }
}
class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null; loop = false; loopEnd = 0; stopped = false;
  onended: (() => void) | null = null;
  started: number[] = []; playDuration?: number;
  start(when: number, offset: number, duration?: number) { this.started = [when, offset]; this.playDuration = duration; }
  stop() { this.stopped = true; }
}
class FakeContext {
  static current: FakeContext;
  currentTime = 0; state = 'running'; sampleRate = 1000; destination = new FakeNode();
  sources: FakeSource[] = []; gains: FakeGain[] = [];
  constructor() { FakeContext.current = this; }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createDynamicsCompressor() { return Object.assign(new FakeNode(), { threshold: new FakeParam(), ratio: new FakeParam() }); }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  createBuffer(channels: number, length: number, sampleRate: number) { return new FakeBuffer(channels, length, sampleRate); }
  async decodeAudioData() { return new FakeBuffer(); }
  async resume() {} async close() { this.state = 'closed'; }
}
const originalFetch = globalThis.fetch;
const originalContext = globalThis.AudioContext;
beforeEach(() => {
  globalThis.AudioContext = FakeContext as unknown as typeof AudioContext;
  globalThis.fetch = async () => new Response(new Uint8Array([0]));
});

test('free recordings retain their full lengths and never repeat or truncate shorter parts', async () => {
  const engine = new AudioEngine();
  await engine.ready();
  engine.addSamples('short', new Float32Array(200), 100);
  engine.addSamples('long', new Float32Array(700), 100);
  const layers = [
    { id: 'short', name: 'Guitar', kind: 'recording' as const, enabled: true, volume: 1, duration: 2 },
    { id: 'long', name: 'Vocals', kind: 'recording' as const, enabled: true, volume: 1, duration: 7 },
  ];
  engine.configureSession(layers);
  await engine.play(layers);
  const context = FakeContext.current;
  assert.equal(engine.duration, 7);
  assert.deepEqual(context.sources.map((source) => source.buffer?.length), [200, 700]);
  assert.ok(context.sources.every((source) => !source.loop));
  context.currentTime = 5.04;
  assert.equal(engine.position, 5);
  engine.pause();
  await engine.play(layers);
  assert.equal(context.sources.length, 3, 'resuming after the short part ends must not restart it');
  assert.equal(context.sources[2].started[1], 5);
  engine.dispose();
});

test('repeated play requests replace the active mix and pause stops every source', async () => {
  const engine = new AudioEngine();
  await engine.loadDemo();
  engine.configureSession(demoLayers, 2);
  await Promise.all([engine.play(demoLayers), engine.play(demoLayers), engine.play(demoLayers)]);
  const context = FakeContext.current;
  assert.equal(context.sources.filter(source => !source.stopped).length, demoLayers.length);

  context.currentTime = 1.04;
  engine.pause();
  assert.equal(engine.position, 3);
  assert.ok(context.sources.every(source => source.stopped));

  await engine.play(demoLayers);
  const resumed = context.sources.filter(source => !source.stopped);
  assert.deepEqual(resumed.map(source => source.started[1]), [3, 3, 3]);
  engine.dispose();
});

test('overdubbing schedules all backing layers at the microphone capture time', async () => {
  const engine = new AudioEngine();
  await engine.loadDemo();
  engine.configureSession(demoLayers);
  engine.playAt(demoLayers, 3.12);
  assert.deepEqual(FakeContext.current.sources.map((source) => source.started), [[3.12, 0], [3.12, 0], [3.12, 0]]);
  assert.ok(FakeContext.current.sources.every((source) => !source.loop));
  engine.dispose();
});

test('free playback stops at the song end and replay cleans up ended sources', async () => {
  const engine = new AudioEngine();
  await engine.ready();
  engine.addSamples('take', new Float32Array(300), 100);
  const layers = [{ id: 'take', name: 'Take', kind: 'recording' as const, enabled: true, volume: 1, duration: 3 }];
  engine.configureSession(layers);
  await engine.play(layers);
  const context = FakeContext.current;
  const first = context.sources[0];
  context.currentTime = 3.04;
  first.onended?.();
  assert.equal(engine.playing, false);
  assert.equal(engine.position, 3);
  await engine.play(layers);
  assert.equal(first.stopped, true);
  assert.equal(context.sources[1].started[1], 0);
  first.onended?.();
  assert.equal(engine.playing, true, 'a stale completion cannot stop the new playback');
  engine.dispose();
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


test('trimmed layers schedule at their own start, then resume inside the chosen section', async () => {
  const engine = new AudioEngine(); await engine.ready();
  engine.addSamples('edited', new Float32Array(1000), 100);
  const layers = [{ id: 'edited', name: 'Voice', kind: 'recording' as const, enabled: true, volume: 1, duration: 10, trimStart: 2, trimEnd: 7, startAt: 4 }];
  engine.configureSession(layers); await engine.play(layers);
  const context = FakeContext.current;
  assert.equal(engine.duration, 9);
  assert.deepEqual(context.sources[0].started, [4.04, 2]); assert.equal(context.sources[0].playDuration, 5);
  context.currentTime = 6.04; engine.pause(); await engine.play(layers);
  assert.deepEqual(context.sources[1].started, [6.08, 4]); assert.equal(context.sources[1].playDuration, 3);
  context.currentTime = 9.08; context.sources[1].onended?.(); assert.equal(engine.playing, false);
  engine.dispose();
});
test('auditioning from before an offset layer starts skips earlier parts without changing the arrangement', async () => {
  const engine = new AudioEngine(); await engine.ready(); engine.addSamples('late', new Float32Array(500), 100);
  const layers = [{ id: 'late', name: 'Late', kind: 'recording' as const, enabled: true, volume: 1, duration: 5, trimStart: 1, trimEnd: 3, startAt: 20 }];
  engine.configureSession(layers); await engine.play(layers, true, 19);
  assert.deepEqual(FakeContext.current.sources[0].started, [1.04, 1]);
  assert.equal(FakeContext.current.sources[0].playDuration, 2); assert.equal(engine.position, 18.96);
  engine.dispose();
});


test('seeking while paused keeps silence and playback resumes inside every trimmed layer on the shared clock', async () => {
  const engine = new AudioEngine(); await engine.ready();
  engine.addSamples('a',new Float32Array(1000),100); engine.addSamples('b',new Float32Array(1000),100);
  const layers = [{id:'a',name:'A',kind:'recording' as const,enabled:true,volume:1,duration:10,trimStart:2,trimEnd:8,startAt:1}, {id:'b',name:'B',kind:'recording' as const,enabled:true,volume:1,duration:10,trimStart:1,trimEnd:8,startAt:3}];
  engine.configureSession(layers); engine.seek(layers,4);
  assert.equal(engine.position,4); assert.equal(engine.playing,false); assert.equal(FakeContext.current.sources.length,0);
  await engine.play(layers);
  assert.deepEqual(FakeContext.current.sources.map(source=>source.started),[[.04,5],[.04,2]]);
  engine.seek(layers,5); engine.seek(layers,6);
  assert.equal(engine.playing,true,'continuous scrubbing must not accidentally pause');
  assert.deepEqual(FakeContext.current.sources.slice(-2).map(source=>source.started),[[.04,7],[.04,4]]);
  engine.pause(); engine.configureSession(layers,6); assert.equal(engine.position,6);
  engine.dispose();
});
test('recording from a nonzero cursor schedules delayed and already-running backing parts relative to that cursor', async () => {
  const engine = new AudioEngine(); await engine.ready();
  engine.addSamples('a',new Float32Array(1000),100); engine.addSamples('b',new Float32Array(1000),100);
  const layers = [{id:'a',name:'A',kind:'recording' as const,enabled:true,volume:1,duration:10,trimStart:2,trimEnd:7,startAt:1}, {id:'b',name:'B',kind:'recording' as const,enabled:true,volume:1,duration:10,trimStart:1,trimEnd:4,startAt:5}];
  engine.configureSession(layers,3); engine.playAt(layers,10,3);
  assert.deepEqual(FakeContext.current.sources.map(source=>source.started),[[10,4],[12,1]]);
  assert.deepEqual(FakeContext.current.sources.map(source=>source.playDuration),[3,3]);
  FakeContext.current.currentTime=11; assert.equal(engine.position,4);
  engine.dispose();
});


test('a recording read failure identifies the layer and retains the browser error as its cause', async () => {
  const engine=new AudioEngine();const broken=new Blob(['audio']);
  const cause=new DOMException('The object can not be found here.','NotFoundError');
  Object.defineProperty(broken,'arrayBuffer',{value:async()=>{throw cause;}});
  await assert.rejects(engine.addRecording('voice',broken,'Lead vocals'),error=>error instanceof Error && error.message.includes('Lead vocals') && error.message.includes('NotFoundError') && error.cause===cause);
  assert.equal(engine.playing,false);engine.dispose();
});


test('a playing scrub pitches the audible trimmed mix in the drag direction and resumes once at release', async () => {
  const engine = new AudioEngine();
  await engine.ready();
  engine.addSamples('take', Float32Array.from({ length: 4000 }, (_, index) => index / 4000), 1000);
  engine.addSamples('muted', new Float32Array(4000).fill(1), 1000);
  const layers = [
    { id: 'take', name: 'Guitar', kind: 'recording' as const, enabled: true, volume: .5, duration: 4, trimStart: 1, trimEnd: 3, startAt: .5 },
    { id: 'muted', name: 'Voice', kind: 'recording' as const, enabled: false, volume: 1, duration: 4 },
  ];
  engine.configureSession(layers);
  assert.equal(engine.beginScrub(), false, 'a paused drag must stay quiet');
  await engine.play(layers);
  const context = FakeContext.current;
  context.currentTime = 1.54;
  assert.equal(engine.beginScrub(), true);
  assert.ok(context.sources.every(source => source.stopped));
  assert.equal(engine.position, 1.5);
  assert.equal(engine.playbackClock, null);
  assert.equal(engine.beginScrub(), false, 'only one pointer gesture can hold the transport');
  engine.scrubTo(layers, 1.6, false);
  assert.equal(context.sources.length, 2, 'a click on the ruler must stay quiet');
  engine.scrubTo(layers, 1.2, true);
  const reverse = context.sources.at(-1)!.buffer!.getChannelData(0);
  assert.ok(reverse[20] > reverse[40], 'a backward drag reads samples in reverse');
  const fastRate = (reverse[20] - reverse[40]) / (.75 * 20 * .5 / 4000);
  assert.ok(Math.abs(fastRate - 1.7) < .001, 'fast scrubbing limits how far pitch rises');
  assert.ok(reverse[30] > .2 && reverse[30] < .25, 'the sample follows the trim, placement and layer volume without the muted track');
  assert.equal(reverse[0], 0);
  assert.ok(Math.abs(reverse.at(-1)!) < .001);
  context.currentTime += .04;
  engine.scrubTo(layers, 1.4, true);
  const forward = context.sources.at(-1)!.buffer!.getChannelData(1);
  assert.ok(forward[20] < forward[40], 'dragging the other way changes direction');
  context.currentTime += .5;
  assert.equal(engine.position, 1.4, 'the cursor holds still while the pointer is held');
  engine.sync(layers);
  assert.equal(context.sources.length, 4, 'a mix update must not start normal playback during a scrub');

  assert.equal(engine.endScrub(layers), true);
  assert.equal(engine.endScrub(layers), false);
  assert.equal(engine.playing, true);
  const resumed = context.sources.filter(source => !source.stopped);
  assert.equal(resumed.length, 2);
  assert.equal(resumed[0].started[1], 1.9);
  assert.equal(resumed[1].started[1], 1.4);
  engine.dispose();
});

test('stopping during a scratch cancels it and an ensuing release cannot restart playback', async () => {
  const engine = new AudioEngine();
  await engine.loadDemo();
  engine.configureSession(demoLayers, 2);
  await engine.play(demoLayers);
  const context = FakeContext.current;
  assert.equal(engine.beginScrub(), true);
  engine.scrubTo(demoLayers, 1.5, true);
  assert.equal(context.sources.length, 4);
  engine.reset();
  assert.ok(context.sources.every(source => source.stopped));
  assert.equal(engine.endScrub(demoLayers), false);
  assert.equal(engine.position, 0);
  assert.equal(engine.playing, false);
  engine.dispose();
});


for (const direction of [1, -1]) {
  test(`a steady ${direction === 1 ? 'forward' : 'reverse'} jog plays at original pitch across overlapping samples`, async () => {
    const engine = new AudioEngine();
    await engine.ready();
    const audio = Float32Array.from({ length: 4000 }, (_, frame) => Math.sin(frame * .71));
    engine.addSamples('take', audio, 1000);
    const layers = [{ id: 'take', name: 'Guitar', kind: 'recording' as const, enabled: true, volume: 1, duration: 4 }];
    engine.configureSession(layers);
    await engine.play(layers);
    const context = FakeContext.current;
    context.currentTime = 1.54;
    assert.equal(engine.beginScrub(.15), true);
    engine.scrubTo(layers, 1.5 + direction * .15, true);
    const first = context.sources.at(-1)!;
    context.currentTime += .031;
    engine.scrubTo(layers, 1.5 + direction * .182, true);
    const second = context.sources.at(-1)!;
    assert.notEqual(first, second);
    assert.ok(Math.abs(second.started[0] - first.started[0] - .03) < .000001);

    const firstSamples = first.buffer!.getChannelData(0);
    const secondSamples = second.buffer!.getChannelData(0);
    const firstOverlapFrame = 1500 + direction * 170;
    for (let frame = 0; frame < 30; frame++) {
      const overlapped = firstSamples[30 + frame] + secondSamples[frame];
      assert.ok(Math.abs(overlapped - audio[firstOverlapFrame + direction * frame]) < .00001,
        'continuous motion should reproduce the source without a pitch shift or volume flutter');
    }
    engine.dispose();
  });
}
