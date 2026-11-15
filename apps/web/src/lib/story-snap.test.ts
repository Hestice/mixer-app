import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storySnapTarget } from './story-snap';
import { STORY_STOPS } from './story-motion';

test('a small released scroll settles in the intended direction', () => {
  assert.equal(storySnapTarget(.28, 1), .4);
  assert.equal(storySnapTarget(.26, -1), 0);
  assert.equal(storySnapTarget(.41, 1), .5);
  assert.equal(storySnapTarget(.49, -1), .4);
});

test('snap uses the release position, allowing continuous scrolling past any number of anchors', () => {
  assert.equal(storySnapTarget(.83, 1), 1);
  assert.equal(storySnapTarget(.15, -1), 0);
  assert.equal(storySnapTarget(1, 1), 1);
  assert.equal(storySnapTarget(0, -1), 0);
});

test('settled anchors stay put and pixel rounding cannot cause an extra advance', () => {
  for (const stop of STORY_STOPS) {
    assert.equal(storySnapTarget(stop, 1), stop);
    assert.equal(storySnapTarget(stop, -1), stop);
    assert.equal(storySnapTarget(stop + .0001, 1), stop);
  }
  assert.equal(storySnapTarget(.43, 0), .4);
});
