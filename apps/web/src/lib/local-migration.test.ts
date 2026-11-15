import { IDBFactory } from 'fake-indexeddb';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSong, saveSong } from './song-store';
import { listBackups } from './backup-store';

test('upgrading a pre-cloud database preserves the local recording and does not opt it into backup', async () => {
  globalThis.indexedDB = new IDBFactory();
  const blob = new Blob(['existing recording'], { type: 'audio/wav' });
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('listening-room', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('songs', { keyPath: 'id' });
      request.result.createObjectStore('summaries', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['songs', 'summaries'], 'readwrite');
      tx.objectStore('songs').put({ id: 'pre-cloud', revision: 1, createdAt: 1, updatedAt: 1, title: 'My original recording', layers: [], candidate: { id: 'take', name: 'Voice', kind: 'recording', recorded: true, enabled: true, volume: .8, duration: 1, blob }, withDemo: false, volume: .6, partName: 'Voice', tempo: 84, countIn: true, metronomeMode: 'visual' });
      tx.objectStore('summaries').put({ id: 'pre-cloud', title: 'My original recording', updatedAt: 1, layerCount: 0, hasTake: true, duration: 1 });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
  const song = (await getSong('pre-cloud'))!;
  assert.equal(song.title, 'My original recording');
  assert.equal(await song.candidate!.blob!.text(), 'existing recording');
  assert.equal(song.ownerId, undefined);
  assert.deepEqual(await listBackups(), []);
  await saveSong(song.id, song.revision, { ...song, title: 'Still editable' });
  assert.equal((await getSong(song.id))?.title, 'Still editable');
});
