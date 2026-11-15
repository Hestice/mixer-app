import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitLayer, demoLayers, harmonyLayer, chapterFromProgress, mixChapterFromProgress, tourScene } from './session';

test('keeping a take preserves the mix and never duplicates the same candidate', () => {
  const original = structuredClone(demoLayers);
  const next = commitLayer(original, harmonyLayer);
  assert.equal(next.length, 4);
  assert.deepEqual(original, demoLayers);
  assert.deepEqual(next.slice(0, 3), original);
  assert.equal(commitLayer(next, harmonyLayer), next);
});

test('scrolling clamps to five chapters, including the end and overscroll', () => {
  assert.deepEqual([-1, 0, 0.21, 0.27, 0.30, 0.41, 0.61, 0.81, 0.94, 1, 2].map(chapterFromProgress), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4]);
});

test('tour scenes restore the specified mix forward, backward, and when skipping ahead', () => {
  const expected = [['guitar'], ['guitar'], ['guitar', 'keys', 'rhythm'], ['guitar', 'keys', 'rhythm', 'harmony'], ['guitar', 'keys', 'rhythm', 'harmony']];
  for (const chapter of [0, 1, 2, 3, 4, 3, 2, 1, 0, 4, 0]) {
    const scene = tourScene(chapter);
    const mix = [...scene.layers, ...(scene.candidate ? [scene.candidate] : [])];
    assert.deepEqual(mix.filter((layer) => layer.enabled).map((layer) => layer.id), expected[chapter]);
    assert.equal(new Set(mix.map((layer) => layer.id)).size, mix.length);
    assert.equal(scene.candidate?.id ?? null, chapter === 3 ? 'harmony' : null);
    // Trying the controls in one scene must not mutate the next entry's preset.
    mix.forEach((layer) => { layer.enabled = false; });
  }
  assert.equal(tourScene(4).candidate, null, 'the recording scene has no unresolved preview decision');
});


test('harmony transfers once on arrival, before the recording prompt, and reverses back to preview', () => {
  for (const progress of [.7, .81, .89, .9, .94, 1, .9, .81, .7]) {
    const scene = tourScene(mixChapterFromProgress(progress));
    const ids = [...scene.layers, ...(scene.candidate ? [scene.candidate] : [])].map((layer) => layer.id);
    assert.equal(ids.filter((id) => id === 'harmony').length, 1);
    assert.equal(scene.layers.some((layer) => layer.id === 'harmony'), progress >= .9);
    assert.equal(scene.candidate?.id ?? null, progress < .9 ? 'harmony' : null);
    assert.equal(chapterFromProgress(progress) === 4, progress >= .94);
  }
});
