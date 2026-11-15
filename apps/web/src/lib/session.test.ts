import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitLayer, demoLayers, harmonyLayer, chapterFromProgress } from './session';

test('keeping a take preserves the mix and never duplicates the same candidate', () => {
  const original = structuredClone(demoLayers);
  const next = commitLayer(original, harmonyLayer);
  assert.equal(next.length, 4);
  assert.deepEqual(original, demoLayers);
  assert.deepEqual(next.slice(0, 3), original);
  assert.equal(commitLayer(next, harmonyLayer), next);
});

test('scrolling clamps to five chapters, including the end and overscroll', () => {
  assert.deepEqual([-1, 0, 0.21, 0.41, 0.61, 0.81, 1, 2].map(chapterFromProgress), [0, 0, 1, 2, 3, 4, 4, 4]);
});
