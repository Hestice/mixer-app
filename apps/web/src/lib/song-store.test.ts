import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSong, listSongs, openLocalSong, saveSong, updateSavedSong, SongWriter, SongConflictError, storageMessage, type SongContent } from './song-store';
import { encodeWav } from './wav';
import { layerLifecycleEdit } from './library-entry';

const song = (): SongContent => ({ title: 'Evening idea', layers: [], candidate: null, withDemo: false, volume: .6, partName: 'Vocals', tempo: 96, countIn: false, metronomeMode: 'visual' });
const take = () => ({ id: crypto.randomUUID(), name: 'Guitar', kind: 'recording' as const, enabled: true, volume: .8, recorded: true, duration: 1, peaks: [.1, .4], blob: encodeWav(new Float32Array([.2, -.4, .6]), 44100) });

test('an unkept take reopens with identical WAV bytes and session settings', async () => {
  const content = { ...song(), candidate: take() };
  const id = crypto.randomUUID();
  await saveSong(id, 0, content);
  const restored = (await getSong(id))!;
  assert.equal(restored.layers.length, 0);
  assert.equal(restored.candidate?.name, 'Guitar');
  assert.deepEqual(await restored.candidate!.blob!.arrayBuffer(), await content.candidate.blob.arrayBuffer());
  assert.equal(restored.tempo, 96);
  assert.equal(restored.countIn, false);
  assert.equal(restored.volume, .6);
  const summary = (await listSongs()).find((item) => item.id === id)!;
  assert.equal(summary.hasTake, true);
  assert.equal(summary.layerCount, 0);
});

test('keep and undo save audio and review state together without duplicate layers', async () => {
  const id = crypto.randomUUID(), candidate = take(), writer = new SongWriter(id);
  await writer.write({ ...song(), candidate });
  await writer.write({ ...song(), layers: [{ ...candidate, enabled: false, volume: .33 }] });
  let restored = (await getSong(id))!;
  assert.equal(restored.candidate, null);
  assert.equal(restored.layers.length, 1);
  assert.equal(restored.layers[0].enabled, false);
  assert.equal(restored.layers[0].volume, .33);
  await writer.write({ ...song(), candidate });
  restored = (await getSong(id))!;
  assert.equal(restored.layers.length, 0);
  assert.equal(restored.candidate?.id, candidate.id);
  assert.equal(restored.revision, 3);
});

test('rapid autosaves finish with the latest edit and preserve other songs', async () => {
  const id = crypto.randomUUID(), other = crypto.randomUUID(), writer = new SongWriter(id);
  await saveSong(other, 0, { ...song(), title: 'Separate song' });
  await Promise.all(Array.from({ length: 20 }, (_, index) => writer.write({ ...song(), title: `Edit ${index}` })));
  assert.equal((await getSong(id))?.title, 'Edit 19');
  assert.equal((await getSong(id))?.revision, 20);
  assert.equal((await getSong(other))?.title, 'Separate song');
});

test('a stale tab cannot overwrite newer recordings, even after retrying', async () => {
  const id = crypto.randomUUID();
  await saveSong(id, 0, song());
  const first = new SongWriter(id, 1), stale = new SongWriter(id, 1);
  const candidate = take();
  await first.write({ ...song(), candidate });
  await assert.rejects(stale.write({ ...song(), title: 'Stale edit' }), SongConflictError);
  await assert.rejects(stale.write(song()), SongConflictError);
  assert.equal((await getSong(id))?.candidate?.id, candidate.id);
});

test('failed writes leave the previous song and library entry intact; retry recovers', async () => {
  const id = crypto.randomUUID(), writer = new SongWriter(id);
  await writer.write(song());
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () { throw new DOMException('Full', 'QuotaExceededError'); };
  try { await assert.rejects(writer.write({ ...song(), title: 'Unsaved change' }), { name: 'QuotaExceededError' }); }
  finally { IDBObjectStore.prototype.put = original; }
  assert.equal((await getSong(id))?.title, 'Evening idea');
  assert.equal((await listSongs()).find((item) => item.id === id)?.title, 'Evening idea');
  await writer.write({ ...song(), title: 'Recovered' });
  assert.equal((await getSong(id))?.title, 'Recovered');
  assert.match(storageMessage(new DOMException('Full', 'QuotaExceededError')), /out of storage/);
});

test('missing songs do not become empty replacements', async () => {
  assert.equal(await getSong(crypto.randomUUID()), undefined);
});

test('library archive and delete retain every local recording and prevent stale studios from editing', async () => {
  const id = crypto.randomUUID(), layer = take();
  const saved = await saveSong(id, 0, { ...song(), layers: [layer], candidate: take() });
  await assert.rejects(updateSavedSong(id, saved.revision, undefined, { type: 'delete' }), /changed/);
  const renamed = await updateSavedSong(id, saved.revision, undefined, { type: 'rename', title: ' New name ' });
  await assert.rejects(new SongWriter(id, saved.revision).write(song()), SongConflictError);
  const archived = await updateSavedSong(id, renamed.revision, undefined, { type: 'archive' });
  assert.equal((await openLocalSong(id)).unavailable, 'archived');
  const restored = await updateSavedSong(id, archived.revision, undefined, { type: 'restore' });
  assert.equal((await openLocalSong(id)).song?.title, 'New name');
  const rearchived = await updateSavedSong(id, restored.revision, undefined, { type: 'archive' });
  const deleted = await updateSavedSong(id, rearchived.revision, undefined, { type: 'delete' });
  await assert.rejects(updateSavedSong(id, deleted.revision, undefined, { type: 'restore' }), /changed/);
  assert.equal((await openLocalSong(id)).unavailable, 'deleted');
  const retained = (await getSong(id))!;
  assert.ok(retained.deletedAt);
  assert.deepEqual(await retained.layers[0].blob!.arrayBuffer(), await layer.blob.arrayBuffer());
  assert.deepEqual(await retained.candidate!.blob!.arrayBuffer(), await saved.candidate!.blob!.arrayBuffer());
});

test('song summaries exclude inactive layers while autosave retains their recordings', async () => {
  const id = crypto.randomUUID(), archive = take(), deleted = take(), current = take(), now = Date.now();
  await saveSong(id, 0, { ...song(), layers: [
    { ...archive, archivedAt: now, startAt: 42 },
    { ...deleted, ...layerLifecycleEdit({}, 'delete', now), startAt: 80 },
    { ...current, color: 'slate' },
  ] });
  const summary = (await listSongs()).find(item => item.id === id)!;
  assert.equal(summary.layerCount, 1);
  assert.equal(summary.duration, current.duration);
  const reopened = (await openLocalSong(id)).song!;
  assert.equal(reopened.layers.length, 3);
  assert.equal(reopened.layers[1].deletedAt, now);
  assert.equal(reopened.layers[1].archivedAt, undefined);
  assert.equal(reopened.layers[2].color, 'slate');
  assert.deepEqual(await reopened.layers[1].blob!.arrayBuffer(), await deleted.blob.arrayBuffer());
});
