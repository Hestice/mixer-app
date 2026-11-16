import { RecordingReadError } from './recording-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CloudConflictError, SyncCanceledError, type CloudTransport } from './cloud-sync';
import type { CloudSong } from './cloud-manifest';

export function supabaseTransport(client: SupabaseClient, ownerId: string, active: () => boolean): CloudTransport {
  async function guard() {
    if (!active()) throw new SyncCanceledError();
    const { data } = await client.auth.getSession();
    if (data.session?.user.id !== ownerId || !active()) throw new SyncCanceledError();
    return data.session.access_token;
  }
  // Resolve the token for this owner at request time. A different account can
  // never inherit an in-flight RPC or an old account's recording manifest.
  const scoped = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { accessToken: guard });
  return {
    async get(id) {
      await guard();
      const { data, error } = await scoped.from('songs').select('*').eq('owner_id', ownerId).eq('id', id).maybeSingle();
      if (error) throw error;
      return data as CloudSong | null;
    },
    async list() {
      const songs: CloudSong[] = [];
      for (let offset = 0; ; offset += 100) {
        await guard();
        const { data, error } = await scoped.from('songs').select('*').eq('owner_id', ownerId).order('id').range(offset, offset + 99);
        if (error) throw error;
        songs.push(...data as CloudSong[]);
        if (data.length < 100) return songs.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      }
    },
    async upload(path, blob) {
      await guard();
      const { error } = await scoped.storage.from('recordings').upload(path, blob, { contentType: 'audio/wav', upsert: false });
      if (error && !('statusCode' in error && String(error.statusCode) === '409') && !('code' in error && error.code === 'Duplicate')) throw error;
    },
    async download(path) {
      await guard();
      const { data, error } = await scoped.storage.from('recordings').download(path);
      if (error) throw error;
      return data;
    },
    async save(id, expectedRevision, commitId, content) {
      await guard();
      const { data, error } = await scoped.rpc('save_song', { p_id: id, p_expected_revision: expectedRevision, p_commit_id: commitId, p_content: content });
      if (error?.code === '40001') throw new CloudConflictError(error.message);
      if (error) throw error;
      return data as CloudSong;
    },
  };
}

export function cloudMessage(reason: unknown) {
  if (reason instanceof RecordingReadError) return reason.message;
  const detail = reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : '';
  if (/newer app version/i.test(detail)) return 'This song was edited in a newer app version. Reload the app before backing up again.';
  if (/50 MB|missing|unsupported|invalid|completely|changed locally/.test(detail)) return detail;
  if (/fetch|network|offline/i.test(detail)) return 'Connection interrupted. Your local save is safe; backup will retry when you reconnect.';
  return 'Cloud backup could not finish. Your local save is safe. Check the connection and try again.';
}
