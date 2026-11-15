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
  revision: number;
  createdAt: number;
  updatedAt: number;
}
export interface SongSummary {
  id: string;
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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('listening-room', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('songs', { keyPath: 'id' });
      request.result.createObjectStore('summaries', { keyPath: 'id' });
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

async function read<T>(store: string, key?: string): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readonly');
    const request = key === undefined ? transaction.objectStore(store).getAll() : transaction.objectStore(store).get(key);
    transaction.oncomplete = () => { db.close(); resolve(request.result as T); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export const getSong = (id: string) => read<SavedSong | undefined>('songs', id);
export async function listSongs() {
  return (await read<SongSummary[]>('summaries')).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Audio, review state and the library entry commit together. A successful put alone
// is not enough: the UI must wait for the transaction's complete event.
export async function saveSong(id: string, revision: number, content: SongContent): Promise<SavedSong> {
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
        saved = { ...content, id, revision: revision + 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
        store.put(saved);
        const summary: SongSummary = {
          id, title: content.title.trim() || 'Untitled song', updatedAt: now,
          layerCount: content.layers.length, hasTake: !!content.candidate,
          duration: Math.max(0, ...content.layers.map((layer) => layer.duration ?? 80 / 7), content.candidate?.duration ?? 0),
        };
        transaction.objectStore('summaries').put(summary);
      } catch (reason) { failure = reason; transaction.abort(); }
    };
    transaction.oncomplete = () => { db.close(); resolve(saved); };
    transaction.onabort = () => { db.close(); reject(failure ?? transaction.error); };
  });
}

/** Serializes edits; a slow older write can never replace a newer one. */
export class SongWriter {
  private tail: Promise<unknown> = Promise.resolve();
  private conflict = false;
  constructor(readonly id: string, private revision = 0) {}
  write(content: SongContent) {
    const next = this.tail.catch(() => {}).then(async () => {
      if (this.conflict) throw new SongConflictError();
      try {
        const result = await saveSong(this.id, this.revision, content);
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
