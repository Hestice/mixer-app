import { libraryEdit, lifecycle, type LibraryAction, type LibraryPatch } from './library-entry';
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

async function saveLibraryPatch(cloud: CloudSong, patch: LibraryPatch, remote: CloudTransport) {
  if (lifecycle(cloud.content) === 'deleted') return cloud;
  const content = { ...cloud.content, ...patch };
  if (content.title === cloud.content.title && content.archivedAt === cloud.content.archivedAt
    && content.deletedAt === cloud.content.deletedAt) return cloud;
  return remote.save(cloud.id, cloud.revision, crypto.randomUUID(), content);
}

export async function updateCloudSong(id: string, revision: number, ownerId: string, action: LibraryAction, remote: CloudTransport) {
  const song = await remote.get(id);
  if (!song || song.owner_id !== ownerId || song.revision !== revision) throw new Error('This song changed. Refresh My songs and try again.');
  return saveLibraryPatch(song, libraryEdit(song.content, action), remote);
}

// Only completed local revisions enter this queue. An unfinished/failed upload
// never changes the last published manifest or the local autosave result.
export async function syncSong(id: string, ownerId: string, remote: CloudTransport, active: () => boolean = () => true) {
  const check = () => { if (!active()) throw new SyncCanceledError('Backup paused.'); };
  check();
  let link = await getBackup(id);
  const song = await getSong(id);
  if (!link || !song || link.ownerId !== ownerId || song.ownerId !== ownerId) return;
  if (song.revision <= link.syncedLocalRevision && !link.libraryEdit) return;
  let cloud = await remote.get(link.remoteId);
  check();
  if (cloud && cloud.owner_id !== ownerId) throw new Error('The cloud song belongs to another account.');
  const publishedAudio = new Set(cloud ? manifestAudio(cloud.content).map((audio) => audio.path) : []);
  // A response may have been lost after the server committed. Acknowledge that
  // exact operation before considering a fork or uploading a newer local edit.
  if (link.attempt && cloud?.commit_id === link.attempt.commitId) {
    const publishedRevision = cloud.revision;
    const acknowledged = link;
    link = await updateBackup(id, (current) => {
      if (current.remoteId !== acknowledged.remoteId || current.attempt?.commitId !== acknowledged.attempt!.commitId) throw new SyncCanceledError();
      return { ...current, remoteRevision: publishedRevision, syncedLocalRevision: acknowledged.attempt!.localRevision, attempt: undefined,
        libraryEdit: current.libraryEdit && current.libraryEdit.revision > acknowledged.attempt!.localRevision ? current.libraryEdit : undefined };
    });
    if (song.revision <= link.syncedLocalRevision && !link.libraryEdit) return;
  }
  if (cloud && link.libraryEdit) {
    const edit = link.libraryEdit;
    const before = cloud;
    try { cloud = await saveLibraryPatch(before, edit.patch, remote); }
    catch (reason) { if (reason instanceof CloudConflictError) return; throw reason; }
    check();
    const publishedRevision = cloud.revision;
    const metadataOnly = link.syncedLocalRevision >= edit.baseRevision && song.revision === edit.revision;
    link = await updateBackup(id, (current) => {
      if (current.remoteId !== before.id || current.ownerId !== ownerId) throw new SyncCanceledError();
      return { ...current,
        // Leave an advanced cloud content revision to be downloaded when the song opens.
        remoteRevision: current.remoteRevision === before.revision ? publishedRevision : current.remoteRevision,
        syncedLocalRevision: metadataOnly ? Math.max(current.syncedLocalRevision, edit.revision) : current.syncedLocalRevision,
        libraryEdit: current.libraryEdit?.revision === edit.revision ? undefined : current.libraryEdit,
      };
    });
    if (metadataOnly) return;
  }
  const cloudLifecycle = cloud && cloud.revision > link.remoteRevision ? cloud.content : undefined;
  if ((cloud?.revision ?? 0) !== link.remoteRevision) {
    const previousId = link.remoteId;
    link = await updateBackup(id, (current) => {
      if (current.remoteId !== previousId) throw new SyncCanceledError();
      return { ...current, remoteId: crypto.randomUUID(), remoteRevision: 0, remoteLibraryRevision: undefined, syncedLocalRevision: 0, recovered: true, attempt: undefined };
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
  const contents = cloudLifecycle && lifecycle(cloudLifecycle) !== 'active'
    ? { ...song, archivedAt: cloudLifecycle.archivedAt, deletedAt: cloudLifecycle.deletedAt ?? song.deletedAt } : song;
  const manifest = await makeManifest(contents, ownerId, async (path, blob) => { check(); if (!publishedAudio.has(path)) await remote.upload(path, blob); check(); }, link.recovered);
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
    return { ...current, remoteRevision: result.revision, syncedLocalRevision: song.revision, attempt: undefined,
      libraryEdit: current.libraryEdit && current.libraryEdit.revision > song.revision ? current.libraryEdit : undefined };
  });
}

export async function openCloudSong(remoteId: string, ownerId: string, remote: CloudTransport, active: () => boolean = () => true) {
  const check = () => { if (!active()) throw new SyncCanceledError('Sign in again to open this song.'); };
  check();
  const link = (await listBackups()).find((item) => item.ownerId === ownerId && item.remoteId === remoteId);
  const local = link ? await getSong(link.id) : undefined;
  function assertAvailable(content: Pick<CloudManifest, 'archivedAt' | 'deletedAt'>) {
    const state = lifecycle(content);
    if (state === 'archived') throw new Error('Restore this song from the archive to open it.');
    if (state === 'deleted') throw new Error('This song has been deleted.');
  }
  const openLocal = (song: NonNullable<typeof local>) => { assertAvailable(song); return song.id; };
  // An offline or dirty local copy is always usable. Never replace unsynced work.
  if (local && link && local.revision > link.syncedLocalRevision) return openLocal(local);
  let cloud: CloudSong | null;
  try { cloud = await remote.get(remoteId); }
  catch (reason) { check(); if (local) return openLocal(local); throw reason; }
  check();
  if (!cloud) { if (local) return openLocal(local); throw new Error('This cloud song is unavailable.'); }
  if (cloud.owner_id !== ownerId) throw new Error('This song belongs to another account.');
  assertAvailable(cloud.content);
  if (local && link && cloud.revision <= link.remoteRevision) return openLocal(local);
  const content = await downloadManifest(cloud.content, ownerId, async (path) => { check(); return remote.download(path); });
  check();
  const id = local?.id ?? crypto.randomUUID();
  const revision = (local?.revision ?? 0) + 1;
  await installCloudSong({ ...content, id, revision, ownerId, createdAt: local?.createdAt ?? Date.now(), updatedAt: Date.parse(cloud.updated_at) },
    { id, ownerId, remoteId, remoteRevision: cloud.revision, syncedLocalRevision: revision }, local?.revision ?? 0);
  return id;
}
