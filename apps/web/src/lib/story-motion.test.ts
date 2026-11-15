import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyGeometry, layerReveal, stylusPosition, TONEARM, STORY_STOPS } from './story-motion';

test('the playing stylus sits in the groove annulus, never on the label; resting is off the record', () => {
  const radius = (angle: number) => { const p = stylusPosition(angle); return Math.hypot(p.x - 50, p.y - 50); };
  assert.ok(radius(TONEARM.playAngle) > 34); // Largest mobile paper label radius.
  assert.ok(radius(TONEARM.playAngle) < 46); // Inside the outer groove edge.
  assert.ok(radius(TONEARM.restAngle) > 50);
});

test('unfolding reverses with scroll and stays continuous across chapter boundaries', () => {
  for (const boundary of [.2,.4,.6,.8]) {
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
      for (const value of [g.unfold, g.build, g.open, ...['guitar', 'keys', 'rhythm', 'harmony'].map((id) => layerReveal(id, progress))]) {
        assert.ok(value === 0 || value === 1, `incomplete scene at ${progress}`);
      }
    }
  }
});

test('returning to the opening folds up even a song with a kept harmony', () => {
  for (const reduced of [false, true]) {
    const open = storyGeometry(STORY_STOPS[3], 358, 667, 4, reduced);
    const closed = storyGeometry(STORY_STOPS[0], 358, 667, 4, reduced);
    assert.equal(open.open, 1);
    assert.equal(closed.open, 0);
    assert.equal(closed.unfold, 0);
    assert.equal(closed.build, 0);
    for (const id of ['guitar', 'keys', 'rhythm', 'harmony']) assert.equal(layerReveal(id, 0), 0);
    const middle = storyGeometry(STORY_STOPS[2], 358, 667, 4, reduced);
    assert.ok(middle.height >= middle.layersY + 24 + 4 * middle.rowHeight);
  }
});
