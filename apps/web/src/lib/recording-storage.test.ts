import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRecording, recordingBlob, RecordingReadError, storeRecordingContent, restoreRecordingContent, replaceLayerAudio, SONG_AUDIO_STORE } from './recording-storage';
import { saveSong, getSong, readLocal, openDatabase, openLocalSong, type SongContent } from './song-store';
import { encodeWav } from './wav';
import { makeManifest, recoverLayerAudio } from './cloud-manifest';
import { enableBackup, getBackup } from './backup-store';
import { takesOf } from './clip-edits';

function fixture(): SongContent {
 const blob=encodeWav(new Float32Array([.1,.4,-.6,.2]),48000);
 return {title:'Recording recovery',layers:[{id:'voice',name:'Vocals',kind:'recording',recorded:true,enabled:true,volume:.7,duration:1,takeId:'take-a',blob,takes:[{id:'take-a',blob,duration:1,trimStart:.2,trimEnd:.8,startAt:4} ],trimStart:.2,trimEnd:.8,startAt:4}],candidate:null,withDemo:false,volume:.6,partName:'Guitar',tempo:84,countIn:true,metronomeMode:'visual'};
}
test('new saves store independent audio bytes for kept takes and review takes and reopen identical WAVs',async()=>{
 const content=fixture();content.candidate={...content.layers[0],id:'review'};
 const id=crypto.randomUUID();await saveSong(id,0,content);
 const raw=await readLocal<any>('songs',id);
 assert.equal(raw.layers[0].blob,undefined);assert.equal(raw.layers[0].takes[0].blob,undefined);
 assert.equal(raw.layers[0].audioBytes,undefined);assert.equal(raw.candidate.audioBytes,undefined);
 assert.equal(raw.layers[0].audioId,raw.candidate.audioId);
 const media=await readLocal<{audioBytes:ArrayBuffer}>(SONG_AUDIO_STORE,[id,raw.layers[0].audioId]);
 assert.deepEqual(media.audioBytes,await content.layers[0].blob!.arrayBuffer());
 const song=(await getSong(id))!;
 assert.deepEqual(await song.layers[0].blob!.arrayBuffer(),await content.layers[0].blob!.arrayBuffer());
 assert.deepEqual(await song.candidate!.takes![0].blob!.arrayBuffer(),await content.candidate.blob!.arrayBuffer());
 assert.equal(song.layers[0].trimStart,.2);assert.equal(song.layers[0].startAt,4);
 assert.equal('audioBytes' in song.layers[0],false,'storage details cannot leak into the cloud manifest');
 assert.equal('audioId' in song.layers[0],false,'storage details cannot leak into the cloud manifest');
});
test('a lost browser Blob backing file cannot invalidate previously persisted bytes',async()=>{
 const content=fixture();const source=content.layers[0].blob!;
 const stored=await storeRecordingContent({...content,id:crypto.randomUUID(),revision:1,createdAt:1,updatedAt:1});
 Object.defineProperty(source,'arrayBuffer',{value:async()=>{throw new DOMException('The object can not be found here.','NotFoundError');}});
 assert.equal((await readRecording(source,'Vocals')).byteLength,52,'an open tab retains the bytes it already saved');
 const restored=restoreRecordingContent(stored);
 assert.ok((await readRecording(restored.layers[0].blob,'Vocals')).byteLength>44);
});
test('an unreadable legacy recording cannot overwrite a previously saved song',async()=>{
 const id=crypto.randomUUID();const content=fixture();await saveSong(id,0,content);
 const broken=new Blob(['unreadable']);Object.defineProperty(broken,'arrayBuffer',{value:async()=>{throw new DOMException('The object can not be found here.','NotFoundError');}});
 await assert.rejects(saveSong(id,1,{...content,layers:[{...content.layers[0],blob:broken,takes:[{...content.layers[0].takes![0],blob:broken}]}]}), /Vocals.*NotFoundError/);
 assert.equal((await getSong(id))?.revision,1);
});
test('cloud repair restores only matching audio, preserving unsynced edits, alternatives and take selection',async()=>{
 const content=fixture(),owner=crypto.randomUUID();const audio=new Map<string,Blob>();
 const manifest=await makeManifest({...content,id:crypto.randomUUID(),revision:1,createdAt:1,updatedAt:1},owner,async(path,blob)=>{audio.set(path,blob);});
 const local={...content.layers[0],trimStart:.3,startAt:7,volume:.25,takes:[{...takesOf(content.layers[0])[0],trimStart:.3,startAt:7},{id:'not-backed-up',duration:2,blob:new Blob(['new take'])}]};
 const recovered=replaceLayerAudio(local,await recoverLayerAudio(local,manifest,owner,async(path)=>audio.get(path)!));
 assert.equal(recovered.startAt,7);assert.equal(recovered.trimStart,.3);assert.equal(recovered.volume,.25);assert.equal(recovered.takeId,'take-a');
 assert.equal(recovered.takes![0].startAt,7);assert.equal(await recovered.takes![1].blob!.text(),'new take');
 assert.deepEqual(await recovered.blob!.arrayBuffer(),await content.layers[0].blob!.arrayBuffer());
 await assert.rejects(recoverLayerAudio(local,manifest,owner,async()=>new Blob(['bad bytes'])),/completely/);
 assert.equal((await recoverLayerAudio({...local,id:'different-layer'},manifest,owner,async()=>new Blob())).size,0);
});


test('older app code cannot open and overwrite the byte-backed database format',async()=>{
 const content=fixture();await saveSong(crypto.randomUUID(),0,content);
 await assert.rejects(new Promise((resolve,reject)=>{const request=indexedDB.open('listening-room',2);request.onerror=()=>reject(request.error);request.onsuccess=()=>{request.result.close();resolve(undefined);};}),{name:'VersionError'});
});

async function seedLegacy(content: SongContent, ownerId?: string) {
  const id = crypto.randomUUID();
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('songs', 'readwrite');
      tx.objectStore('songs').put({ ...content, id, ownerId, revision: 7, updatedAt: 456, createdAt: 123 });
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    return id;
  } finally { db.close(); }
}

test('songs with inline audio remain readable and move to separate records on the next save', async () => {
  const content = fixture();
  const inline = await storeRecordingContent(content);
  const id = await seedLegacy(inline);
  const { song } = await openLocalSong(id);
  assert.ok(song);
  assert.deepEqual(await song.layers[0].blob!.arrayBuffer(), await content.layers[0].blob!.arrayBuffer());
  await saveSong(id, song.revision, song);
  const saved = await readLocal<{ layers: { audioId: string; audioBytes?: ArrayBuffer }[] }>('songs', id);
  assert.equal(saved.layers[0].audioBytes, undefined);
  const media = await readLocal<{ audioBytes: ArrayBuffer }>(SONG_AUDIO_STORE, [id, saved.layers[0].audioId]);
  assert.deepEqual(media.audioBytes, await content.layers[0].blob!.arrayBuffer());
});

test('a failed metadata write rolls back every new stem while leaving the previous revision playable', async () => {
  const id = crypto.randomUUID();
  const content = fixture();
  await saveSong(id, 0, content);
  const layers = ['Vocals', 'Drums', 'Bass', 'Other instruments'].map((name, index) => ({
    ...content.layers[0], id: name, name, takes: undefined,
    blob: encodeWav(Float32Array.of(index / 4), 44100),
  }));
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (this.name === 'songs') throw new DOMException('Full', 'QuotaExceededError');
    return put.call(this, value, key);
  };
  try {
    await assert.rejects(saveSong(id, 1, { ...content, layers }), { name: 'QuotaExceededError' });
  } finally { IDBObjectStore.prototype.put = put; }
  const media = await readLocal<{ songId: string }[]>(SONG_AUDIO_STORE);
  assert.equal(media.filter(record => record.songId === id).length, 1);
  const saved = await getSong(id);
  assert.equal(saved?.revision, 1);
  assert.deepEqual(await saved.layers[0].blob!.arrayBuffer(), await content.layers[0].blob!.arrayBuffer());
  const next = await saveSong(id, 1, { ...content, layers });
  const splitMedia = await readLocal<{ songId: string }[]>(SONG_AUDIO_STORE);
  assert.equal(splitMedia.filter(record => record.songId === id).length, 4);
  assert.deepEqual((await getSong(id))?.layers.map(layer => layer.name), next.layers.map(layer => layer.name));
});

test('opening a legacy song protects audio immediately without changing its revision, trims or owner', async () => {
  const content = fixture(), owner = crypto.randomUUID();
  const id = await seedLegacy(content, owner);
  assert.deepEqual(await openLocalSong(id, 'other-owner'), { ownerMismatch: true });
  assert.ok((await readLocal<any>('songs',id)).layers[0].blob instanceof Blob);
  const { song, audioError } = await openLocalSong(id, owner);
  assert.equal(audioError, undefined);
  assert.equal(song?.revision, 7); assert.equal(song?.updatedAt, 456); assert.equal(song?.ownerId, owner);
  assert.equal(song?.layers[0].startAt, 4); assert.equal(song?.layers[0].trimStart, .2);
  const raw = await readLocal<any>('songs', id);
  assert.equal(raw.layers[0].blob, undefined);
  const media = await readLocal<{ audioBytes: ArrayBuffer }>(SONG_AUDIO_STORE, [id, raw.layers[0].audioId]);
  assert.deepEqual(media.audioBytes, await content.layers[0].blob!.arrayBuffer());
});

test('a readable duplicate recovers the same take when the layer Blob is unavailable', async () => {
  const content = fixture(), good = content.layers[0].blob!;
  content.layers[0].blob = new Blob([]);
  const id = await seedLegacy(content);
  const { song, audioError } = await openLocalSong(id);
  assert.equal(audioError, undefined);
  assert.equal(song?.layers[0].takeId, 'take-a');
  assert.deepEqual(await song?.layers[0].blob!.arrayBuffer(), await good.arrayBuffer());
});

test('opening or selecting an unreadable local recording for backup leaves the legacy record untouched', async () => {
  const content = fixture();
  const broken = new Blob([]);
  content.layers[0].blob = broken; content.layers[0].takes![0].blob = broken;
  const id = await seedLegacy(content);
  const { song, audioError } = await openLocalSong(id);
  assert.ok(audioError instanceof RecordingReadError);
  assert.equal(song?.title, content.title); assert.equal(song?.layers[0].startAt, 4);
  await assert.rejects(enableBackup(id, 'owner'), RecordingReadError);
  const raw = await readLocal<any>('songs', id);
  assert.equal(raw.revision, 7); assert.equal(raw.ownerId, undefined);
  assert.ok(raw.layers[0].blob instanceof Blob); assert.equal(await getBackup(id), undefined);
});

test('capture bytes remain reusable even if a decoder transfers its input or the Blob cannot be read', async () => {
  const original = new Uint8Array([82,73,70,70]).buffer;
  const blob = recordingBlob(original);
  Object.defineProperty(blob, 'arrayBuffer', { value: async () => { throw new DOMException('Missing file','NotFoundError'); } });
  const decodeInput = await readRecording(blob, 'Guitar');
  structuredClone(decodeInput, { transfer: [decodeInput] });
  assert.equal(decodeInput.byteLength, 0);
  assert.deepEqual(await readRecording(blob, 'Guitar'), original);
});


test('an out-of-space migration leaves the legacy row intact and can still open the readable audio', async () => {
  const content = fixture(), id = await seedLegacy(content);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () { throw new DOMException('Full', 'QuotaExceededError'); };
  try {
    const { song, audioError, protectionError } = await openLocalSong(id);
    assert.equal(audioError, undefined);
    assert.equal((protectionError as Error).name, 'QuotaExceededError');
    assert.deepEqual(await song?.layers[0].blob!.arrayBuffer(), await content.layers[0].blob!.arrayBuffer());
  } finally { IDBObjectStore.prototype.put = put; }
  const raw = await readLocal<any>('songs', id);
  assert.equal(raw.revision, 7); assert.ok(raw.layers[0].blob instanceof Blob);
});
