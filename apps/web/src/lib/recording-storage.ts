import type { Layer, RecordingTake } from './session';
import type { SavedSong, SongContent } from './song-store';

interface StoredAudio { audioBytes?: ArrayBuffer; audioType?: string; blob?: Blob }
type StoredTake = Omit<RecordingTake, 'blob'> & StoredAudio;
type StoredLayer = Omit<Layer, 'blob' | 'takes'> & StoredAudio & { takes?: StoredTake[] };
export type StoredSong = Omit<SavedSong, 'layers' | 'candidate'> & { layers: StoredLayer[]; candidate: StoredLayer | null };
const bytes = new WeakMap<Blob, Promise<ArrayBuffer>>();

export class RecordingReadError extends Error {
  constructor(readonly layerName: string, cause?: unknown) {
    super(`Could not read the saved audio for “${layerName}”${cause instanceof Error ? ` (${cause.name})` : ''}. Keep this tab open; your song edits have not been removed.`, { cause });
    this.name = 'RecordingReadError';
  }
}
export async function readRecording(blob: Blob | undefined, name: string) {
  if (!blob) throw new RecordingReadError(name);
  try { const data = await blob.arrayBuffer(); if (!data.byteLength) throw new Error('Empty recording'); return data; }
  catch (reason) { throw new RecordingReadError(name, reason); }
}

/** IndexedDB stores the bytes, not references to browser-managed Blob files. */
export async function storeRecordingContent<T extends SongContent>(song: T) {
  async function audio<TAudio extends { blob?: Blob }>(value: TAudio, name: string) {
    const { blob, ...rest } = value;
    if (!blob) return rest;
    let loaded = bytes.get(blob);
    if (!loaded) { loaded = readRecording(blob, name).catch(reason => { bytes.delete(blob); throw reason; }); bytes.set(blob, loaded); }
    return { ...rest, audioBytes: await loaded, audioType: blob.type || 'audio/wav' };
  }
  async function layer(value: Layer): Promise<StoredLayer> {
    const { takes, ...rest } = value;
    return { ...await audio(rest, value.name), ...(takes ? { takes: await Promise.all(takes.map(take=>audio(take,value.name))) } : {}) };
  }
  return { ...song, layers: await Promise.all(song.layers.map(layer)), candidate: song.candidate ? await layer(song.candidate) : null };
}
export function restoreRecordingContent(song: StoredSong): SavedSong {
  function audio<T extends StoredAudio>(value: T) {
    const { audioBytes, audioType, ...rest } = value;
    return { ...rest, ...(audioBytes ? { blob: new Blob([audioBytes], { type: audioType || 'audio/wav' }) } : {}) };
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
