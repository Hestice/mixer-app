import { lifecycle, type Lifecycle } from './library-entry';
import { validRecordArt } from './record-art';
import type { Layer, RecordingTake } from './session';
import type { SavedSong, SongContent } from './song-store';
import { takesOf, selectTake } from './clip-edits';

export interface CloudAudio { path: string; sha256: string; size: number }
export type CloudTake = Omit<RecordingTake, 'blob'> & { audio?: CloudAudio };
export type CloudLayer = Omit<Layer, 'blob' | 'takes'> & { audio?: CloudAudio; takes?: CloudTake[] };
export interface CloudManifest extends Omit<SongContent, 'layers' | 'candidate'> {
  version: 1 | 2;
  createdAt?: number;
  layers: CloudLayer[];
  candidate: CloudLayer | null;
}
export interface CloudSong {
  id: string;
  owner_id: string;
  revision: number;
  commit_id: string;
  content: CloudManifest;
  updated_at: string;
}
export async function hashAudio(blob: Blob) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function manifestAudio(manifest: CloudManifest): CloudAudio[] {
  return [...manifest.layers, ...(manifest.candidate ? [manifest.candidate] : [])].flatMap((layer) => [...(layer.audio ? [layer.audio] : []), ...(layer.takes ?? []).flatMap((take) => take.audio ? [take.audio] : [])]);
}
export async function makeManifest(song: Omit<SavedSong, 'createdAt'> & { createdAt?: number }, ownerId: string, upload: (path: string, blob: Blob) => Promise<void>, recovered = false): Promise<CloudManifest> {
  const uploaded = new Set<string>();
  async function convertTake(take: RecordingTake): Promise<CloudTake> {
    const { blob, ...rest } = take;
    if (!blob) throw new Error('A recording is missing. The cloud backup was not changed.');
    if (blob.size > 50 * 1024 * 1024) throw new Error('A take is larger than the 50 MB backup limit. It is still saved locally; download its WAV for a separate copy.');
    const sha256 = await hashAudio(blob);
    const path = `${ownerId}/${sha256}.wav`;
    if (!uploaded.has(path)) { await upload(path, blob); uploaded.add(path); }
    return { ...rest, audio: { path, sha256, size: blob.size } };
  }
  async function convert(layer: Layer): Promise<CloudLayer> {
    const { blob: _blob, takes: _takes, ...rest } = layer;
    if (!layer.recorded) return rest;
    const takes: CloudTake[] = [];
    for (const take of takesOf(layer)) takes.push(await convertTake(take));
    const selected = takes.find((take) => take.id === (layer.takeId ?? layer.id));
    if (!selected) throw new Error('The selected take is missing.');
    return { ...rest, takeId: selected.id, takes, audio: selected.audio };
  }
  const layers: CloudLayer[] = [];
  for (const layer of song.layers) layers.push(await convert(layer));
  const candidate = song.candidate ? await convert(song.candidate) : null;
  return { version: 2, title: recovered ? `${song.title} · Recovered version` : song.title,
    artwork: song.artwork, createdAt: song.createdAt, archivedAt: song.archivedAt, deletedAt: song.deletedAt, layers, candidate, retakeLayerId: song.retakeLayerId, withDemo: song.withDemo, volume: song.volume, partName: song.partName,
    tempo: song.tempo, countIn: song.countIn, metronomeMode: song.metronomeMode };
}

export async function downloadManifest(manifest: CloudManifest, ownerId: string, download: (path: string) => Promise<Blob>): Promise<SongContent> {
  if (![1, 2].includes(manifest.version) || !Array.isArray(manifest.layers) || manifest.layers.length > 200
    || typeof manifest.title !== 'string' || !Number.isFinite(manifest.tempo)
    || !Number.isFinite(manifest.volume) || typeof manifest.partName !== 'string'
    || typeof manifest.countIn !== 'boolean' || typeof manifest.withDemo !== 'boolean'
    || !['off', 'visual', 'sound'].includes(manifest.metronomeMode)) throw new Error('This song uses an unsupported format. Your local copy was not changed.');
  if (manifest.artwork !== undefined && !validRecordArt(manifest.artwork)) throw new Error('The record artwork is invalid. Your local copy was not changed.');
  function validateLifecycle(entry: Lifecycle) {
    for (const date of [entry.archivedAt, entry.deletedAt]) {
      if (date != null && (!Number.isSafeInteger(date) || date <= 0)) throw new Error('An archive date is invalid.');
    }
  }
  validateLifecycle(manifest);
  function validateEdits(take: { duration?: number; trimStart?: number; trimEnd?: number; startAt?: number }) {
    const duration = take.duration ?? 80 / 7;
    if (!Number.isFinite(duration) || duration <= 0 || (take.startAt !== undefined && (!Number.isFinite(take.startAt) || take.startAt < 0 || take.startAt > 3600))
      || (take.trimStart !== undefined && (!Number.isFinite(take.trimStart) || take.trimStart < 0))
      || (take.trimEnd !== undefined && (!Number.isFinite(take.trimEnd) || take.trimEnd > duration))
      || (take.trimStart ?? 0) >= (take.trimEnd ?? duration)) throw new Error('A recording edit is invalid.');
  }
  function validateAudio(audio?: CloudAudio) {
    if (!audio || !/^[a-f0-9]{64}$/.test(audio.sha256) || audio.path !== `${ownerId}/${audio.sha256}.wav` || !Number.isFinite(audio.size) || audio.size < 1 || audio.size > 50 * 1024 * 1024) throw new Error('A recording reference is invalid.');
  }
  // Validate every alternative before fetching anything or replacing local data.
  for (const layer of [...manifest.layers, ...(manifest.candidate ? [manifest.candidate] : [])]) {
    if (!layer || typeof layer.id !== 'string' || typeof layer.name !== 'string'
      || typeof layer.enabled !== 'boolean' || !Number.isFinite(layer.volume)
      || !['recording', 'guitar', 'keys', 'rhythm', 'harmony'].includes(layer.kind)) throw new Error('A cloud layer is invalid.');
    validateLifecycle(layer);
    validateEdits(layer);
    if (layer.recorded) {
      validateAudio(layer.audio);
      if (!Number.isFinite(layer.duration)) throw new Error('A recording reference is invalid.');
      if (manifest.version === 2 && (!Array.isArray(layer.takes) || !layer.takes.length || !layer.takes.some((take) => take.id === layer.takeId))) throw new Error('The selected take is invalid.');
      if (layer.takes) {
        if (!Array.isArray(layer.takes) || new Set(layer.takes.map((take) => take.id)).size !== layer.takes.length) throw new Error('A take collection is invalid.');
        for (const take of layer.takes) { if (!take || typeof take.id !== 'string' || !Number.isFinite(take.duration)) throw new Error('A take is invalid.'); validateEdits(take); validateAudio(take.audio); }
      }
    }
  }
  if (manifest.retakeLayerId !== undefined && (!manifest.candidate || !manifest.layers.some((layer) => layer.id === manifest.retakeLayerId && lifecycle(layer) === 'active'))) throw new Error('A retake reference is invalid.');
  const fetched = new Map<string, Blob>();
  async function restoreTake(take: CloudTake): Promise<RecordingTake> {
    const { audio, ...rest } = take;
    if (!audio) throw new Error('A recording reference is invalid.');
    let blob = fetched.get(audio.path);
    if (!blob) { blob = await download(audio.path); fetched.set(audio.path, blob); }
    if (blob.size !== audio.size || await hashAudio(blob) !== audio.sha256) throw new Error('A recording did not download completely. Please try again.');
    return { ...rest, blob };
  }
  async function restore(layer: CloudLayer): Promise<Layer> {
    const { audio, takes, ...rest } = layer;
    if (!layer.recorded) return rest;
    if (takes?.length) {
      const restored: RecordingTake[] = [];
      for (const take of takes) restored.push(await restoreTake(take));
      return selectTake({ ...rest, takes: restored }, layer.takeId!);
    }
    return { ...rest, blob: (await restoreTake({ id: layer.id, duration: layer.duration!, audio })).blob };
  }
  const layers: Layer[] = [];
  for (const layer of manifest.layers) layers.push(await restore(layer));
  return { artwork: manifest.artwork, archivedAt: manifest.archivedAt, deletedAt: manifest.deletedAt, title: manifest.title, layers, candidate: manifest.candidate ? await restore(manifest.candidate) : null, retakeLayerId: manifest.retakeLayerId,
    withDemo: manifest.withDemo, volume: manifest.volume, partName: manifest.partName,
    tempo: manifest.tempo, countIn: manifest.countIn, metronomeMode: manifest.metronomeMode };
}

/** Restore matching immutable recordings while keeping newer local edits and takes. */
export async function recoverLayerAudio(layer: Layer, manifest: CloudManifest, ownerId: string, download: (path: string) => Promise<Blob>) {
  const reference = [...manifest.layers, ...(manifest.candidate ? [manifest.candidate] : [])].find(item => item.id === layer.id && item.recorded);
  if (!reference) return new Map<string, Blob>();
  const restored = await downloadManifest({ ...manifest, layers: [reference], candidate: null, retakeLayerId: undefined }, ownerId, download);
  const available = new Map(takesOf(restored.layers[0]).filter(take => take.blob).map(take => [take.id, take.blob!]));
  return new Map(takesOf(layer).filter(take => available.has(take.id)).map(take => [take.id, available.get(take.id)!]));
}
