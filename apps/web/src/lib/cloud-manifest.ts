import type { Layer } from './session';
import type { SavedSong, SongContent } from './song-store';

export interface CloudAudio { path: string; sha256: string; size: number }
export type CloudLayer = Omit<Layer, 'blob'> & { audio?: CloudAudio };
export interface CloudManifest extends Omit<SongContent, 'layers' | 'candidate'> {
  version: 1;
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
export async function makeManifest(song: SavedSong, ownerId: string, upload: (path: string, blob: Blob) => Promise<void>, recovered = false): Promise<CloudManifest> {
  async function convert(layer: Layer): Promise<CloudLayer> {
    const { blob, ...rest } = layer;
    if (!layer.recorded) return rest;
    if (!blob) throw new Error(`The recording for ${layer.name} is missing. The cloud backup was not changed.`);
    if (blob.size > 50 * 1024 * 1024) throw new Error(`${layer.name} is larger than the 50 MB backup limit. It is still saved locally; download its WAV for a separate copy.`);
    const sha256 = await hashAudio(blob);
    const path = `${ownerId}/${sha256}.wav`;
    await upload(path, blob);
    return { ...rest, audio: { path, sha256, size: blob.size } };
  }
  const layers: CloudLayer[] = [];
  for (const layer of song.layers) layers.push(await convert(layer));
  const candidate = song.candidate ? await convert(song.candidate) : null;
  return { version: 1, title: recovered ? `${song.title} · Recovered version` : song.title,
    layers, candidate, withDemo: song.withDemo, volume: song.volume, partName: song.partName,
    tempo: song.tempo, countIn: song.countIn, metronomeMode: song.metronomeMode };
}

export async function downloadManifest(manifest: CloudManifest, ownerId: string, download: (path: string) => Promise<Blob>): Promise<SongContent> {
  if (manifest.version !== 1 || !Array.isArray(manifest.layers) || manifest.layers.length > 200
    || typeof manifest.title !== 'string' || !Number.isFinite(manifest.tempo)
    || !Number.isFinite(manifest.volume) || typeof manifest.partName !== 'string'
    || typeof manifest.countIn !== 'boolean' || typeof manifest.withDemo !== 'boolean'
    || !['off', 'visual', 'sound'].includes(manifest.metronomeMode)) throw new Error('This song uses an unsupported format. Your local copy was not changed.');
  async function restore(layer: CloudLayer): Promise<Layer> {
    if (!layer || typeof layer.id !== 'string' || typeof layer.name !== 'string'
      || typeof layer.enabled !== 'boolean' || !Number.isFinite(layer.volume)
      || !['recording', 'guitar', 'keys', 'rhythm', 'harmony'].includes(layer.kind)) throw new Error('A cloud layer is invalid. Your local copy was not changed.');
    const { audio, ...rest } = layer;
    if (!layer.recorded) return rest;
    if (!audio || !/^[a-f0-9]{64}$/.test(audio.sha256) || audio.path !== `${ownerId}/${audio.sha256}.wav` || !Number.isFinite(layer.duration)) throw new Error('A recording reference is invalid.');
    const blob = await download(audio.path);
    if (blob.size !== audio.size || await hashAudio(blob) !== audio.sha256) throw new Error('A recording did not download completely. Please try again.');
    return { ...rest, blob };
  }
  const layers: Layer[] = [];
  for (const layer of manifest.layers) layers.push(await restore(layer));
  return { title: manifest.title, layers, candidate: manifest.candidate ? await restore(manifest.candidate) : null,
    withDemo: manifest.withDemo, volume: manifest.volume, partName: manifest.partName,
    tempo: manifest.tempo, countIn: manifest.countIn, metronomeMode: manifest.metronomeMode };
}
