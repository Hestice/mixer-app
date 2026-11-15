import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStoryScrollState } from './story-scroll-state';

test('reversing a settle starts at the visible position without a jump or forward pull', () => {
  const state = createStoryScrollState(.27);
  state.input(.01, 0);
  state.render(.28);
  assert.equal(state.settle(), .4);
  state.render(.36);
  assert.equal(state.input(-.01, 1010), .35);
  assert.equal(state.progress, .36, 'changing direction must not move the visible scene');
  state.render(.35);
  assert.equal(state.settle(), .27);
});

test('continuing during a settle resumes from the current frame and advances to rhythm', () => {
  const state = createStoryScrollState(.27);
  state.input(.01, 0);
  state.settle();
  state.render(.34);
  assert.ok(Math.abs(state.input(.02, 910) - .36) < 1e-9);
  assert.equal(state.input(.2, 920), .5);
  assert.equal(state.settle(), .5);
});

test('animation frames and delayed scroll observations cannot become a new gesture', () => {
  const state = createStoryScrollState(.27);
  state.input(.02, 0);
  state.settle();
  for (let i = 0; i <= 15; i++) state.render(.29 + .11 * i / 15);
  state.finish();
  state.render(.4);
  state.render(.4);
  assert.equal(state.settle(), .4);
  assert.equal(state.input(.2, 4100), .5, 'a real new gesture can now bring in rhythm');
});

test('wheel bursts accumulate without skipping anchors, and reverse without queued motion', () => {
  const state = createStoryScrollState(.27);
  state.input(.04, 0);
  state.render(.28);
  assert.equal(state.input(.04, 30), .35);
  assert.equal(state.input(.2, 40), .4);
  state.render(.32);
  assert.equal(state.input(-.01, 70), .31);
  assert.equal(state.settle(), .27);
});

test('native input respects the same stops and can interrupt chapter navigation', () => {
  const state = createStoryScrollState(.27);
  assert.equal(state.native(.8, 0), .4);
  state.render(.4);
  state.begin();
  assert.equal(state.native(.9, 1100), .5);
  state.navigate(1);
  state.render(.65);
  assert.equal(state.input(-.01, 1410), .64);
  assert.equal(state.settle(), .5);
});


test('a geometry refresh can re-render without dropping the pending directional snap', () => {
  const state = createStoryScrollState(.27);
  state.input(.002, 0);
  state.render(.272);
  state.render(.271); // A resize changes the normalized coordinate slightly.
  assert.equal(state.settle(), .4);
  state.render(.35);
  state.render(.349);
  assert.equal(state.settle(), .4);
});


test('another upward gesture reaches scene one while scene two is still settling', () => {
  const state = createStoryScrollState(.4);
  state.input(-.01, 0);
  assert.equal(state.settle(), .27);
  state.render(.31);
  assert.equal(state.input(-.01, 600), .3);
  assert.equal(state.settle(), 0, 'the pending scene-two anchor must not lock further scrolling');
  assert.equal(state.progress, .31, 'retargeting must not jump the rendered scene');
});

test('new key presses and touch gestures advance immediately without waiting for a settle', () => {
  for (const input of ['key', 'touch']) {
    const state = createStoryScrollState(.5);
    state.input(-.01, 0);
    state.settle();
    state.render(.48);
    if (input === 'touch') state.begin();
    state.input(-.01, 50, input === 'key');
    assert.equal(state.settle(), .27);
  }
});
