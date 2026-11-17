import type { CloudSong } from './cloud-manifest';
import { lifecycle, type LibraryPatch } from './library-entry';
import { hasLegacyRecordings, recordingReferences, storeRecordingContent, writeSongRecord, SONG_AUDIO_STORE, type StoredSong } from './recording-storage';
import { openDatabase, openLocalSong, readLocal, songChanged, summarizeSong, type SavedSong } from './song-store';

export interface BackupLink {
  id: string;
  ownerId: string;
  remoteId: string;
  remoteRevision: number;
  remoteLibraryRevision?: number;
  syncedLocalRevision: number;
  recovered?: boolean;
  creationDateKnown?: boolean;
  libraryEdit?: { baseRevision: number; revision: number; patch: LibraryPatch };
  attempt?: { commitId: string; localRevision: number };
}
export interface BackupPreference { id: string; enabled: boolean; since: number }
export const listBackups = () => readLocal<BackupLink[]>('backups');
export const getBackup = (id: string) => readLocal<BackupLink | undefined>('backups', id);
export const getBackupPreference = (ownerId: string) => readLocal<BackupPreference | undefined>('settings', ownerId);

export async function setBackupPreference(ownerId: string, enabled: boolean) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ id: ownerId, enabled, since: Date.now() });
    tx.oncomplete = () => { db.close(); songChanged(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

// Claiming a song requires an explicit selection (or the opted-in new-song rule).
// Ownership is separate from musical edits, so claiming doesn't invalidate an editor.
export async function enableBackup(id: string, ownerId: string): Promise<BackupLink> {
  const { audioError, protectionError } = await openLocalSong(id, ownerId, true);
  if (audioError) throw audioError;
  if (protectionError) throw protectionError;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['songs', 'summaries', 'backups'], 'readwrite');
    let result: BackupLink;
    let failure: Error | undefined;
    const request = tx.objectStore('songs').get(id);
    request.onsuccess = () => {
      const song = request.result as StoredSong | undefined;
      if (!song || song.ownerId && song.ownerId !== ownerId) { failure = new Error('This song belongs to another account.'); tx.abort(); return; }
      if (hasLegacyRecordings(song)) { failure = new Error('The song changed while preparing audio. Try backing it up again.'); tx.abort(); return; }
      const existing = tx.objectStore('backups').get(id);
      existing.onsuccess = () => {
        result = existing.result ?? { id, ownerId, remoteId: id, remoteRevision: 0, syncedLocalRevision: 0 };
        song.ownerId = ownerId;
        tx.objectStore('songs').put(song);
        tx.objectStore('summaries').put(summarizeSong(song));
        tx.objectStore('backups').put(result);
      };
    };
    tx.oncomplete = () => { db.close(); songChanged(); resolve(result); };
    tx.onabort = () => { db.close(); reject(failure ?? tx.error); };
  });
}

export async function updateBackup(id: string, update: (current: BackupLink) => BackupLink): Promise<BackupLink> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('backups', 'readwrite');
    let result: BackupLink;
    let failure: unknown;
    const request = tx.objectStore('backups').get(id);
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error('Backup selection is no longer available.');
        result = update(request.result);
        tx.objectStore('backups').put(result);
      } catch (reason) { failure = reason; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); songChanged(); resolve(result); };
    tx.onabort = () => { db.close(); reject(failure ?? tx.error); };
  });
}

// A downloaded song and its synchronization checkpoint become visible together.
// Compare the local revision again after downloading: another tab may have edited it.
export async function installCloudSong(song: SavedSong, link: BackupLink, expectedRevision: number) {
  const stored = await storeRecordingContent(song);
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['songs', 'summaries', 'backups', SONG_AUDIO_STORE], 'readwrite');
    let failure: unknown;
    const request = tx.objectStore('songs').get(song.id);
    request.onsuccess = () => {
      const previous = request.result as StoredSong | undefined;
      if ((previous?.revision ?? 0) !== expectedRevision || previous && previous.ownerId !== link.ownerId) {
        failure = new Error('This song changed locally while downloading. Open it again to keep your latest edits.'); tx.abort(); return;
      }
      try {
        writeSongRecord(tx, stored, previous);
        tx.objectStore('summaries').put(summarizeSong(song));
        tx.objectStore('backups').put(link);
      } catch (reason) { failure = reason; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); songChanged(); resolve(); };
    tx.onabort = () => { db.close(); reject(failure ?? tx.error); };
  });
}

// Mirror cloud library metadata onto clean device copies without downloading audio.
export async function cacheCloudLibrary(ownerId: string, cloudSongs: CloudSong[]) {
  const cloud = new Map(cloudSongs.filter(song => song.owner_id === ownerId).map(song => [song.id, song]));
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['songs', 'summaries', 'backups'], 'readwrite');
    const backups = tx.objectStore('backups');
    const summaries = tx.objectStore('summaries');
    const songs = tx.objectStore('songs');
    let changed = false;
    const request = backups.getAll();
    request.onsuccess = () => {
      for (const link of request.result as BackupLink[]) {
        const remote = cloud.get(link.remoteId);
        if (!remote || link.ownerId !== ownerId || remote.revision < Math.max(link.remoteRevision, link.remoteLibraryRevision ?? 0) || link.libraryEdit || link.attempt) continue;
        const summaryRequest = summaries.get(link.id);
        summaryRequest.onsuccess = () => {
          const summary = summaryRequest.result as ReturnType<typeof summarizeSong> | undefined;
          if (!summary || summary.ownerId !== ownerId || summary.revision !== link.syncedLocalRevision) return;
          const title = link.recovered ? summary.title : remote.content.title.trim() || 'Untitled song';
          const remoteState = lifecycle(remote.content);
          // Deletion is terminal, including against a stale server response.
          const checkpoint = { ...link, remoteLibraryRevision: remote.revision };
          if (lifecycle(summary) === 'deleted' || (title === summary.title && lifecycle(summary) === remoteState)) {
            if (remote.revision > Math.max(link.remoteRevision, link.remoteLibraryRevision ?? 0)) backups.put(checkpoint);
            return;
          }
          const songRequest = songs.get(link.id);
          songRequest.onsuccess = () => {
            const song = songRequest.result as StoredSong | undefined;
            if (!song || song.revision !== summary.revision || song.ownerId !== ownerId) return;
            const next = { ...song, title, archivedAt: remote.content.archivedAt, deletedAt: remote.content.deletedAt, revision: song.revision + 1, updatedAt: Date.parse(remote.updated_at) };
            songs.put(next);
            summaries.put(summarizeSong(next));
            backups.put({ ...checkpoint, syncedLocalRevision: next.revision });
            changed = true;
          };
        };
      }
    };
    tx.oncomplete = () => { db.close(); if (changed) songChanged(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

// Only fully backed-up copies may be removed. Unsynced work is retained.
export async function removeDownloadedCopies(ownerId: string): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['songs', 'summaries', 'backups', SONG_AUDIO_STORE], 'readwrite');
    let count = 0;
    const request = tx.objectStore('backups').getAll();
    request.onsuccess = () => {
      for (const link of request.result as BackupLink[]) {
        if (link.ownerId !== ownerId) continue;
        const songRequest = tx.objectStore('songs').get(link.id);
        songRequest.onsuccess = () => {
          const song = songRequest.result as StoredSong | undefined;
          if (song && song.revision === link.syncedLocalRevision && !link.attempt && !link.libraryEdit) {
            for (const name of ['songs', 'summaries', 'backups']) tx.objectStore(name).delete(link.id);
            for (const audioId of recordingReferences(song)) tx.objectStore(SONG_AUDIO_STORE).delete([link.id, audioId]);
            count++;
          }
        };
      }
    };
    tx.oncomplete = () => { db.close(); songChanged(); resolve(count); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
