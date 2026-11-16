import assert from 'node:assert/strict';
import { test } from 'node:test';
import { secondsForRotation, vinylAngle } from './turntable-position';

test('the record maps song time to its angle across complete turns', () => {
  assert.equal(vinylAngle(0), 0);
  assert.equal(vinylAngle(4), 90);
  assert.equal(vinylAngle(16), 0);
  assert.equal(vinylAngle(20), 90);
});

test('dragging across the angle boundary seeks in the direction of rotation', () => {
  assert.equal(secondsForRotation(170, -167.5), 1);
  assert.equal(secondsForRotation(-167.5, 170), -1);
  assert.equal(secondsForRotation(0, 90), 4);
  assert.equal(secondsForRotation(0, -90), -4);
});
