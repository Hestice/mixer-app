import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordingDelay, recordedPlacement, recordingSchedule } from './recording-timing';
import { playbackWindow } from './clip-edits';

test('capture compensation covers the output graph, device output and reported microphone buffering', () => {
  assert.equal(recordingDelay({baseLatency:.01,outputLatency:.04},.02),.076);
  assert.equal(recordingDelay({}),.006);
  assert.equal(recordingDelay({baseLatency:NaN,outputLatency:-1},Infinity),.006);
});
test('an overdub following the backing audio lands on the shared timeline without altering source samples', () => {
  const delay = recordingDelay({baseLatency:.01,outputLatency:.04},.02);
  const placement = recordedPlacement(5,12,delay);
  // A sound heard at song time 13 arrives at the recorder one second + device delay into capture.
  const window = playbackWindow({...placement,duration:5},13)!;
  assert.ok(Math.abs(window.offset - (1+delay))<.000001);
  assert.equal(placement.startAt,12); assert.equal(placement.trimEnd,5);
  assert.equal(recordedPlacement(.25,0,1).trimStart,.2,'short takes cannot produce an invalid trim');
});

test('count-in adds four beats while immediate capture starts on the first scheduled beat', () => {
  const counted = recordingSchedule(0, 120, true);
  assert.equal(counted.beatSeconds, .5);
  assert.equal(counted.startAt - counted.countAt, 2);
  const immediate = recordingSchedule(0, 120, false);
  assert.equal(immediate.countAt, counted.countAt);
  assert.equal(immediate.startAt, immediate.countAt);
});
