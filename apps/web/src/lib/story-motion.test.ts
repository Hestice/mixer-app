import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyGeometry, layerReveal, stylusPosition, TONEARM, STORY_STOPS, CHAPTER_STOPS, tourBuildStage, STORY_BOUNDARIES, harmonyTravelTime } from './story-motion';

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


test('harmony gets readable travel time even when one input crosses the entire scene', () => {
  assert.equal(harmonyTravelTime(.27, .4), 0);
  assert.equal(harmonyTravelTime(.4, .5), 0);
  assert.equal(harmonyTravelTime(.7, 1), 2.4);
  assert.equal(harmonyTravelTime(1, .7), 2.4);
  assert.ok(harmonyTravelTime(.81, 1) > 1.19);
  assert.ok(harmonyTravelTime(.81, 1) < 1.21);
  assert.equal(harmonyTravelTime(.94, 1), 0);
});
