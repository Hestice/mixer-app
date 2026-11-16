import { storeRecordingContent, restoreRecordingContent, hasLegacyRecordings, RecordingReadError, type StoredSong } from './recording-storage';
import type { RecordArt } from './record-art';
import { clipBounds } from './clip-edits';
import type { Layer } from './session';
import type { MetronomeMode } from './metronome';

export interface SongContent {
  artwork?: RecordArt;
  title: string;
  retakeLayerId?: string;
  layers: Layer[];
  candidate: Layer | null;
  withDemo: boolean;
  volume: number;
  partName: string;
  tempo: number;
  countIn: boolean;
  metronomeMode: MetronomeMode;
}
export interface SavedSong extends SongContent {
  id: string;
  ownerId?: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}
export interface SongSummary {
  artwork?: RecordArt;
  id: string;
  ownerId?: string;
  createdAt: number;
  revision: number;
  title: string;
  updatedAt: number;
  layerCount: number;
  hasTake: boolean;
  duration: number;
}

export class SongConflictError extends Error {
  constructor() { super('This song changed in another tab. Your changes are still here. Download your takes, then reopen the saved song.'); }
}

export function storageMessage(reason: unknown) {
  if (reason instanceof SongConflictError || reason instanceof RecordingReadError) return reason.message;
  if (reason instanceof Error && reason.name === 'QuotaExceededError') return 'This device is out of storage. Download your takes before leaving, free up space, then retry saving.';
  return 'Could not save on this device. Keep this tab open and download your takes, or retry saving.';
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('listening-room', 3);
    request.onupgradeneeded = () => {
      for (const name of ['songs', 'summaries', 'backups', 'settings']) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Close older listening room tabs, then try again.')); };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export async function readLocal<T>(store: string, key?: string): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readonly');
    const request = key === undefined ? transaction.objectStore(store).getAll() : transaction.objectStore(store).get(key);
    transaction.oncomplete = () => { db.close(); resolve(request.result as T); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export async function getSong(id: string) {
  const song = await readLocal<StoredSong | undefined>('songs', id);
  return song ? restoreRecordingContent(song) : undefined;
}
/** Protect old recordings before waveform decoding or any further edits. This is a storage change, not a song revision. */
export async function openLocalSong(id: string, ownerId?: string): Promise<{ song?: SavedSong; audioError?: RecordingReadError; protectionError?: unknown; ownerMismatch?: boolean }> {
  for (;;) {
    const raw = await readLocal<StoredSong | undefined>('songs', id);
    if (!raw) return {};
    if (raw.ownerId && raw.ownerId !== ownerId) return { ownerMismatch: true };
    const song = restoreRecordingContent(raw);
    if (!hasLegacyRecordings(raw)) return { song };
    let protectedSong: StoredSong;
    try { protectedSong = await storeRecordingContent(song); }
    catch (reason) { if (reason instanceof RecordingReadError) return { song, audioError: reason }; throw reason; }
    const protectedCopy = restoreRecordingContent(protectedSong);
    try {
      const db = await openDatabase();
      const promoted = await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction('songs', 'readwrite');
        const store = tx.objectStore('songs');
        const request = store.get(id);
        let unchanged = false;
        let failure: unknown;
        request.onsuccess = () => {
          const current = request.result as StoredSong | undefined;
          unchanged = !!current && current.revision === raw.revision && current.ownerId === raw.ownerId;
          try { if (unchanged && current && hasLegacyRecordings(current)) store.put(protectedSong); }
          catch (reason) { failure = reason; tx.abort(); }
        };
        tx.oncomplete = () => { db.close(); resolve(unchanged); };
        tx.onabort = () => { db.close(); reject(failure ?? tx.error); };
      });
      if (promoted) return { song: protectedCopy };
    } catch (reason) {
      // Keep a playable copy in this tab even if the device has no room for the migration.
      return { song: protectedCopy, protectionError: reason };
    }
    // Another tab wrote a new revision while we copied the samples. Use that revision.
  }
}

export async function listSongs() {
  return (await readLocal<SongSummary[]>('summaries')).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Audio, review state and the library entry commit together. A successful put alone
// is not enough: the UI must wait for the transaction's complete event.
export async function saveSong(id: string, revision: number, content: SongContent, creationOwner?: string): Promise<SavedSong> {
  const stored = await storeRecordingContent(content);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['songs', 'summaries'], 'readwrite');
    let saved: SavedSong;
    let failure: unknown;
    const store = transaction.objectStore('songs');
    const request = store.get(id);
    request.onsuccess = () => {
      const previous = request.result as SavedSong | undefined;
      if ((previous?.revision ?? 0) !== revision) {
        failure = new SongConflictError(); transaction.abort(); return;
      }
      try {
        const now = Date.now();
        saved = { ...content, ownerId: previous ? previous.ownerId : creationOwner, id, revision: revision + 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
        store.put({ ...saved, layers: stored.layers, candidate: stored.candidate });
        const summary = summarizeSong(saved);
        transaction.objectStore('summaries').put(summary);
      } catch (reason) { failure = reason; transaction.abort(); }
    };
    transaction.oncomplete = () => { db.close(); songChanged(); resolve(saved); };
    transaction.onabort = () => { db.close(); reject(failure ?? transaction.error); };
  });
}

/** Serializes edits; a slow older write can never replace a newer one. */
export class SongWriter {
  private tail: Promise<unknown> = Promise.resolve();
  private conflict = false;
  constructor(readonly id: string, private revision = 0, private creationOwner?: string) {}
  write(content: SongContent) {
    const next = this.tail.catch(() => {}).then(async () => {
      if (this.conflict) throw new SongConflictError();
      try {
        const result = await saveSong(this.id, this.revision, content, this.creationOwner);
        this.revision = result.revision;
        return result;
      } catch (reason) {
        if (reason instanceof SongConflictError) this.conflict = true;
        throw reason;
      }
    });
    this.tail = next;
    return next;
  }
}

export function summarizeSong(song: SavedSong): SongSummary {
  return { id: song.id, ownerId: song.ownerId, createdAt: song.createdAt, revision: song.revision,
    artwork: song.artwork, title: song.title.trim() || 'Untitled song', updatedAt: song.updatedAt,
    layerCount: song.layers.length, hasTake: !!song.candidate,
    duration: Math.max(0, ...song.layers.map((layer) => clipBounds(layer).end), song.candidate ? clipBounds(song.candidate).end : 0) };
}

export function songChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('songs-changed'));
}
