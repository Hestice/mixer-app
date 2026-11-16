'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { listSongs } from '../lib/song-store';
import { cacheCloudLibrary, getBackup, enableBackup, listBackups, getBackupPreference, setBackupPreference, removeDownloadedCopies, type BackupLink } from '../lib/backup-store';
import { syncSong, openCloudSong, updateCloudSong, SyncCanceledError } from '../lib/cloud-sync';
import { cloudMessage, supabaseTransport } from '../lib/supabase-transport';
import { recoverLayerAudio, type CloudSong } from '../lib/cloud-manifest';
import type { LibraryAction } from '../lib/library-entry';
import type { Layer } from '../lib/session';

function useCloudState() {
  const [client] = useState(getSupabase);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!client);
  const [links, setLinks] = useState<BackupLink[]>([]);
  const [remoteSongs, setRemoteSongs] = useState<CloudSong[]>([]);
  const [autoBackup, setAutoBackup] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const sessionRef = useRef<Session | null>(null);
  const epoch = useRef(0);
  const running = useRef(false);
  const paused = useRef(false);
  const trigger = useRef<() => void>(() => {});

  useEffect(() => {
    if (!client) return;
    let disposed = false;
    const apply = (next: Session | null) => {
      if (disposed) return;
      if (sessionRef.current?.user.id !== next?.user.id) {
        epoch.current++; setRemoteSongs([]); setErrors({}); setError(''); setAutoBackup(false);
      }
      sessionRef.current = next; setSession(next); setReady(true);
    };
    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => apply(next));
    // A slow auth refresh must not prevent starting a device-only song.
    const fallback = setTimeout(() => { if (!disposed) setReady(true); }, 1500);
    const initialEpoch = epoch.current;
    void client.auth.getSession().then(({ data, error: authError }) => {
      if (!disposed && epoch.current === initialEpoch) { apply(data.session); if (authError) setError('Sign-in could not be restored. Your device-only songs are still available.'); }
    }).catch(() => { if (!disposed) { setReady(true); setError('Sign-in is unavailable right now. You can keep recording locally.'); } });
    return () => { disposed = true; clearTimeout(fallback); epoch.current++; subscription.subscription.unsubscribe(); };
  }, [client]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ownerId = session?.user.id;
    const generation = epoch.current;
    const active = () => !disposed && !paused.current && epoch.current === generation && sessionRef.current?.user.id === ownerId;
    const refresh = async () => {
      try {
        const [bindings, preference] = await Promise.all([listBackups(), ownerId ? getBackupPreference(ownerId) : Promise.resolve(undefined)]);
        if (!disposed) { setLinks(bindings); setAutoBackup(preference?.enabled ?? false); setVersion((value) => value + 1); }
      } catch { if (!disposed) setError('Backup settings could not be read on this device. Local save status is shown separately.'); }
    };
    const run = async () => {
      if (!client || !ownerId || !active() || !navigator.onLine || running.current) return;
      running.current = true;
      const transport = supabaseTransport(client, ownerId, active);
      const work = async () => {
        if (!active()) return;
        const selected = await listBackups();
        for (const song of await listSongs()) {
          if (!active()) return;
          if (song.ownerId === ownerId && !selected.some((link) => link.id === song.id)) await enableBackup(song.id, ownerId);
        }
        for (const link of await listBackups()) {
          if (!active()) return;
          if (link.ownerId !== ownerId) continue;
          setUploading(link.id);
          try {
            await syncSong(link.id, ownerId, transport, active);
            if (active()) setErrors((current) => { const next = { ...current }; delete next[link.id]; return next; });
          } catch (reason) {
            if (active() && !(reason instanceof SyncCanceledError)) setErrors((current) => ({ ...current, [link.id]: cloudMessage(reason) }));
          }
        }
        if (active()) {
          const songs = await transport.list();
          if (active()) {
            setRemoteSongs(current => {
              const known = new Map(current.map(song => [song.id, song]));
              return songs.map(song => {
                const previous = known.get(song.id);
                return previous && previous.revision > song.revision ? previous : song;
              });
            });
            setError('');
            await cacheCloudLibrary(ownerId, songs);
          }
        }
      };
      try {
        if (navigator.locks) await navigator.locks.request(`listening-room-backup:${ownerId}`, { ifAvailable: true }, async (lock) => { if (lock) await work(); });
        else await work();
      } catch (reason) { if (active() && !(reason instanceof SyncCanceledError)) setError(cloudMessage(reason)); }
      finally { running.current = false; if (!disposed) { setUploading(null); await refresh(); } }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void run(), 700); };
    trigger.current = schedule;
    const changed = () => { void refresh(); schedule(); };
    const network = () => { setOnline(navigator.onLine); changed(); };
    setOnline(navigator.onLine);
    void refresh(); schedule();
    window.addEventListener('songs-changed', changed);
    window.addEventListener('online', network); window.addEventListener('offline', network);
    window.addEventListener('focus', changed);
    const interval = setInterval(changed, 15000);
    return () => {
      disposed = true; clearTimeout(timer); clearInterval(interval);
      window.removeEventListener('songs-changed', changed);
      window.removeEventListener('online', network); window.removeEventListener('offline', network);
      window.removeEventListener('focus', changed);
    };
  }, [client, session?.user.id]);

  async function selectSongs(ids: string[]) {
    const ownerId = sessionRef.current?.user.id;
    if (!ownerId) throw new Error('Sign in to choose songs for backup.');
    for (const id of ids) {
      if (sessionRef.current?.user.id !== ownerId) throw new Error('Your account changed. Please choose songs again.');
      await enableBackup(id, ownerId);
    }
    trigger.current();
  }
  async function setAutomatic(enabled: boolean) {
    const ownerId = sessionRef.current?.user.id;
    if (!ownerId) return;
    await setBackupPreference(ownerId, enabled); setAutoBackup(enabled); trigger.current();
  }
  async function openRemote(id: string) {
    const ownerId = sessionRef.current?.user.id, generation = epoch.current;
    if (!client || !ownerId) throw new Error('Sign in to open your cloud songs.');
    const active = () => sessionRef.current?.user.id === ownerId && epoch.current === generation && !paused.current;
    const localId = await openCloudSong(id, ownerId, supabaseTransport(client, ownerId, active), active);
    if (!active()) throw new Error('Your account changed. Please open the song again.');
    return localId;
  }
  async function manageRemote(id: string, revision: number, action: LibraryAction) {
    const ownerId = sessionRef.current?.user.id, generation = epoch.current;
    if (!client || !ownerId) throw new Error('Sign in to manage your cloud songs.');
    const active = () => sessionRef.current?.user.id === ownerId && epoch.current === generation && !paused.current;
    const song = await updateCloudSong(id, revision, ownerId, action, supabaseTransport(client, ownerId, active));
    if (!active()) throw new SyncCanceledError();
    setRemoteSongs(current => current.map(item => item.id === id && item.revision <= song.revision ? song : item));
    trigger.current();
    await cacheCloudLibrary(ownerId, [song]).catch(() => {});
  }
  async function recoverRecordings(id: string, layer: Layer) {
    const ownerId = sessionRef.current?.user.id, generation = epoch.current;
    if (!client || !ownerId) return new Map<string, Blob>();
    const active = () => sessionRef.current?.user.id === ownerId && epoch.current === generation && !paused.current;
    const link = await getBackup(id);
    if (!link || link.ownerId !== ownerId || !active()) return new Map<string, Blob>();
    const transport = supabaseTransport(client, ownerId, active);
    const remote = await transport.get(link.remoteId);
    if (!remote || remote.owner_id !== ownerId || !active()) return new Map<string, Blob>();
    const audio = await recoverLayerAudio(layer, remote.content, ownerId, async path => { if (!active()) throw new SyncCanceledError(); return transport.download(path); });
    if (!active()) throw new SyncCanceledError();
    return audio;
  }
  async function signOut(removeCopies: boolean) {
    if (!client) return;
    const ownerId = sessionRef.current?.user.id;
    paused.current = true;
    try {
      const { error: reason } = await client.auth.signOut({ scope: 'local' });
      if (reason) throw reason;
      if (removeCopies && ownerId) await removeDownloadedCopies(ownerId);
    } finally { paused.current = false; }
  }
  function status(id: string, revision: number) {
    const link = links.find((item) => item.id === id && item.ownerId === session?.user.id);
    if (!link) return '';
    if (link.syncedLocalRevision >= revision && !link.attempt && !link.libraryEdit) return link.recovered ? 'Backed up · recovered version' : 'Backed up';
    if (!online) return 'Saved locally · offline';
    if (errors[id]) return 'Backup needs attention';
    return uploading === id ? 'Backing up…' : 'Waiting to back up';
  }
  return { client, configured: !!client, user: session?.user ?? null, ready, links, remoteSongs, autoBackup, online,
    error, errors, version, status, selectSongs, setAutomatic, openRemote, manageRemote, recoverRecordings, signOut, retry: () => trigger.current() };
}

type CloudState = ReturnType<typeof useCloudState>;
const CloudContext = createContext<CloudState | null>(null);
export function CloudProvider({ children }: { children: ReactNode }) {
  const value = useCloudState();
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}
export function useCloud() {
  const value = useContext(CloudContext);
  if (!value) throw new Error('CloudProvider is missing.');
  return value;
}
