import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultRecordArt, recordArt, validRecordArt } from './record-art';
import { makeManifest, downloadManifest } from './cloud-manifest';
import { getSong, saveSong, listSongs, type SavedSong } from './song-store';
import 'fake-indexeddb/auto';

const fixture = (): SavedSong => ({ id:crypto.randomUUID(),revision:1,createdAt:1,updatedAt:1,title:'Blue hour',layers:[],candidate:null,withDemo:false,volume:.5,partName:'Guitar',tempo:84,countIn:false,metronomeMode:'off',artwork:{...defaultRecordArt,sleeveColor:'#788b9b',sleeveStyle:'photo',sleevePhoto:'data:image/jpeg;base64,YQ==',labelPhoto:'data:image/jpeg;base64,Yg==',sleeveX:32,labelZoom:1.6,typeface:'serif'} });
test('older songs get a consistent default; malformed artwork cannot become CSS or an external image request',()=>{
 assert.deepEqual(recordArt(),defaultRecordArt);assert.equal(validRecordArt(defaultRecordArt),true);
 for(const patch of [{vinylColor:'url(https://example.com)'},{sleevePhoto:'https://example.com/photo.jpg'},{labelPhoto:'data:image/svg+xml;base64,YQ=='},{labelZoom:5},{sleeveX:NaN},{sleevePhoto:'data:image/jpeg;base64,'+'a'.repeat(220001)}])assert.equal(validRecordArt({...defaultRecordArt,...patch}),false);
});
test('appearance persists in both the song and library summary',async()=>{
 const song=fixture();await saveSong(song.id,0,song);
 assert.deepEqual((await getSong(song.id))?.artwork,song.artwork);
 assert.deepEqual((await listSongs()).find(item=>item.id===song.id)?.artwork,song.artwork);
});
test('cloud backup restores sleeve photo, vinyl label and crop without affecting audio',async()=>{
 const song=fixture();const owner=crypto.randomUUID();let uploads=0;
 const manifest=await makeManifest(song,owner,async()=>{uploads++;});
 const restored=await downloadManifest(manifest,owner,async()=>{throw new Error('No audio expected');});
 assert.equal(uploads,0);assert.deepEqual(restored.artwork,song.artwork);assert.equal(restored.title,song.title);
 await assert.rejects(downloadManifest({...manifest,artwork:{...song.artwork!,labelPhoto:'https://example.com/private'}},owner,async()=>new Blob()),/artwork is invalid/);
 const legacy={...manifest};delete legacy.artwork;
 assert.equal((await downloadManifest(legacy,owner,async()=>new Blob())).artwork,undefined);
});
