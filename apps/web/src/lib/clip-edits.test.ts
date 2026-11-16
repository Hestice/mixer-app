import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendTake, clipBounds, discardDraftTake, editClip, playbackWindow, selectTake, takesOf, snapStart } from './clip-edits';
import type { Layer } from './session';
const original = (): Layer => ({ id: 'part', name: 'Guitar', kind: 'recording', enabled: true, volume: .8, recorded: true, duration: 10, blob: new Blob(['first']), peaks: [.2, .5] });
test('old recordings become a first take without losing their original bytes', async () => {
  const layer = original();
  assert.equal(takesOf(layer).length, 1);
  assert.equal(await takesOf(layer)[0].blob!.text(), 'first');
  assert.deepEqual(clipBounds(layer), { duration: 10, trimStart: 0, trimEnd: 10, startAt: 0, length: 10, end: 10 });
});
test('retakes preserve each attempt and its independent edits when switching back and forth', async () => {
  const first = editClip(original(), { trimStart: 2, trimEnd: 7, startAt: 3 });
  const second = editClip(appendTake(first, { id: 'second', duration: 8, blob: new Blob(['second']) }), { trimStart: 1, trimEnd: 6, startAt: 4 });
  const restored = selectTake(second, 'part');
  assert.equal(restored.id, 'part'); assert.equal(restored.trimStart, 2); assert.equal(restored.startAt, 3);
  assert.equal(await restored.blob!.text(), 'first');
  assert.equal(selectTake(restored, 'second').trimEnd, 6);
  assert.equal(selectTake(restored, 'second').startAt, 4);
  assert.equal(takesOf(restored).length, 2);
});
test('trim boundaries cannot cross and invalid placement never enters playback', () => {
  const edited = editClip(original(), { trimStart: 20, trimEnd: -1, startAt: -50 });
  const bounds = clipBounds(edited);
  assert.ok(bounds.length > 0); assert.ok(bounds.trimEnd <= 10); assert.equal(bounds.startAt, 0);
  assert.equal(clipBounds({ duration: 10, startAt: Infinity }).startAt, 0);
});
test('playback schedules silence, source offset, and remaining length independently', () => {
  const layer = { duration: 10, trimStart: 2, trimEnd: 7, startAt: 4 };
  assert.deepEqual(playbackWindow(layer, 0), { delay: 4, offset: 2, duration: 5 });
  assert.deepEqual(playbackWindow(layer, 6), { delay: 0, offset: 4, duration: 3 });
  assert.equal(playbackWindow(layer, 9), null);
  assert.equal(snapStart(3.96, [4], .1), 4);
  assert.equal(snapStart(3.7, [4], .1), 3.7);
});


test('trimming leading silence preserves the position of the remaining performance', () => {
  const layer = editClip(original(),{trimStart:1,trimEnd:8,startAt:3});
  const trimmed = editClip(layer,{trimStart:2});
  assert.equal(trimmed.startAt,4); assert.equal(clipBounds(trimmed).end,10);
  assert.equal(playbackWindow(layer,5)?.offset,playbackWindow(trimmed,5)?.offset);
  assert.equal(editClip(trimmed,{trimStart:1}).startAt,3);
  assert.equal(selectTake(trimmed, trimmed.takeId!).startAt,4,'the selected take persists its placement');
});

test('discarding a draft take selects the most recent remaining attempt and retains its edits', () => {
  const first = editClip(original(), { trimStart: 1, startAt: 3 });
  const second = appendTake(first, { id: 'second', duration: 8, blob: new Blob(['second']) });
  const third = appendTake(second, { id: 'third', duration: 6, blob: new Blob(['third']) });
  const keptDraft = discardDraftTake(selectTake(third, 'second'));
  assert.equal(keptDraft?.takeId, 'third');
  assert.deepEqual(takesOf(keptDraft!).map(take => take.id), ['part', 'third']);
  assert.equal(selectTake(keptDraft!, 'part').startAt, 3);
  assert.equal(discardDraftTake(first), null);
});

test('discarding the last retake ends review while the kept layer and its takes stay intact', () => {
  const kept = original();
  const draft = appendTake(kept, { id: 'retry', duration: 8, blob: new Blob(['retry']) });
  const selectedOriginal = selectTake(draft, kept.id);
  assert.equal(discardDraftTake(selectedOriginal, kept), selectedOriginal);
  assert.equal(discardDraftTake(draft, kept), null);
  assert.deepEqual(takesOf(kept).map(take => take.id), ['part']);
});
