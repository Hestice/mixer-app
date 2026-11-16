import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { exportSong, EXPORT_SAMPLE_RATE, songFilename } from './song-export';
import { demoLayers, type Layer } from './session';

class Node {
  targets: Node[] = [];
  connect(node: Node) { this.targets.push(node); }
}
class Gain extends Node { gain = { value: 1 }; }
class Source extends Node {
  buffer: { duration: number } | null = null;
  started: number[] = [];
  start(...args: number[]) { this.started = args; }
}
class Context {
  static instances: Context[] = [];
  destination = new Node(); gains: Gain[] = []; sources: Source[] = [];
  compressor = Object.assign(new Node(), { threshold: { value: -24 }, ratio: { value: 12 } });
  decoded: number[] = [];
  constructor(public channels: number, public length: number, public sampleRate: number) { Context.instances.push(this); }
  async decodeAudioData(bytes: ArrayBuffer) { const duration = new Uint8Array(bytes)[0]; this.decoded.push(duration); return { duration }; }
  createGain() { const gain = new Gain(); this.gains.push(gain); return gain; }
  createDynamicsCompressor() { return this.compressor; }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  async startRendering() { return { getChannelData: () => new Float32Array(this.length) }; }
}
const originalContext = globalThis.OfflineAudioContext;
const originalFetch = globalThis.fetch;
const recording = (overrides: Partial<Layer> = {}): Layer => ({ id: 'guitar', name: 'Guitar', kind: 'recording', recorded: true, enabled: true, volume: .8, duration: 10, blob: new Blob([new Uint8Array([10])]), ...overrides });
beforeEach(() => { Context.instances = []; globalThis.OfflineAudioContext = Context as unknown as typeof OfflineAudioContext; });
afterEach(() => { globalThis.OfflineAudioContext = originalContext; globalThis.fetch = originalFetch; });

test('exports the selected take, its trim and placement, track gains and song gain through the playback output stage', async () => {
  const blob = await exportSong([recording({ takeId: 'chosen', takes: [
    { id: 'old', duration: 10, blob: new Blob([new Uint8Array([10])]) },
    { id: 'chosen', duration: 8, blob: new Blob([new Uint8Array([8])]), trimStart: 2, trimEnd: 5, startAt: 1 },
  ] }), recording({ id: 'voice', volume: .25, trimStart: 3, trimEnd: 5, startAt: 2 })], .4);
  const [decoder, renderer] = Context.instances;
  assert.deepEqual(decoder.decoded, [8, 10], 'never decode an unselected alternative');
  assert.deepEqual(renderer.sources.map((source) => source.started), [[1, 2, 3], [2, 3, 2]]);
  assert.deepEqual(renderer.gains.map((gain) => gain.gain.value), [.4, .8, .25]);
  assert.equal(renderer.compressor.threshold.value, -8); assert.equal(renderer.compressor.ratio.value, 8);
  assert.equal(renderer.gains[0].targets[0], renderer.compressor);
  assert.equal(renderer.compressor.targets[0], renderer.destination);
  assert.equal(renderer.length, 4 * EXPORT_SAMPLE_RATE + 288, 'allow the compressor delay to finish');
  assert.equal(blob.size, 44 + 4 * EXPORT_SAMPLE_RATE * 4, 'remove output latency without truncating the song');
});
test('muted and zero-volume layers stay silent without needing their audio, while preserving the song duration', async () => {
  await exportSong([recording({ trimEnd: 1 }), recording({ id: 'mute', enabled: false, blob: undefined, duration: 3 }), recording({ id: 'quiet', volume: 0, blob: undefined, duration: 2 })], 1);
  assert.equal(Context.instances[1].sources.length, 1);
  assert.equal(Context.instances[1].length, 3 * EXPORT_SAMPLE_RATE + 288);
});
test('missing audio fails the whole export instead of silently leaving a layer out', async () => {
  await assert.rejects(exportSong([recording({ blob: undefined })], 1), /recording.*missing/);
});
test('empty or entirely muted songs return actionable errors', async () => {
  await assert.rejects(exportSong([], 1), /Keep a layer/);
  await assert.rejects(exportSong([recording({ enabled: false })], 1), /silent/);
  await assert.rejects(exportSong([recording()], 0), /silent/);
  assert.equal(Context.instances.length, 0);
});
test('demo audio can be mixed alongside recordings and reports network failure', async () => {
  globalThis.fetch = async (url) => { assert.equal(url, '/audio/keys.wav'); return new Response(new Uint8Array([4])); };
  await exportSong([recording({ id: 'keys', recorded: false, kind: 'keys', trimEnd: 2, startAt: 1 }), recording({ trimEnd: 2 })], .5);
  assert.deepEqual(Context.instances[0].decoded, [4, 10]);
  globalThis.fetch = async () => new Response('', { status: 503 });
  await assert.rejects(exportSong([recording({ recorded: false })], 1), /demo layer could not load/);
});
test('export keeps the guitar version used in each saved song', async () => {
  const fetched: string[] = [];
  globalThis.fetch = async url => { fetched.push(String(url)); return new Response(new Uint8Array([11])); };
  const guitar = demoLayers[0];
  await exportSong([guitar], .65);
  await exportSong([{ ...guitar, demoStem: undefined }], .65);
  assert.deepEqual(fetched, ['/audio/guitar-live.wav', '/audio/guitar.wav']);
});

test('download filenames preserve song names and remove path characters', () => {
  assert.equal(songFilename('  After hours · my version  '), 'After hours · my version.wav');
  assert.equal(songFilename('../My: song?'), '..-My- song-.wav');
  assert.equal(songFilename('...'), 'Untitled song.wav');
});
