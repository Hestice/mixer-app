import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRecording, RecordingReadError, storeRecordingContent, restoreRecordingContent, replaceLayerAudio } from './recording-storage';
import { saveSong, getSong, readLocal, type SongContent } from './song-store';
import { encodeWav } from './wav';
import { makeManifest, recoverLayerAudio } from './cloud-manifest';
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
 assert.ok(raw.layers[0].audioBytes instanceof ArrayBuffer);assert.ok(raw.candidate.audioBytes instanceof ArrayBuffer);
 const song=(await getSong(id))!;
 assert.deepEqual(await song.layers[0].blob!.arrayBuffer(),await content.layers[0].blob!.arrayBuffer());
 assert.deepEqual(await song.candidate!.takes![0].blob!.arrayBuffer(),await content.candidate.blob!.arrayBuffer());
 assert.equal(song.layers[0].trimStart,.2);assert.equal(song.layers[0].startAt,4);
 assert.equal('audioBytes' in song.layers[0],false,'storage details cannot leak into the cloud manifest');
});
test('a lost browser Blob backing file cannot invalidate previously persisted bytes',async()=>{
 const content=fixture();const source=content.layers[0].blob!;
 const stored=await storeRecordingContent({...content,id:crypto.randomUUID(),revision:1,createdAt:1,updatedAt:1});
 Object.defineProperty(source,'arrayBuffer',{value:async()=>{throw new DOMException('The object can not be found here.','NotFoundError');}});
 await assert.rejects(readRecording(source,'Vocals'),RecordingReadError);
 const restored=restoreRecordingContent(stored);
 assert.ok((await readRecording(restored.layers[0].blob,'Vocals')).byteLength>44);
});
test('an unreadable legacy recording cannot overwrite a previously saved song',async()=>{
 const id=crypto.randomUUID();const content=fixture();await saveSong(id,0,content);
 const broken=new Blob(['unreadable']);Object.defineProperty(broken,'arrayBuffer',{value:async()=>{throw new DOMException('The object can not be found here.','NotFoundError');}});
 await assert.rejects(saveSong(id,1,{...content,layers:[{...content.layers[0],blob:broken}]}), /Vocals.*NotFoundError/);
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
