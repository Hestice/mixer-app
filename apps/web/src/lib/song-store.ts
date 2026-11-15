import type { Layer } from './session';
import type { MetronomeMode } from './metronome';

export interface SongContent {
  title: string;
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
  if (reason instanceof SongConflictError) return reason.message;
  if (reason instanceof Error && reason.name === 'QuotaExceededError') return 'This device is out of storage. Download your takes before leaving, free up space, then retry saving.';
  return 'Could not save on this device. Keep this tab open and download your takes, or retry saving.';
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('listening-room', 2);
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

export const getSong = (id: string) => readLocal<SavedSong | undefined>('songs', id);
export async function listSongs() {
  return (await readLocal<SongSummary[]>('summaries')).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Audio, review state and the library entry commit together. A successful put alone
// is not enough: the UI must wait for the transaction's complete event.
export async function saveSong(id: string, revision: number, content: SongContent, creationOwner?: string): Promise<SavedSong> {
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
        store.put(saved);
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
    title: song.title.trim() || 'Untitled song', updatedAt: song.updatedAt,
    layerCount: song.layers.length, hasTake: !!song.candidate,
    duration: Math.max(0, ...song.layers.map((layer) => layer.duration ?? 80 / 7), song.candidate?.duration ?? 0) };
}

export function songChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('songs-changed'));
}
