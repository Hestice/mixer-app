import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStoryWheelInput, SCROLL_IDLE_MS } from './story-wheel-input';

test('reported momentum cannot postpone the deadline beyond 100 ms after active input', () => {
  const input = createStoryWheelInput();
  assert.equal(input.sample({ deltaY: 40, deltaMode: 0, time: 0, momentum: false }).delay, 100);
  for (const time of [16, 32, 64, 96, 100, 140, 300]) {
    const result = input.sample({ deltaY: 20, deltaMode: 0, time, momentum: true });
    assert.equal(result.momentum, true);
    assert.equal(result.delay, Math.max(0, 100 - time));
  }
  assert.deepEqual(input.sample({ deltaY: 1, deltaMode: 0, time: 316, momentum: false }), { momentum: false, delay: 100 });
});

test('continuous active input never becomes momentum when the browser reports it', () => {
  const input = createStoryWheelInput();
  for (let time = 0; time < 3000; time += 16) {
    const result = input.sample({ deltaY: 100 / (1 + time), deltaMode: 0, time, momentum: false });
    assert.deepEqual(result, { momentum: false, delay: SCROLL_IDLE_MS });
  }
});

test('fallback recognizes a decaying tail without waiting for its end', () => {
  const input = createStoryWheelInput();
  const deltas = [60, 80, 64, 48, 36, 27, 20, 15, 11, 8];
  const samples = deltas.map((deltaY, index) => input.sample({ deltaY, deltaMode: 0, time: index * 16 }));
  assert.equal(samples[3].momentum, false);
  assert.deepEqual(samples[4], { momentum: true, delay: 52 });
  assert.deepEqual(samples[8], { momentum: true, delay: 0 });
});

test('steady input, wheel notches and brief speed dips stay active', () => {
  for (const deltaMode of [0, 1, 2]) {
    const input = createStoryWheelInput();
    for (let index = 0; index < 120; index++) {
      const deltaY = [12, 12, 11, 10, 12, 12][index % 6];
      assert.equal(input.sample({ deltaY, deltaMode, time: index * 16 }).momentum, false);
    }
  }
});

test('new acceleration, reversal, a pause or reset immediately returns control', () => {
  for (const next of [
    { deltaY: 50, time: 80 },
    { deltaY: -1, time: 80 },
    { deltaY: 1, time: 200 },
  ]) {
    const input = createStoryWheelInput();
    [80, 64, 48, 36, 27].forEach((deltaY, index) => input.sample({ deltaY, deltaMode: 0, time: index * 16 }));
    assert.deepEqual(input.sample({ ...next, deltaMode: 0 }), { momentum: false, delay: 100 });
    input.reset();
    assert.equal(input.sample({ deltaY: 1, deltaMode: 0, time: 216 }).momentum, false);
  }
});

test('sustained slow input breaks out of an inferred momentum tail', () => {
  const input = createStoryWheelInput();
  [80, 64, 48, 36, 27].forEach((deltaY, index) => input.sample({ deltaY, deltaMode: 0, time: index * 16 }));
  [80, 96].forEach((time) => assert.equal(input.sample({ deltaY: 27, deltaMode: 0, time }).momentum, true));
  assert.deepEqual(input.sample({ deltaY: 27, deltaMode: 0, time: 112 }), { momentum: false, delay: 100 });
});
