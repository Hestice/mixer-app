import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveSong, getSong, SongWriter, type SongContent } from './song-store';
import { enableBackup, getBackup, removeDownloadedCopies } from './backup-store';
import { syncSong, openCloudSong, CloudConflictError, SyncCanceledError, type CloudTransport } from './cloud-sync';
import { makeManifest, downloadManifest, type CloudSong } from './cloud-manifest';
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
