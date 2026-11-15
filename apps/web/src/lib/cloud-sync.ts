import { getSong } from './song-store';
import { getBackup, updateBackup, installCloudSong, listBackups } from './backup-store';
import { makeManifest, downloadManifest, manifestAudio, type CloudManifest, type CloudSong } from './cloud-manifest';

export interface CloudTransport {
  get(id: string): Promise<CloudSong | null>;
  list(): Promise<CloudSong[]>;
  upload(path: string, blob: Blob): Promise<void>;
  download(path: string): Promise<Blob>;
  save(id: string, expectedRevision: number, commitId: string, content: CloudManifest): Promise<CloudSong>;
}
export class CloudConflictError extends Error {}
export class SyncCanceledError extends Error {}

// Only completed local revisions enter this queue. An unfinished/failed upload
// never changes the last published manifest or the local autosave result.
export async function syncSong(id: string, ownerId: string, remote: CloudTransport, active: () => boolean = () => true) {
  const check = () => { if (!active()) throw new SyncCanceledError('Backup paused.'); };
  check();
  let link = await getBackup(id);
  const song = await getSong(id);
  if (!link || !song || link.ownerId !== ownerId || song.ownerId !== ownerId) return;
  if (song.revision <= link.syncedLocalRevision) return;
  const cloud = await remote.get(link.remoteId);
  check();
  if (cloud && cloud.owner_id !== ownerId) throw new Error('The cloud song belongs to another account.');
  const publishedAudio = new Set(cloud ? manifestAudio(cloud.content).map((audio) => audio.path) : []);
  // A response may have been lost after the server committed. Acknowledge that
  // exact operation before considering a fork or uploading a newer local edit.
  if (link.attempt && cloud?.commit_id === link.attempt.commitId) {
    const acknowledged = link;
    link = await updateBackup(id, (current) => {
      if (current.remoteId !== acknowledged.remoteId || current.attempt?.commitId !== acknowledged.attempt!.commitId) throw new SyncCanceledError();
      return { ...current, remoteRevision: cloud.revision, syncedLocalRevision: acknowledged.attempt!.localRevision, attempt: undefined };
    });
    if (song.revision <= link.syncedLocalRevision) return;
  }
  if ((cloud?.revision ?? 0) !== link.remoteRevision) {
    const previousId = link.remoteId;
    link = await updateBackup(id, (current) => {
      if (current.remoteId !== previousId) throw new SyncCanceledError();
      return { ...current, remoteId: crypto.randomUUID(), remoteRevision: 0, syncedLocalRevision: 0, recovered: true, attempt: undefined };
    });
  }
  check();
  const remoteId = link.remoteId;
  link = await updateBackup(id, (current) => {
    if (current.remoteId !== remoteId || current.ownerId !== ownerId) throw new SyncCanceledError();
    const attempt = current.attempt?.localRevision === song.revision ? current.attempt : { commitId: crypto.randomUUID(), localRevision: song.revision };
    return { ...current, attempt };
  });
  const attempt = link.attempt!;
  const manifest = await makeManifest(song, ownerId, async (path, blob) => { check(); if (!publishedAudio.has(path)) await remote.upload(path, blob); check(); }, link.recovered);
  check();
  let result: CloudSong;
  try { result = await remote.save(link.remoteId, link.remoteRevision, attempt.commitId, manifest); }
  catch (reason) {
    // Another device may publish between GET and SAVE. Keep the attempt in the
    // durable queue; the next pass reads the new revision and forks if necessary.
    if (reason instanceof CloudConflictError) return;
    throw reason;
  }
  check();
  await updateBackup(id, (current) => {
    if (current.remoteId !== remoteId || current.attempt?.commitId !== attempt.commitId) throw new SyncCanceledError();
    return { ...current, remoteRevision: result.revision, syncedLocalRevision: song.revision, attempt: undefined };
  });
}

export async function openCloudSong(remoteId: string, ownerId: string, remote: CloudTransport, active: () => boolean = () => true) {
  const check = () => { if (!active()) throw new SyncCanceledError('Sign in again to open this song.'); };
  check();
  const link = (await listBackups()).find((item) => item.ownerId === ownerId && item.remoteId === remoteId);
  const local = link ? await getSong(link.id) : undefined;
  // An offline or dirty local copy is always usable. Never replace unsynced work.
  if (local && link && local.revision > link.syncedLocalRevision) return local.id;
  let cloud: CloudSong | null;
  try { cloud = await remote.get(remoteId); }
  catch (reason) { check(); if (local) return local.id; throw reason; }
  check();
  if (!cloud) { if (local) return local.id; throw new Error('This cloud song is unavailable.'); }
  if (cloud.owner_id !== ownerId) throw new Error('This song belongs to another account.');
  if (local && link && cloud.revision <= link.remoteRevision) return local.id;
  const content = await downloadManifest(cloud.content, ownerId, async (path) => { check(); return remote.download(path); });
  check();
  const id = local?.id ?? crypto.randomUUID();
  const revision = (local?.revision ?? 0) + 1;
  await installCloudSong({ ...content, id, revision, ownerId, createdAt: local?.createdAt ?? Date.now(), updatedAt: Date.parse(cloud.updated_at) },
    { id, ownerId, remoteId, remoteRevision: cloud.revision, syncedLocalRevision: revision }, local?.revision ?? 0);
  return id;
}
