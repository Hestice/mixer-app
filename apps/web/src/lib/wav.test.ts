import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, encodeWavChannels } from './wav';

test('mono recording WAV stays compatible with existing saved takes', async () => {
  const bytes = await encodeWav(new Float32Array([-1, 0, 1]), 44_100).arrayBuffer();
  const view = new DataView(bytes);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 44_100);
  assert.equal(view.getUint32(40, true), 6);
  assert.deepEqual([44, 46, 48].map((offset) => view.getInt16(offset, true)), [-32768, 0, 32767]);
});
test('stereo WAV interleaves left and right and describes the correct byte rate and length', async () => {
  const bytes = await encodeWavChannels([new Float32Array([.5, -1]), new Float32Array([-.5, 1])], 48_000).arrayBuffer();
  const view = new DataView(bytes);
  assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint16(32, true), 4);
  assert.equal(view.getUint32(28, true), 192_000); assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getUint32(4, true), bytes.byteLength - 8);
  assert.deepEqual([44, 46, 48, 50].map((offset) => view.getInt16(offset, true)), [16384, -16384, -32768, 32767]);
});
test('WAV conversion bounds out-of-range samples and rejects mismatched channels', async () => {
  const view = new DataView(await encodeWav(new Float32Array([2, -2, NaN]), 48_000).arrayBuffer());
  assert.deepEqual([44, 46, 48].map((offset) => view.getInt16(offset, true)), [32767, -32768, 0]);
  assert.throws(() => encodeWavChannels([new Float32Array(1), new Float32Array(2)], 48_000));
});
