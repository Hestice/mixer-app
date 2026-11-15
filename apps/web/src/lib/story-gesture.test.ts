import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStoryGesture } from './story-gesture';
import { tourBuildStage } from './story-motion';

test('a large gesture and its momentum stop at keys, with rhythm requiring a new gesture', () => {
  const gesture = createStoryGesture();
  let progress = gesture.move(.27, .25, 0);
  assert.equal(progress, .4);
  for (let time = 30; time <= 600; time += 30) progress = gesture.move(progress, .03, time);
  assert.equal(progress, .4);
  assert.equal(tourBuildStage(progress), 1);
  progress = gesture.move(progress, .25, 1100);
  assert.equal(progress, .5);
  assert.equal(tourBuildStage(progress), 2);
});

test('tiny input selects the next anchor and another gesture can advance during settling', () => {
  const gesture = createStoryGesture();
  assert.equal(gesture.move(.27, .002, 0), .272);
  assert.equal(gesture.target, .4);
  assert.equal(gesture.move(.35, .001, 700), .351);
  assert.equal(gesture.target, .5);
});

test('upward gestures remove rhythm then keys, and reversing interrupts the current target', () => {
  const gesture = createStoryGesture();
  assert.equal(gesture.move(.5, -.3, 0), .4);
  assert.equal(gesture.move(.4, -.3, 100), .4);
  assert.equal(gesture.move(.4, -.3, 600), .27);
  gesture.reset();
  gesture.move(.27, .05, 700);
  assert.equal(gesture.move(.32, -.01, 710), .31);
  assert.equal(gesture.target, .27);
});

test('navigation resets gesture intent, and boundary gestures stay in the story', () => {
  const gesture = createStoryGesture();
  gesture.move(.27, .01, 0);
  gesture.reset();
  assert.equal(gesture.target, null);
  assert.equal(gesture.move(.7, .9, 10), 1);
  assert.equal(gesture.move(1, .9, 600), 1);
  gesture.reset();
  assert.equal(gesture.move(0, -.9, 700), 0);
});


test('a fresh upward gesture can target the opening before the previous anchor arrives', () => {
  const gesture = createStoryGesture();
  gesture.move(.4, -.01, 0);
  assert.equal(gesture.target, .27);
  gesture.move(.32, -.01, 250);
  assert.equal(gesture.target, 0);
});

test('native overscroll and repeated snap calculations cannot leak past the latched keys stop', () => {
  const gesture = createStoryGesture();
  gesture.move(.27, .01, 0);
  for (const progress of [.41, .5, .9, 1]) {
    assert.equal(gesture.constrain(progress), .4);
    assert.equal(gesture.target, .4);
  }
  // An explicit next gesture advances from the held anchor, not the overshoot.
  assert.equal(gesture.move(.8, .02, 1500), .5);
});

test('explicit chapter navigation owns its destination and then holds there', () => {
  const gesture = createStoryGesture();
  gesture.navigate(.27, .7);
  assert.equal(gesture.constrain(.5), .5);
  assert.equal(gesture.constrain(.71), .7);
  assert.equal(gesture.constrain(1), .7);
  gesture.reset();
  assert.equal(gesture.move(.7, -.5, 1100), .5);
});
