import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveSong, getSong, openLocalSong, SongWriter, updateSavedSong, type SongContent } from './song-store';
import { cacheCloudLibrary, enableBackup, getBackup, removeDownloadedCopies } from './backup-store';
import { syncSong, openCloudSong, updateCloudSong, CloudConflictError, SyncCanceledError, type CloudTransport } from './cloud-sync';
import { makeManifest, downloadManifest, type CloudSong } from './cloud-manifest';
import { appendTake, editClip, selectTake } from './clip-edits';
import { encodeWav } from './wav';

const content = (): SongContent => ({ title: 'Evening', layers: [], candidate: { id: crypto.randomUUID(), name: 'Voice', kind: 'recording', recorded: true, enabled: true, volume: .8, duration: 1, peaks: [.3], blob: encodeWav(new Float32Array([.2, -.4, .6]), 44100) }, withDemo: false, volume: .6, partName: 'Voice', tempo: 84, countIn: true, metronomeMode: 'visual' });
function transport(owner: string) {
  const songs = new Map<string, CloudSong>(), audio = new Map<string, Blob>();
  const remote: CloudTransport = {
    async get(id) { return songs.get(id) ?? null; },
    async list() { return [...songs.values()]; },
    async upload(path, blob) { audio.set(path, blob); },
    async download(path) { if (!audio.has(path)) throw new Error('Missing audio'); return audio.get(path)!; },
    async save(id, revision, commitId, manifest) {
      const previous = songs.get(id);
      if (previous?.commit_id === commitId) return previous;
      if ((previous?.revision ?? 0) !== revision) throw new CloudConflictError();
      const saved: CloudSong = { id, owner_id: owner, revision: revision + 1, commit_id: commitId, content: manifest, updated_at: new Date().toISOString() };
      songs.set(id, saved); return saved;
    },
  };
  return { remote, songs, audio };
}
async function fixture() {
  const owner = crypto.randomUUID(), id = crypto.randomUUID();
  const song = await saveSong(id, 0, content());
  await enableBackup(id, owner);
  return { owner, id, song, ...transport(owner) };
}

test('only selected songs upload, including the unkept take and exact WAV bytes', async () => {
  const owner = crypto.randomUUID(), id = crypto.randomUUID(), state = content(), { remote, songs, audio } = transport(owner);
  await saveSong(id, 0, state);
  await syncSong(id, owner, remote); assert.equal(songs.size, 0);
  await enableBackup(id, owner); await syncSong(id, owner, remote);
  assert.equal(songs.get(id)?.content.layers.length, 0);
  const recording = songs.get(id)!.content.candidate!.audio!;
  assert.deepEqual(await audio.get(recording.path)!.arrayBuffer(), await state.candidate!.blob!.arrayBuffer());
  assert.equal((await getBackup(id))?.syncedLocalRevision, 1);
  assert.equal((await getSong(id))?.ownerId, owner);
});

test('a failed upload never publishes a manifest or changes the local recording', async () => {
  const f = await fixture();
  f.remote.upload = async () => { throw new Error('Network offline'); };
  await assert.rejects(syncSong(f.id, f.owner, f.remote));
  assert.equal(f.songs.size, 0); assert.equal((await getBackup(f.id))?.syncedLocalRevision, 0);
  assert.ok((await getSong(f.id))?.candidate?.blob);
  f.remote.upload = async (path, blob) => { f.audio.set(path, blob); };
  await syncSong(f.id, f.owner, f.remote);
  assert.equal(f.songs.size, 1);
});

test('a lost commit response resumes without duplicating a song', async () => {
  const f = await fixture(), save = f.remote.save;
  f.remote.save = async (...args) => { await save(...args); throw new Error('Response lost'); };
  await assert.rejects(syncSong(f.id, f.owner, f.remote));
  assert.equal((await getBackup(f.id))?.syncedLocalRevision, 0);
  f.remote.save = save;
  await syncSong(f.id, f.owner, f.remote);
  assert.equal(f.songs.size, 1); assert.equal(f.songs.get(f.id)?.revision, 1);
  assert.equal((await getBackup(f.id))?.syncedLocalRevision, 1);
});

test('an edit during upload stays pending until its own revision reaches the cloud', async () => {
  const f = await fixture(), upload = f.remote.upload;
  f.remote.upload = async (...args) => { await upload(...args); await saveSong(f.id, 1, { ...f.song, title: 'Newer local edit' }); };
  await syncSong(f.id, f.owner, f.remote);
  assert.equal((await getBackup(f.id))?.syncedLocalRevision, 1);
  assert.equal((await getSong(f.id))?.revision, 2);
  f.remote.upload = upload; await syncSong(f.id, f.owner, f.remote);
  assert.equal(f.songs.get(f.id)?.content.title, 'Newer local edit');
  assert.equal((await getBackup(f.id))?.syncedLocalRevision, 2);
});

test('conflicting edits become a separate version and preserve the remote original', async () => {
  const f = await fixture(); await syncSong(f.id, f.owner, f.remote);
  const original = f.songs.get(f.id)!;
  f.songs.set(f.id, { ...original, revision: 2, commit_id: crypto.randomUUID(), content: { ...original.content, title: 'Other device' } });
  await saveSong(f.id, 1, { ...f.song, title: 'This device' });
  await syncSong(f.id, f.owner, f.remote);
  assert.equal(f.songs.size, 2); assert.equal(f.songs.get(f.id)?.content.title, 'Other device');
  const link = (await getBackup(f.id))!;
  assert.notEqual(link.remoteId, f.id); assert.equal(link.recovered, true);
  assert.equal(f.songs.get(link.remoteId)?.content.title, 'This device · Recovered version');
  assert.equal((await getSong(f.id))?.revision, 2);
});

test('cross-device open downloads all audio before installing the local song', async () => {
  const f = await fixture(); await syncSong(f.id, f.owner, f.remote);
  const copiedId = crypto.randomUUID(); f.songs.set(copiedId, { ...f.songs.get(f.id)!, id: copiedId });
  const id = await openCloudSong(copiedId, f.owner, f.remote);
  const reopened = (await getSong(id))!;
  assert.equal(reopened.ownerId, f.owner); assert.equal(reopened.candidate?.name, 'Voice');
  assert.equal(reopened.createdAt, f.song.createdAt);
  assert.equal((await getBackup(id))?.creationDateKnown, true);
  assert.deepEqual(await reopened.candidate!.blob!.arrayBuffer(), await f.song.candidate!.blob!.arrayBuffer());
  assert.equal((await getBackup(id))?.syncedLocalRevision, reopened.revision);
});

test('damaged downloads leave a good local copy intact', async () => {
  const f = await fixture(); await syncSong(f.id, f.owner, f.remote);
  f.songs.set(f.id, { ...f.songs.get(f.id)!, revision: 2 });
  f.remote.download = async () => new Blob(['broken']);
  await assert.rejects(openCloudSong(f.id, f.owner, f.remote), /completely/);
  assert.equal((await getSong(f.id))?.revision, 1);
});

test('account switches cannot continue uploading or claim another account’s song', async () => {
  const f = await fixture(); let active = true;
  f.remote.upload = async () => { active = false; };
  await assert.rejects(syncSong(f.id, f.owner, f.remote, () => active), SyncCanceledError);
  assert.equal(f.songs.size, 0);
  await assert.rejects(enableBackup(f.id, crypto.randomUUID()), /another account/);
  await syncSong(f.id, crypto.randomUUID(), f.remote); assert.equal(f.songs.size, 0);
});

test('download cannot overwrite a local edit made while fetching recordings', async () => {
  const f = await fixture(); await syncSong(f.id, f.owner, f.remote);
  f.songs.set(f.id, { ...f.songs.get(f.id)!, revision: 2 });
  const download = f.remote.download;
  f.remote.download = async (path) => { await saveSong(f.id, 1, { ...f.song, title: 'Keep this edit' }); return download(path); };
  await assert.rejects(openCloudSong(f.id, f.owner, f.remote), /changed locally/);
  assert.equal((await getSong(f.id))?.title, 'Keep this edit');
});

test('removing downloaded copies retains unsynced takes and other accounts', async () => {
  const f = await fixture(), other = await fixture(); await syncSong(f.id, f.owner, f.remote);
  const dirty = crypto.randomUUID(); await saveSong(dirty, 0, content()); await enableBackup(dirty, f.owner);
  assert.equal(await removeDownloadedCopies(f.owner), 1);
  assert.equal(await getSong(f.id), undefined); assert.ok(await getSong(dirty)); assert.ok(await getSong(other.id));
});

test('new-song auto backup binds only the account explicitly captured at creation', async () => {
  const owner = crypto.randomUUID(), id = crypto.randomUUID(), writer = new SongWriter(id, 0, owner);
  await writer.write(content()); await writer.write({ ...content(), title: 'Still owned' });
  assert.equal((await getSong(id))?.ownerId, owner);
  const guest = await saveSong(crypto.randomUUID(), 0, content()); assert.equal(guest.ownerId, undefined);
});

test('foreign recording references are rejected before any download', async () => {
  const f = await fixture(); const manifest = await makeManifest(f.song, f.owner, async () => {});
  manifest.candidate!.audio!.path = `someone-else/${manifest.candidate!.audio!.sha256}.wav`;
  let downloads = 0;
  await assert.rejects(downloadManifest(manifest, f.owner, async () => { downloads++; return new Blob(); }), /invalid/);
  assert.equal(downloads, 0);
});


test('mix and title edits reuse published immutable audio instead of uploading it again', async () => {
  const f = await fixture(), upload = f.remote.upload;
  let uploads = 0;
  f.remote.upload = async (...args) => { uploads++; await upload(...args); };
  await syncSong(f.id, f.owner, f.remote);
  await saveSong(f.id, 1, { ...f.song, title: 'Renamed song', volume: .2 });
  await syncSong(f.id, f.owner, f.remote);
  assert.equal(uploads, 1);
  assert.equal(f.songs.get(f.id)?.content.title, 'Renamed song');
  assert.equal((await getBackup(f.id))?.syncedLocalRevision, 2);
});


test('all takes, edits, and a pending replacement survive autosave and cloud restore', async () => {
  const f = await fixture();
  const first = editClip(f.song.candidate!, { trimStart: .1, trimEnd: .8, startAt: 2 });
  const second = editClip(appendTake(first, { id: 'alternative', duration: 2, blob: encodeWav(new Float32Array([.1, .3]), 44100), peaks: [.8] }), { trimStart: .2, trimEnd: 1.6, startAt: 4 });
  await saveSong(f.id, 1, { ...f.song, layers: [first], candidate: second, retakeLayerId: first.id });
  const local = (await getSong(f.id))!; assert.equal(local.candidate?.takes?.length, 2);
  await syncSong(f.id, f.owner, f.remote);
  assert.equal(f.audio.size, 2, 'shared originals upload only once');
  assert.equal(f.songs.get(f.id)?.content.version, 2);
  const restored = await downloadManifest(f.songs.get(f.id)!.content, f.owner, f.remote.download);
  assert.equal(restored.retakeLayerId, first.id); assert.equal(restored.candidate?.takes?.length, 2);
  assert.equal(restored.candidate?.startAt, 4); assert.equal(restored.candidate?.trimEnd, 1.6);
  const old = selectTake(restored.candidate!, first.id);
  assert.equal(old.startAt, 2); assert.equal(old.trimStart, .1);
  assert.deepEqual(await old.blob!.arrayBuffer(), await first.blob!.arrayBuffer());
  let uploads = 0; f.remote.upload = async () => { uploads++; };
  await saveSong(f.id, 2, { ...local, candidate: editClip(second, { startAt: 8 }) });
  await syncSong(f.id, f.owner, f.remote); assert.equal(uploads, 0);
});
test('failure uploading a nonselected take leaves the previous cloud revision and all local takes intact', async () => {
  const f = await fixture(); await syncSong(f.id, f.owner, f.remote);
  const multiple = appendTake(f.song.candidate!, { id: 'new', duration: 1, blob: new Blob(['new audio']) });
  await saveSong(f.id, 1, { ...f.song, candidate: selectTake(multiple, f.song.candidate!.id) });
  f.remote.upload = async () => { throw new Error('offline'); };
  await assert.rejects(syncSong(f.id, f.owner, f.remote));
  assert.equal(f.songs.get(f.id)?.revision, 1); assert.equal((await getSong(f.id))?.candidate?.takes?.length, 2);
});
test('legacy cloud recordings still restore and invalid alternate references cannot download', async () => {
  const f = await fixture(); const manifest = await makeManifest(f.song, f.owner, f.remote.upload);
  const legacy = structuredClone(manifest); legacy.version = 1; delete legacy.candidate!.takes; delete legacy.candidate!.takeId;
  assert.ok((await downloadManifest(legacy, f.owner, f.remote.download)).candidate?.blob);
  manifest.candidate!.takes![0].audio!.path = 'foreign/audio.wav'; let downloads = 0;
  await assert.rejects(downloadManifest(manifest, f.owner, async () => { downloads++; return new Blob(); }), /invalid/);
  assert.equal(downloads, 0);
});

test('an offline archive updates the original cloud row while preserving newer cloud audio and edits', async () => {
  const f = await fixture(); await syncSong(f.id, f.owner, f.remote);
  const cloud = f.songs.get(f.id)!;
  const newer = { ...cloud, revision: cloud.revision + 1, commit_id: crypto.randomUUID(), content: { ...cloud.content, volume: .15 } };
  f.songs.set(f.id, newer);
  f.remote.upload = async () => { throw new Error('Metadata sync must not upload audio'); };
  f.remote.download = async () => { throw new Error('Metadata sync must not download audio'); };
  const archived = await updateSavedSong(f.id, f.song.revision, f.owner, { type: 'archive' });
  await syncSong(f.id, f.owner, f.remote);
  const published = f.songs.get(f.id)!;
  assert.equal(f.songs.size, 1);
  assert.equal(published.content.archivedAt, archived.archivedAt);
  assert.equal(published.content.volume, .15);
  assert.deepEqual(published.content.candidate, newer.content.candidate);
  assert.equal((await getBackup(f.id))?.libraryEdit, undefined);
  assert.equal((await getBackup(f.id))?.remoteRevision, cloud.revision, 'newer cloud content remains available on next open');
});

test('cloud-only restore and delete keep audio and mirror lifecycle onto a cached device', async () => {
  const f = await fixture(); await syncSong(f.id, f.owner, f.remote);
  const original = f.songs.get(f.id)!;
  const archived = await updateCloudSong(f.id, original.revision, f.owner, { type: 'archive' }, f.remote);
  await cacheCloudLibrary(f.owner, [archived]);
  assert.equal((await openLocalSong(f.id, f.owner)).unavailable, 'archived');
  const restored = await updateCloudSong(f.id, archived.revision, f.owner, { type: 'restore' }, f.remote);
  await cacheCloudLibrary(f.owner, [restored]);
  await cacheCloudLibrary(f.owner, [archived]);
  assert.ok((await openLocalSong(f.id, f.owner)).song);
  const archivedAgain = await updateCloudSong(f.id, restored.revision, f.owner, { type: 'archive' }, f.remote);
  const deleted = await updateCloudSong(f.id, archivedAgain.revision, f.owner, { type: 'delete' }, f.remote);
  await cacheCloudLibrary(f.owner, [deleted]);
  await cacheCloudLibrary(f.owner, [restored]);
  assert.ok(deleted.content.deletedAt);
  assert.equal((await openLocalSong(f.id, f.owner)).unavailable, 'deleted');
  await assert.rejects(openCloudSong(f.id, f.owner, f.remote), /deleted/);
  assert.equal(f.songs.size, 1);
  assert.deepEqual(deleted.content.candidate, original.content.candidate);
  assert.equal(f.audio.size, 1);
});

test('archived and directly deleted layers retain takes, timing and color in cloud backup', async () => {
  const f = await fixture(), now = Date.now();
  const first = editClip(f.song.candidate!, { trimStart: .1, startAt: 3 });
  const alternate = appendTake(first, { id: 'replacement', duration: 2, blob: encodeWav(new Float32Array([.3, .4]), 44100) });
  await saveSong(f.id, 1, { ...f.song, beatOffset: .28, layers: [
    { ...alternate, archivedAt: now, color: 'clay' },
    { ...first, id: 'deleted', deletedAt: now, color: 'teal' },
  ], candidate: null });
  await syncSong(f.id, f.owner, f.remote);
  const restored = await downloadManifest(f.songs.get(f.id)!.content, f.owner, f.remote.download);
  assert.equal(restored.beatOffset, .28);
  assert.equal(restored.layers[0].archivedAt, now);
  assert.equal(restored.layers[0].takes?.length, 2);
  assert.equal(selectTake(restored.layers[0], first.id).startAt, 3);
  assert.equal(restored.layers[0].color, 'clay');
  assert.equal(restored.layers[1].color, 'teal');
  assert.equal(restored.layers[1].archivedAt, undefined);
  assert.equal(restored.layers[1].deletedAt, now);
  assert.deepEqual(await restored.layers[1].blob!.arrayBuffer(), await first.blob!.arrayBuffer());
});
