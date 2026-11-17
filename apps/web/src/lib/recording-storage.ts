import type { Layer, RecordingTake } from './session';
import type { SavedSong, SongContent } from './song-store';

interface StoredAudio { audioBytes?: ArrayBuffer; audioId?: string; audioType?: string; blob?: Blob }
type StoredTake = Omit<RecordingTake, 'blob'> & StoredAudio;
type StoredLayer = Omit<Layer, 'blob' | 'takes'> & StoredAudio & { takes?: StoredTake[] };
export type StoredSong = Omit<SavedSong, 'layers' | 'candidate'> & { layers: StoredLayer[]; candidate: StoredLayer | null };
const bytes = new WeakMap<Blob, Promise<ArrayBuffer>>();
const audioIds = new WeakMap<ArrayBuffer, string>();
export const SONG_AUDIO_STORE = 'song-audio';
type SongAudio = { songId: string; audioId: string; audioBytes: ArrayBuffer };
export const MAX_BACKUP_AUDIO_BYTES = 50 * 1024 * 1024;

export class RecordingReadError extends Error {
  constructor(readonly layerName: string, cause?: unknown) {
    super(`Could not read the saved audio for “${layerName}”${cause instanceof Error ? ` (${cause.name})` : ''}. Keep this tab open; your song edits have not been removed.`, { cause });
    this.name = 'RecordingReadError';
  }
}
async function savedBytes(blob: Blob, name: string) {
  let pending = bytes.get(blob);
  if (!pending) {
    pending = (async () => {
      try {
        const data = await blob.arrayBuffer();
        if (!data.byteLength) throw new Error('Empty recording');
        return data;
      } catch (reason) { throw new RecordingReadError(name, reason); }
    })().catch(reason => { bytes.delete(blob); throw reason; });
    bytes.set(blob, pending);
  }
  return pending;
}

export async function readRecording(blob: Blob | undefined, name: string) {
  if (!blob) throw new RecordingReadError(name);
  // decodeAudioData can detach its input. Keep the saved bytes reusable.
  return (await savedBytes(blob, name)).slice(0);
}

export function recordingBlob(data: ArrayBuffer, type = 'audio/wav') {
  if (!data.byteLength) throw new Error('Empty recording');
  const blob = new Blob([data], { type });
  bytes.set(blob, Promise.resolve(data));
  return blob;
}

export function recordingCopies(layer: Layer, takeId: string) {
  const primary = (layer.takeId ?? layer.id) === takeId ? layer.blob : undefined;
  const alternate = layer.takes?.find(take => take.id === takeId)?.blob;
  return [...new Set([primary, alternate])].filter((blob): blob is Blob => !!blob);
}

async function storeAudio(copies: Blob[], name: string) {
  let failure = new RecordingReadError(name);
  for (const blob of copies) {
    try { return { audioBytes: await savedBytes(blob, name), audioType: blob.type || 'audio/wav' }; }
    catch (reason) { if (reason instanceof RecordingReadError) failure = reason; else throw reason; }
  }
  throw failure;
}

/** IndexedDB stores the bytes, not references to browser-managed Blob files. */
export async function storeRecordingContent<T extends SongContent>(song: T) {
  async function layer(value: Layer): Promise<StoredLayer> {
    const { takes, blob, ...rest } = value;
    const selected = value.takeId ?? value.id;
    const audio = value.recorded || blob ? await storeAudio(recordingCopies(value, selected), value.name) : {};
    const alternatives = takes ? await Promise.all(takes.map(async ({ blob: takeBlob, ...take }): Promise<StoredTake> => ({
      ...take,
      ...(take.id === selected ? audio : await storeAudio(takeBlob ? [takeBlob] : [], value.name)),
    }))) : undefined;
    return { ...rest, ...audio, ...(alternatives ? { takes: alternatives } : {}) };
  }
  return { ...song, layers: await Promise.all(song.layers.map(layer)), candidate: song.candidate ? await layer(song.candidate) : null };
}

export function hasLegacyRecordings(song: StoredSong) {
  return [...song.layers, ...(song.candidate ? [song.candidate] : [])].some(layer =>
    ((layer.recorded || layer.blob) && !layer.audioId && !layer.audioBytes?.byteLength) ||
    layer.takes?.some(take => !take.audioId && !take.audioBytes?.byteLength));
}

export function recordingReferences(song?: StoredSong) {
  const ids = new Set<string>();
  if (!song) return ids;
  for (const layer of [...song.layers, ...(song.candidate ? [song.candidate] : [])]) {
    if (layer.audioId) ids.add(layer.audioId);
    for (const take of layer.takes ?? []) if (take.audioId) ids.add(take.audioId);
  }
  return ids;
}

// Keep each take below the IndexedDB record size limit even when the song contains many takes.
// The metadata and audio share a transaction so readers only see complete revisions.
export function writeSongRecord(transaction: IDBTransaction, song: StoredSong, previous?: StoredSong) {
  const recordings = transaction.objectStore(SONG_AUDIO_STORE);
  const previousIds = recordingReferences(previous);
  const nextIds = new Set<string>();
  function separate<T extends StoredAudio>({ audioBytes, ...rest }: T) {
    if (!audioBytes) return rest;
    let audioId = audioIds.get(audioBytes);
    if (!audioId) { audioId = crypto.randomUUID(); audioIds.set(audioBytes, audioId); }
    if (!previousIds.has(audioId) && !nextIds.has(audioId)) recordings.put({ songId: song.id, audioId, audioBytes } satisfies SongAudio);
    nextIds.add(audioId);
    return { ...rest, audioId };
  }
  function layer({ takes, ...value }: StoredLayer): StoredLayer {
    return { ...separate(value), ...(takes ? { takes: takes.map(separate) } : {}) };
  }
  transaction.objectStore('songs').put({ ...song, layers: song.layers.map(layer), candidate: song.candidate ? layer(song.candidate) : null });
  for (const id of previousIds) if (!nextIds.has(id)) recordings.delete([song.id, id]);
}

export function readSongAudio(transaction: IDBTransaction, song: StoredSong) {
  const audio = new Map<string, ArrayBuffer>();
  const recordings = transaction.objectStore(SONG_AUDIO_STORE);
  for (const id of recordingReferences(song)) {
    const request = recordings.get([song.id, id]);
    request.onsuccess = () => {
      const record = request.result as SongAudio | undefined;
      if (record) audio.set(id, record.audioBytes);
    };
  }
  return audio;
}

export function restoreRecordingContent(song: StoredSong, recordings?: Map<string, ArrayBuffer>): SavedSong {
  const restored = new WeakMap<ArrayBuffer, Blob>();
  function audio<T extends StoredAudio>(value: T) {
    const { audioBytes, audioId, audioType, ...rest } = value;
    const data = audioId ? recordings?.get(audioId) : audioBytes;
    if (!data?.byteLength) return rest;
    let blob = restored.get(data);
    if (!blob) {
      if (audioId) audioIds.set(data, audioId);
      restored.set(data, blob = recordingBlob(data, audioType));
    }
    return { ...rest, blob };
  }
  function layer(value: StoredLayer): Layer {
    const { takes, ...rest } = value;
    return { ...audio(rest), ...(takes ? { takes: takes.map(audio) } : {}) };
  }
  return { ...song, layers: song.layers.map(layer), candidate: song.candidate ? layer(song.candidate) : null };
}

/** Only replace audio bytes, never the current take selection or local edit metadata. */
export function replaceLayerAudio(layer: Layer, replacements: Map<string, Blob>): Layer {
  const selected = layer.takeId ?? layer.id;
  return { ...layer, blob: replacements.get(selected) ?? layer.blob,
    ...(layer.takes ? { takes: layer.takes.map(take => ({ ...take, blob: replacements.get(take.id) ?? take.blob })) } : {}) };
}
