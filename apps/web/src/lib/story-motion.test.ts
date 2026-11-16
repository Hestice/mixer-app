import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyGeometry, layerReveal, stylusPosition, TONEARM, STORY_STOPS, CHAPTER_STOPS, tourBuildStage, STORY_BOUNDARIES, storyTransitionDuration } from './story-motion';

test('the playing stylus sits in the groove annulus, never on the label; resting is off the record', () => {
  const radius = (angle: number) => { const p = stylusPosition(angle); return Math.hypot(p.x - 50, p.y - 50); };
  assert.ok(radius(TONEARM.playAngle) > 34); // Largest mobile paper label radius.
  assert.ok(radius(TONEARM.playAngle) < 46); // Inside the outer groove edge.
  assert.ok(radius(TONEARM.restAngle) > 50);
});

test('unfolding reverses with scroll and stays continuous across chapter boundaries', () => {
  for (const boundary of STORY_BOUNDARIES) {
    const a = storyGeometry(boundary - .00001, 800, 886, 3);
    const b = storyGeometry(boundary + .00001, 800, 886, 3);
    for (const key of ['songX','layersX','layersY','disc','height','shellWidth'] as const) assert.ok(Math.abs(a[key] - b[key]) < .1, key);
  }
  assert.equal(layerReveal('guitar', 0), 0);
  assert.equal(layerReveal('guitar', .27), 1);
  assert.ok(layerReveal('guitar', .15) > 0 && layerReveal('guitar', .15) < 1);
  assert.ok(layerReveal('keys', .38) > layerReveal('rhythm', .38));
});

test('all snap points land on complete scenes, with no partially visible layers or decks', () => {
  for (const width of [358, 800]) {
    for (const progress of STORY_STOPS) {
      const g = storyGeometry(progress, width, 667, 4);
      for (const value of [g.unfold, g.open, ...['guitar', 'keys', 'rhythm', 'harmony'].map((id) => layerReveal(id, progress))]) {
        assert.ok(value === 0 || value === 1, `incomplete scene at ${progress}`);
      }
    }
  }
});

test('the opening deck and four-layer console fit their available space on short screens', () => {
  for (const [width, viewport, budget] of [[800, 820, 469], [358, 750, 365], [290, 568, 274]]) {
    const opening = storyGeometry(0, width, viewport, 3, false, budget);
    const harmony = storyGeometry(CHAPTER_STOPS[3], width, viewport, 4, false, budget);
    const recording = storyGeometry(1, width, viewport, 4, false, budget);
    assert.ok(opening.height <= budget, `opening at ${viewport}px`);
    assert.ok(harmony.height <= budget, `harmony at ${viewport}px`);
    assert.equal(recording.height, harmony.height);
    assert.ok(harmony.layersY + harmony.layerTitle + 4 * harmony.rowHeight < harmony.height, 'the fourth row fits inside the deck');
  }
});

test('returning to the opening folds up even a song with a kept harmony', () => {
  for (const reduced of [false, true]) {
    const open = storyGeometry(CHAPTER_STOPS[3], 358, 667, 4, reduced);
    const closed = storyGeometry(STORY_STOPS[0], 358, 667, 4, reduced);
    assert.equal(open.open, 1);
    assert.equal(closed.open, 0);
    assert.equal(closed.unfold, 0);
    assert.equal(closed.build, 0);
    for (const id of ['guitar', 'keys', 'rhythm', 'harmony']) assert.equal(layerReveal(id, 0), 0);
    const middle = storyGeometry(.50, 358, 667, 4, reduced);
    assert.ok(middle.height >= middle.layersY + 24 + 4 * middle.rowHeight);
  }
});


test('keys finish unfolding before rhythm starts, and their sound entries reverse in order', () => {
  for (let step = 0; step <= 1000; step++) {
    const progress = step / 1000;
    const keys = layerReveal('keys', progress);
    const rhythm = layerReveal('rhythm', progress);
    if (rhythm > 0) assert.equal(keys, 1, 'the two arrivals must not overlap');
    if (tourBuildStage(progress) >= 1) assert.ok(keys >= .97);
    if (tourBuildStage(progress) === 2) assert.ok(rhythm >= .97);
  }
  assert.deepEqual([.27, .40, .50, .40, .27].map(tourBuildStage), [0, 1, 2, 1, 0]);
});


test('the build has two shorter resting points, one for each new layer', () => {
  const buildStops = STORY_STOPS.filter((stop) => stop > CHAPTER_STOPS[1] && stop < CHAPTER_STOPS[3]);
  assert.equal(buildStops.length, 2);
  assert.equal(CHAPTER_STOPS[2], buildStops[0], 'chapter navigation starts with keys');
  assert.deepEqual(buildStops.map(tourBuildStage), [1, 2]);
  buildStops.forEach((stop, index) => assert.ok(Math.abs(storyGeometry(stop, 358, 667, 3).build - (index + 1) / 2) < 1e-9));
  assert.ok(buildStops[0] - CHAPTER_STOPS[1] < CHAPTER_STOPS[1]);
  assert.ok(buildStops[1] - buildStops[0] < CHAPTER_STOPS[1]);
});


test('harmony travels during scrolling and reaches the song before the recording scene', () => {
  assert.equal(layerReveal('harmony', CHAPTER_STOPS[3]), 0);
  assert.equal(layerReveal('harmony', .72), 0);
  assert.ok(Math.abs(layerReveal('harmony', .81) - .5) < 1e-9);
  assert.equal(layerReveal('harmony', .9), 1);
  assert.ok(.9 < STORY_BOUNDARIES[3]);
  const forward = [.72, .77, .81, .85, .9].map((p) => layerReveal('harmony', p));
  assert.deepEqual([.9, .85, .81, .77, .72].map((p) => layerReveal('harmony', p)), [...forward].reverse());
});


test('settling duration follows the remaining fraction of every anchor interval in both directions', () => {
  for (let index = 1; index < STORY_STOPS.length; index++) {
    const left = STORY_STOPS[index - 1];
    const right = STORY_STOPS[index];
    const fullDuration = index === STORY_STOPS.length - 1 ? 2 : 1.5;
    for (const fraction of [0, .1, .5, .9, 1]) {
      const forward = left + (right - left) * fraction;
      const backward = right - (right - left) * fraction;
      const expected = fullDuration * (1 - fraction);
      assert.ok(Math.abs(storyTransitionDuration(forward, right) - expected) < 1e-9);
      assert.ok(Math.abs(storyTransitionDuration(backward, left) - expected) < 1e-9);
    }
  }
});

test('resuming a partly completed settle uses only its remaining distance', () => {
  assert.ok(Math.abs(storyTransitionDuration(.45, .5) - .75) < 1e-9);
  assert.ok(Math.abs(storyTransitionDuration(.475, .5) - .375) < 1e-9);
  assert.ok(Math.abs(storyTransitionDuration(.85, 1) - 1) < 1e-9);
  assert.ok(Math.abs(storyTransitionDuration(.97, 1) - .2) < 1e-9);
});

test('chapter jumps stay bounded and settled positions need no animation', () => {
  assert.equal(storyTransitionDuration(0, 1), 2);
  assert.equal(storyTransitionDuration(1, 0), 2);
  assert.equal(storyTransitionDuration(0, .5), 1.5);
  STORY_STOPS.forEach((stop) => assert.equal(storyTransitionDuration(stop, stop), 0));
  assert.equal(storyTransitionDuration(-1, 0), 0);
  assert.equal(storyTransitionDuration(2, 1), 0);
});
