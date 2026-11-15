import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStoryScrollState } from './story-scroll-state';

test('one uninterrupted scroll traverses the entire story in either direction', () => {
  const state = createStoryScrollState(0);
  for (const progress of [.12, .29, .43, .56, .75, .93, 1]) assert.equal(state.native(progress), progress);
  assert.equal(state.settle(), 1);
  for (const progress of [.85, .66, .45, .25, .11, 0]) assert.equal(state.native(progress), progress);
  assert.equal(state.settle(), 0);
});

test('a single large native scroll can reach the end without stopping at the first anchor', () => {
  const state = createStoryScrollState(0);
  assert.equal(state.native(1), 1);
  assert.equal(state.native(0), 0);
});

test('continuing during a settle follows the new native position immediately', () => {
  const state = createStoryScrollState(.27);
  state.native(.28);
  assert.equal(state.settle(), .4);
  state.render(.34);
  assert.equal(state.native(.85), .85);
  assert.equal(state.settle(), 1);
  assert.equal(state.native(.25), .25);
  assert.equal(state.settle(), 0);
});

test('programmatic animation frames do not change the user’s scroll direction', () => {
  const state = createStoryScrollState(.5);
  state.intent(-1);
  state.render(.6); // A navigation animation is not user input.
  assert.equal(state.settle(), .5);
  state.intent(1);
  assert.equal(state.settle(), .7);
});

test('keys and rhythm remain available as separate release anchors', () => {
  const state = createStoryScrollState(.27);
  state.native(.29);
  assert.equal(state.settle(), .4);
  state.render(.4);
  state.native(.42);
  assert.equal(state.settle(), .5);
  state.render(.5);
  state.native(.48);
  assert.equal(state.settle(), .4);
});
