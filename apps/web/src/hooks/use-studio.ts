'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lifecycle, layerLifecycleEdit, type LifecycleAction } from '../lib/library-entry';
import { appendTake, clipBounds, discardDraftTake, editClip, selectTake, takesOf } from '../lib/clip-edits';
import type { ClipEdits, LayerColor } from '../lib/session';
import { RecordingReadError, readRecording, recordingBlob, recordingCopies, replaceLayerAudio } from '../lib/recording-storage';
import type { RecordArt } from '../lib/record-art';
import { OUTPUT_DELAY } from '../lib/audio-output';
import { recordingDelay, recordedPlacement, recordingSchedule } from '../lib/recording-timing';
import { calibrateRecording, calibrationSetup, readCalibration, sameCalibrationOutput, type CalibrationProfile } from '../lib/recording-calibration';
import { AudioEngine } from '../lib/audio-engine';
import { commitLayer, demoLayers, harmonyLayer, tourScene, type Layer } from '../lib/session';
import { MicrophoneRecorder } from '../lib/microphone-recorder';
import { Metronome, canSoundClick, metronomeBeatAt, nextBeatDelay, type MetronomeMode } from '../lib/metronome';
import { encodeWavBytes } from '../lib/wav';
import { exportSong, songFilename } from '../lib/song-export';
import { useCloud } from '../components/cloud-provider';
import { getBackupPreference } from '../lib/backup-store';
import { getSong, openLocalSong, SongWriter, storageMessage, type SongContent } from '../lib/song-store';
import { splitAudioFile } from '../lib/song-separation';

export type RecordingState = 'idle' | 'requesting' | 'ready' | 'countdown' | 'recording' | 'processing' | 'review';

type SavedTiming = { delay: number; persistent: boolean; outputKnown: boolean };

type PlaybackOptions = {
  cue?: () => Promise<void>;
  closeCue?: () => void;
  keptMix?: boolean;
};

export function useStudio(startInWorkspace = false) {
  const cloud = useCloud();
  const [songId, setSongId] = useState('');
  const [ownerId, setOwnerId] = useState<string | undefined>();
  const [localRevision, setLocalRevision] = useState(0);
  const effectiveOwner = cloud.links.find((link) => link.id === songId)?.ownerId ?? ownerId;
  const accountBlocked = !!effectiveOwner && (!cloud.ready || effectiveOwner !== cloud.user?.id);
  const engineRef = useRef<AudioEngine | null>(null);
  const getEngine = () => engineRef.current ?? (engineRef.current = new AudioEngine());
  const tourChapterRef = useRef(0);
  const [savedLayers, setLayers] = useState<Layer[]>(startInWorkspace ? [] : demoLayers);
  const layers = useMemo(() => savedLayers.filter(layer => lifecycle(layer) === 'active'), [savedLayers]);
  const archivedLayers = useMemo(() => savedLayers.filter(layer => lifecycle(layer) === 'archived'), [savedLayers]);
  const [candidate, setCandidate] = useState<Layer | null>(null);
  const [retakeLayerId, setRetakeLayerId] = useState<string | undefined>();
  const editHistory = useRef<{ layers: Layer[]; candidate: Layer | null; retakeLayerId?: string }[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [stopVersion, setStopVersion] = useState(0);
  const playbackRequest = useRef(0);
  const startingPlayback = useRef(false);
  const [busy, setBusy] = useState(false);
  const [split, setSplit] = useState<{ fileName: string; progress: number | null } | null>(null);
  const [splitError, setSplitError] = useState('');
  const splitRun = useRef<AbortController | null>(null);
  const [error, setError] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const exporting = useRef(false);
  const [workspace, setWorkspace] = useState(startInWorkspace);
  const [withDemo, setWithDemo] = useState(false);
  const [title, setTitle] = useState('Untitled song');
  const [artwork, setArtwork] = useState<RecordArt | undefined>();
  const [localReady, setLocalReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [audioError, setAudioError] = useState('');
  const [savedContent, setSavedContent] = useState<SongContent | null>(null);
  const writerRef = useRef<SongWriter | null>(null);
  const saveVersion = useRef(0);
  const persistedContent = useRef<SongContent | null>(null);
  const restoredContent = useRef(false);
  const decodedRecordings = useRef(new Map<string, string>());
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [countdown, setCountdown] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [position, setPosition] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [volume, setVolumeState] = useState(0.65);
  const [previewCandidate, setPreviewCandidate] = useState(true);
  const [soloId, setSoloId] = useState<string | null>(null);
  const [partName, setPartName] = useState('Guitar');
  const [tempo, setTempo] = useState(84);
  const [beatOffset, setBeatOffset] = useState<number>();
  const [beatAlignmentStatus, setBeatAlignmentStatus] = useState('');
  const [countIn, setCountIn] = useState(true);
  const [metronomeMode, setMetronomeMode] = useState<MetronomeMode>('visual');
  const [headphones, setHeadphones] = useState(false);
  const [beatIndex, setBeatIndex] = useState(-1);
  const [metronomePreview, setMetronomePreview] = useState(false);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [microphoneLabel, setMicrophoneLabel] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputDevice, setInputDevice] = useState('');
  const recorderRef = useRef<MicrophoneRecorder | null>(null);
  const audioDevices = useRef<MediaDeviceInfo[]>([]);
  const deviceQuery = useRef(0);
  const timingProfiles = useRef(new Map<string, { profile: CalibrationProfile; persistent: boolean }>());
  const activeCalibration = useRef<object | null>(null);
  const [timing, setTiming] = useState<SavedTiming | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationError, setCalibrationError] = useState('');
  const metronomeRef = useRef<Metronome | null>(null);
  const levelRef = useRef(0);
  const runRef = useRef(0);
  const stoppingRef = useRef(false);
  const capturePlacement = useRef({ position: 0, delay: 0 });
  const [recordFrom, setRecordFrom] = useState(0);
  const updateRecording = useRef<(() => void) | null>(null);
  const updateBeat = useRef<(() => void) | null>(null);
  const lastClockTick = useRef(0);
  const disposed = useRef(false);
  const hasRecordings = layers.some((layer) => layer.recorded) || !!candidate?.recorded;
  const locked = accountBlocked || (workspace && !localReady) || ['requesting', 'countdown', 'recording', 'processing'].includes(recordingState);
  const nextDraft = useMemo(() => {
    if (!candidate?.recorded || recordingState !== 'review') return candidate;
    return discardDraftTake(candidate, layers.find(layer => layer.id === retakeLayerId));
  }, [candidate, layers, recordingState, retakeLayerId]);
  const backingLayers = layers.filter((layer) => layer.id !== retakeLayerId);
  const mix = [...(candidate && previewCandidate ? backingLayers : layers), ...(candidate && (!workspace || recordingState === 'review' && previewCandidate) ? [{ ...candidate, enabled: previewCandidate }] : [])].map((layer) => ({
    ...layer, enabled: soloId ? layer.id === soloId : layer.enabled,
  }));
  const mixRef = useRef(mix);
  mixRef.current = mix;

  const content = useMemo<SongContent>(() => ({ title, artwork, layers: savedLayers, candidate, retakeLayerId: candidate ? retakeLayerId : undefined, withDemo, volume, partName, tempo, beatOffset, countIn, metronomeMode }),
    [title, artwork, savedLayers, candidate, retakeLayerId, withDemo, volume, partName, tempo, beatOffset, countIn, metronomeMode]);
  const contentRef = useRef(content);
  contentRef.current = content;
  const saveState = !localReady ? 'loading' : saveError ? 'error' : savedContent === content ? 'saved' : 'saving';

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('song');
    if (!workspace) { if (id) setWorkspace(true); return; }
    if (writerRef.current || !cloud.ready) return;
    let canceled = false;
    if (!id) {
      void (async () => {
        let creationOwner: string | undefined;
        if (cloud.user) {
          const preference = await getBackupPreference(cloud.user.id).catch(() => undefined);
          if (preference?.enabled) creationOwner = cloud.user.id;
        }
        if (canceled || writerRef.current) return;
        const nextId = crypto.randomUUID();
        writerRef.current = new SongWriter(nextId, 0, creationOwner);
        setSongId(nextId); setOwnerId(creationOwner);
        const url = new URL(window.location.href);
        url.searchParams.set('song', nextId);
        window.history.replaceState(window.history.state, '', url);
        setLocalReady(true);
      })();
    } else {
      void openLocalSong(id, cloud.user?.id).then(({ song, audioError, protectionError, ownerMismatch, unavailable }) => {
        if (canceled) return;
        if (ownerMismatch) { setLoadError('Sign in to the account that owns this song to reopen it. Your local recordings are still on this device.'); return; }
        if (unavailable) { setLoadError(unavailable === 'archived' ? 'Restore this song from the archive to open it.' : 'This song has been deleted.'); return; }
        if (!song) { setLoadError('This song is not on this browser. It may have been saved on another device, or its browser data was cleared.'); return; }
        setAudioError(audioError?.message ?? '');
        if (protectionError) setSaveError(storageMessage(protectionError));
        setLoadError(''); setSongId(id); setOwnerId(song.ownerId); setLocalRevision(song.revision);
        writerRef.current = new SongWriter(id, song.revision);
        setArtwork(song.artwork); setTitle(song.title); setLayers(song.layers); setCandidate(song.candidate); setRetakeLayerId(song.retakeLayerId);
        setWithDemo(song.withDemo); setVolumeState(song.volume); setPartName(song.partName);
        setTempo(song.tempo); setBeatOffset(song.beatOffset); setCountIn(song.countIn);
        // Headphones must be confirmed again before any audible click.
        setMetronomeMode(song.metronomeMode === 'sound' ? 'visual' : song.metronomeMode);
        setRecordingState(song.candidate ? 'review' : 'idle'); setPreviewCandidate(false);
        getEngine().configureSession(song.layers.filter(layer => lifecycle(layer) === 'active'));
        restoredContent.current = true;
        setLocalReady(true);
      }).catch(() => { if (!canceled) setLoadError('Your songs could not be opened. Check that browser storage is available, then reload to try again.'); });
    }
    return () => { canceled = true; };
  }, [workspace, cloud.ready, cloud.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!accountBlocked) return;
    splitRun.current?.abort();
    if (recordingState === 'recording') void stopRecording(true);
    else disconnectMicrophone();
  }, [accountBlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persistSong(snapshot = contentRef.current) {
    if (!writerRef.current) return false;
    const version = ++saveVersion.current;
    setSaveError('');
    try {
      const saved = await writerRef.current.write(snapshot);
      if (!disposed.current) setLocalRevision(saved.revision);
      if (!disposed.current && version === saveVersion.current) { persistedContent.current = snapshot; setSavedContent(snapshot); setAudioError(''); }
      return true;
    } catch (reason) {
      if (!disposed.current && version === saveVersion.current) setSaveError(storageMessage(reason));
      return false;
    }
  }

  useEffect(() => {
    if (!workspace || !localReady) return;
    if (restoredContent.current) { restoredContent.current = false; persistedContent.current = content; setSavedContent(content); return; }
    void persistSong(content);
  }, [content, workspace, localReady]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openMySongs(navigate: () => void) {
    if (locked || busy) return;
    stopMetronome(); getEngine().pause(); setPlaying(false); setBusy(true);
    try {
      let snapshot = contentRef.current;
      while (true) {
        if (!(savedContent === snapshot && !saveError) && !await persistSong(snapshot)) return;
        if (snapshot === contentRef.current) break;
        snapshot = contentRef.current;
      }
      releaseMicrophone(); navigate();
    } finally { if (!disposed.current) setBusy(false); }
  }

  async function prepareAudio(includeCandidate = previewCandidate, only?: Layer) {
    const run = runRef.current;
    const engine = getEngine();
    const prepared = only ? [only] : [...(candidate && includeCandidate ? backingLayers : layers), ...(candidate && includeCandidate ? [candidate] : [])];
    if (!workspace || withDemo && !only?.recorded) await engine.loadDemo(prepared);
    for (const layer of prepared) {
      if (layer.recorded && decodedRecordings.current.get(layer.id) !== (layer.takeId ?? layer.id)) {
        try { await engine.addRecording(layer.id, layer.blob, layer.name); }
        catch (reason) {
          if (!(reason instanceof RecordingReadError)) throw reason;
          const selectedId = layer.takeId ?? layer.id;
          const replacements = new Map<string, Blob>();
          // A fresh database read can refresh a stale browser Blob handle.
          const fresh = await getSong(songId).catch(() => undefined);
          const freshLayers = [...(fresh?.layers ?? []), ...(fresh?.candidate ? [fresh.candidate] : [])].filter(item => item.id === layer.id);
          const copies = new Set([...recordingCopies(layer, selectedId), ...freshLayers.flatMap(item => recordingCopies(item, selectedId))]);
          for (const blob of copies) {
            try { replacements.set(selectedId, recordingBlob(await readRecording(blob, layer.name), blob.type)); break; } catch {}
          }
          if (!replacements.has(selectedId)) {
            try { for (const [id, blob] of await cloud.recoverRecordings(songId, layer)) replacements.set(id, blob); } catch {}
          }
          if (!replacements.has(selectedId) || disposed.current || run !== runRef.current || accountBlocked) throw reason;
          const recovered = replaceLayerAudio(layer, replacements);
          prepared[prepared.indexOf(layer)] = recovered;
          await engine.addRecording(layer.id, recovered.blob, layer.name);
          setLayers(current => current.map(item => item.id === layer.id ? replaceLayerAudio(item, replacements) : item));
          setCandidate(current => current?.id === layer.id ? replaceLayerAudio(current, replacements) : current);
        }
        decodedRecordings.current.set(layer.id, layer.takeId ?? layer.id);
      }
    }
    if (disposed.current || run !== runRef.current) throw new Error('Playback was canceled. Try again.');
    return prepared;
  }

  useEffect(() => {
    if (workspace && ['countdown', 'recording', 'processing'].includes(recordingState)) return;
    engineRef.current?.sync(mix);
  }, [layers, candidate, previewCandidate, soloId, playing, recordingState, workspace]); // eslint-disable-line react-hooks/exhaustive-deps

  const advanceClock = useCallback((fromDetachedTab = false) => {
    if (disposed.current || (fromDetachedTab && !document.hidden)) return;
    const now = performance.now();
    if (now - lastClockTick.current < 30) return;
    lastClockTick.current = now;
    if (updateRecording.current) updateRecording.current();
    else setPosition(engineRef.current?.position ?? 0);
    updateBeat.current?.();
    setPlaying(engineRef.current?.playing ?? false);
  }, []);

  useEffect(() => {
    disposed.current = false;
    if (workspace && !engineRef.current) getEngine().configureSession(layers);
    const interval = setInterval(advanceClock, 40);
    return () => {
      disposed.current = true;
      splitRun.current?.abort();
      clearInterval(interval);
      runRef.current++;
      updateRecording.current = updateBeat.current = null;
      activeCalibration.current = null;
      recorderRef.current?.dispose(); recorderRef.current = null;
      metronomeRef.current?.stop();
      engineRef.current?.dispose();
      engineRef.current = null;
      decodedRecordings.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!workspace || (!split && saveState === 'saved' && !['countdown', 'recording', 'processing'].includes(recordingState))) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (splitRun.current || persistedContent.current !== contentRef.current || ['countdown', 'recording', 'processing'].includes(recordingState)) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [workspace, saveState, recordingState, !!split]);

  const applyTourScene = useCallback((chapter: number, buildStage: 0 | 1 | 2) => {
    if (workspace) return;
    tourChapterRef.current = chapter;
    const scene = tourScene(chapter, buildStage);
    setLayers(scene.layers);
    setCandidate(scene.candidate);
    setPreviewCandidate(true);
    setSoloId(null);
  }, [workspace]);

  const report = (reason: unknown) => setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.');

  const readSongPosition = useCallback(() => engineRef.current?.position ?? 0, []);

  function pausePlayback() {
    if (startingPlayback.current) playbackRequest.current++;
    const engine = getEngine();
    if (engine.playing && metronomePreview && beatOffset !== undefined) stopMetronome();
    engine.pause();
    setPlaying(false);
    setPosition(engine.position);
    return engine.position;
  }

  function stopPlayback() {
    if (locked) return;
    playbackRequest.current++;
    if (metronomePreview && beatOffset !== undefined) stopMetronome();
    getEngine().reset();
    setPlaying(false);
    setPosition(0);
    setStopVersion(version => version + 1);
  }

  async function togglePlayback({ cue, closeCue, keptMix = false }: PlaybackOptions = {}) {
    if (locked || busy || startingPlayback.current) return;
    setError('');
    const engine = getEngine();
    if (engine.playing) { pausePlayback(); return; }
    if (workspace && !layers.length && (keptMix || !candidate)) return;
    const request = ++playbackRequest.current;
    startingPlayback.current = true;
    setBusy(true);
    if (keptMix && beatOffset === undefined) stopMetronome();
    try {
      const [prepared] = await Promise.all([prepareAudio(!keptMix && previewCandidate), cue?.()]);
      if (request !== playbackRequest.current || disposed.current) return;
      await engine.play(keptMix ? prepared : mixRef.current);
      if (request !== playbackRequest.current || disposed.current) { engine.pause(); return; }
      if (keptMix) {
        setSoloId(null);
        setPreviewCandidate(false);
      }
      engine.volume(volume);
      setPlaying(true);
      const clock = engine.playbackClock;
      if (clock && metronomePreview && beatOffset !== undefined) startBeatPreview(clock.context);
    } catch (reason) {
      if (request === playbackRequest.current && !disposed.current) report(reason);
    } finally {
      startingPlayback.current = false;
      if (!disposed.current) {
        setBusy(false);
        closeCue?.();
      }
    }
  }

  async function seekSong(value: number) {
    if (locked || busy || !Number.isFinite(value)) return;
    const position = Math.max(0, Math.min(3600, value));
    const engine = getEngine();
    // Sources are already decoded during playback. Seeking never starts a paused song.
    const followBeat = engine.playing && metronomePreview && beatOffset !== undefined;
    engine.seek(mixRef.current, position);
    if (followBeat) {
      const clock = engine.playbackClock;
      if (clock) startBeatPreview(clock.context);
      else stopMetronome();
    }
    setPosition(position); setPlaying(engine.playing);
  }

  function beginScrub(heldFor = 0) {
    if (locked || busy || !getEngine().beginScrub(heldFor)) return false;
    if (metronomePreview && beatOffset !== undefined) stopMetronome(true);
    return true;
  }

  function scrubSong(value: number, audible = true) {
    if (locked || !Number.isFinite(value)) return;
    const engine = getEngine();
    engine.scrubTo(mixRef.current, Math.max(0, Math.min(3600, value)), audible);
    setPosition(engine.position);
  }

  function endScrub() {
    const engine = getEngine();
    if (!engine.endScrub(mixRef.current)) return;
    setPosition(engine.position);
    setPlaying(engine.playing);
    if (metronomePreview && beatOffset !== undefined) {
      const clock = engine.playbackClock;
      if (clock) startBeatPreview(clock.context);
      else stopMetronome();
    }
  }

  async function toggleLayer(id: string) {
    if (locked || busy) return;
    const layer = layers.find(item => item.id === id);
    if (!layer) return;
    setLayers(current => current.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item));
    if (!workspace || (soloId === id && layer.enabled)) setSoloId(null);
    // In the listening demo, enabling a layer starts playback.
    if (!workspace && !playing && !layer.enabled) {
      setBusy(true); setError('');
      try {
        await prepareAudio();
        await getEngine().play(mixRef.current);
        getEngine().volume(volume); setPlaying(true);
      } catch (reason) { report(reason); }
      finally { setBusy(false); }
    }
  }

  async function previewHarmony() {
    if (workspace || tourChapterRef.current !== 3 || busy || locked) return;
    setCandidate({ ...harmonyLayer });
    setPreviewCandidate(true); setSoloId(null);
    // Joining an already playing mix must not restart its loop.
    if (playing) return;
    setBusy(true); setError('');
    try {
      await getEngine().loadDemo();
      await getEngine().play(mixRef.current);
      getEngine().volume(volume); setPlaying(true);
    } catch (reason) { report(reason); }
    finally { setBusy(false); }
  }

  async function toggleCandidatePreview() {
    if (!candidate || busy || locked) return;
    const audible = soloId ? soloId === candidate.id : previewCandidate;
    setSoloId(null);
    if (playing) { setPreviewCandidate(!audible); return; }
    setBusy(true); setError('');
    try {
      await prepareAudio();
      setPreviewCandidate(true);
      await getEngine().play(mixRef.current);
      getEngine().volume(volume); setPlaying(true);
    } catch (reason) { report(reason); }
    finally { setBusy(false); }
  }

  function discardDemoPreview() {
    if (workspace || candidate?.recorded || locked || busy) return;
    setCandidate(null); setSoloId(null); setPreviewCandidate(true);
  }

  function beginEdit() {
    if (locked || busy) return;
    editHistory.current = [...editHistory.current.slice(-29), { layers: savedLayers, candidate, retakeLayerId }];
    setUndoCount(editHistory.current.length);
    getEngine().pause(); setPlaying(false);
  }

  async function importSong(file: File) {
    if (!workspace || locked || busy || layers.length || candidate || retakeLayerId || splitRun.current) return;
    stopMetronome();
    const run = new AbortController();
    splitRun.current = run;
    setBusy(true);
    setSplitError('');
    setSplit({ fileName: file.name, progress: null });
    try {
      const stems = await splitAudioFile(file, run.signal, progress => setSplit({ fileName: file.name, progress }));
      if (disposed.current || run.signal.aborted) return;
      beginEdit();
      const next = [...savedLayers, ...stems];
      getEngine().configureSession(stems);
      setPosition(0);
      setSoloId(null);
      setLayers(next);
      setTitle(current => current === 'Untitled song' ? file.name.replace(/\.[^.]+$/, '').trim().slice(0, 70) || current : current);
      setPartName(current => current === 'Guitar' ? 'Harmony' : current);
    } catch (reason) {
      if (!disposed.current && !run.signal.aborted) setSplitError(reason instanceof Error ? reason.message : 'This song couldn’t be split. Try another file.');
    } finally {
      splitRun.current = null;
      if (!disposed.current) { setSplit(null); setBusy(false); }
    }
  }

  function updateClip(id: string, patch: ClipEdits, draft = false) {
    if (locked || busy) return;
    getEngine().pause(); setPlaying(false);
    if (draft) setCandidate((current) => current ? editClip(current, patch) : null);
    else setLayers((current) => current.map((layer) => layer.id === id ? editClip(layer, patch) : layer));
  }

  function chooseTake(id: string, takeId: string, draft = false) {
    if (locked || busy) return;
    beginEdit();
    if (draft) setCandidate((current) => current ? selectTake(current, takeId) : null);
    else setLayers((current) => current.map((layer) => layer.id === id ? selectTake(layer, takeId) : layer));
    decodedRecordings.current.delete(id);
  }

  function undoEdit() {
    if (locked || busy) return;
    const previous = editHistory.current.pop();
    if (!previous) return;
    getEngine().pause(); setPlaying(false);
    setLayers(previous.layers); setCandidate(previous.candidate); setRetakeLayerId(previous.retakeLayerId);
    setRecordingState(previous.candidate ? 'review' : recorderRef.current ? 'ready' : 'idle'); setPreviewCandidate(false); setSoloId(null);
    decodedRecordings.current.clear(); setUndoCount(editHistory.current.length);
  }

  function renameLayer(id: string, name: string) {
    if (locked || busy || retakeLayerId === id) return;
    const title = name.trim().slice(0, 70);
    if (!title) return;
    beginEdit();
    setLayers(current => current.map(layer => layer.id === id ? { ...layer, name: title } : layer));
  }

  function manageLayer(id: string, action: LifecycleAction) {
    if (locked || busy || retakeLayerId === id) return;
    const layer = savedLayers.find(item => item.id === id);
    if (!layer) return;
    try {
      const patch = layerLifecycleEdit(layer, action);
      const next = savedLayers.map(item => item.id === id ? { ...item, ...patch } : item);
      setLayers(next);
      // A trim or take undo must not resurrect an archived/deleted layer.
      editHistory.current = editHistory.current
        .filter(edit => edit.layers.some(item => item.id === id) && edit.candidate?.id !== id && edit.retakeLayerId !== id)
        .map(edit => ({ ...edit, layers: edit.layers.map(item => item.id === id ? { ...item, ...patch } : item) }));
      setUndoCount(editHistory.current.length);
      setSoloId(null);
      getEngine().configureSession(next.filter(item => lifecycle(item) === 'active'), getEngine().position);
      setPlaying(false);
    } catch (reason) { report(reason); }
  }

  function keepCandidate() {
    if (!candidate || locked || busy) return;
    if (workspace) beginEdit();
    const next = retakeLayerId ? savedLayers.map((layer) => layer.id === retakeLayerId ? { ...candidate, id: layer.id, enabled: layer.enabled, volume: layer.volume, color: layer.color } : layer) : commitLayer(savedLayers, candidate);
    if (workspace) { getEngine().configureSession(next.filter(layer => lifecycle(layer) === 'active'), getEngine().position); setPlaying(false); }
    setLayers(next); setCandidate(null); setRetakeLayerId(undefined); setSoloId(null); setPreviewCandidate(false);
    setRecordingState(recorderRef.current ? 'ready' : 'idle');
    if (workspace) {
      const count = next.filter(layer => lifecycle(layer) === 'active').length;
      setPartName(count === 1 ? 'Vocals' : `Layer ${count + 1}`);
    }
  }

  function replaceDraft(next: Layer | null) {
    if (candidate) {
      beginEdit();
      const engine = getEngine();
      engine.configureSession(layers, engine.position);
      decodedRecordings.current.delete(candidate.id);
    }
    setCandidate(next);
    setPreviewCandidate(false);
    setSoloId(null);
    if (!next) {
      setRetakeLayerId(undefined);
      setRecordingState(recorderRef.current ? 'ready' : 'idle');
    }
  }

  function discardTake() {
    if (!candidate || candidate === nextDraft || locked || busy) return false;
    replaceDraft(nextDraft);
    return true;
  }

  function cancelRetake() {
    if (!retakeLayerId || locked || busy) return;
    replaceDraft(null);
    setPartName(layers.length === 1 ? 'Vocals' : `Layer ${layers.length + 1}`);
  }

  function recordAnother(id?: string) {
    if (locked || busy || (id && candidate)) return;
    const layer = id ? layers.find(item => item.id === id) : candidate;
    if (!layer?.recorded) return;
    if (id) setRetakeLayerId(id);
    setPartName(layer.name);
    setPreviewCandidate(false);
    stopMetronome();
    pausePlayback();
    setError('');
    setRecordingState(recorderRef.current ? 'ready' : 'idle');
  }

  function enterWorkspace(useDemo: boolean) {
    if (workspace || busy || locked) return;
    getEngine().pause(); setPlaying(false); setError('');
    setWorkspace(true); setWithDemo(useDemo); setTitle(useDemo ? 'After hours · my version' : 'Untitled song'); setCandidate(null); setSoloId(null);
    setLayers(useDemo ? layers : []);
    setRecordingState('idle');
    getEngine().configureSession(useDemo ? layers : []);
  }

  function stopMetronome(keepPreview = false) {
    metronomeRef.current?.stop();
    updateBeat.current = null;
    if (!keepPreview) setMetronomePreview(false);
    setBeatIndex(-1);
  }

  function startVisualBeat(context: AudioContext, when: number, beatSeconds: number, until = Infinity) {
    updateBeat.current = () => {
      if (context.currentTime >= until) stopMetronome();
      else setBeatIndex(metronomeBeatAt(context.currentTime, when, beatSeconds));
    };
  }

  const setupFor = useCallback((recorder: MicrophoneRecorder) =>
    calibrationSetup(recorder.device, recorder.context, audioDevices.current), []);

  const savedTimingFor = useCallback((recorder: MicrophoneRecorder): SavedTiming | null => {
    const setup = setupFor(recorder);
    let entry = timingProfiles.current.get(setup.key);
    if (!entry) {
      try {
        const profile = readCalibration(localStorage, setup);
        if (profile) entry = { profile, persistent: true };
      } catch { /* Calibration remains available for this session when storage is blocked. */ }
    }
    return entry && sameCalibrationOutput(entry.profile.outputLatency, setup.outputLatency)
      ? { delay: entry.profile.delay, persistent: entry.persistent, outputKnown: setup.outputKnown }
      : null;
  }, [setupFor]);

  const refreshAudioDevices = useCallback(async (recorder: MicrophoneRecorder) => {
    const request = ++deviceQuery.current;
    const listed = await navigator.mediaDevices.enumerateDevices().catch(() => null);
    if (request !== deviceQuery.current || recorderRef.current !== recorder) return;
    if (listed) {
      audioDevices.current = listed;
      setDevices(listed.filter(item => item.kind === 'audioinput'));
    }
    setTiming(savedTimingFor(recorder));
  }, [savedTimingFor]);

  useEffect(() => {
    const recorder = recorderRef.current;
    if (!recorder || !microphoneLabel) return;
    const media = navigator.mediaDevices;
    const refresh = () => { void refreshAudioDevices(recorder); };
    const refreshVisible = () => { if (!document.hidden) refresh(); };
    media.addEventListener('devicechange', refresh);
    recorder.context.addEventListener('sinkchange', refresh);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      media.removeEventListener('devicechange', refresh);
      recorder.context.removeEventListener('sinkchange', refresh);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [microphoneLabel, inputDevice, refreshAudioDevices]);

  function cancelCalibration() {
    if (!activeCalibration.current) return;
    activeCalibration.current = null;
    recorderRef.current?.cancel();
    setCalibrating(false);
    setBusy(false);
  }

  async function calibrateTiming(): Promise<SavedTiming | null> {
    const recorder = recorderRef.current;
    if (recordingState !== 'ready' || !recorder || busy || locked || activeCalibration.current) return null;
    const run = {};
    activeCalibration.current = run;
    const current = () => !disposed.current && activeCalibration.current === run && recorderRef.current === recorder;
    setCalibrationError('');
    setCalibrating(true);
    setBusy(true);
    stopMetronome();
    pausePlayback();
    try {
      const context = await getEngine().ready();
      if (!current()) return null;
      const setup = setupFor(recorder);
      const delay = await calibrateRecording(context, recorder);
      if (!current()) return null;
      const after = setupFor(recorder);
      if (after.key !== setup.key || !sameCalibrationOutput(setup.outputLatency, after.outputLatency)) {
        throw new Error('Audio output changed during the test. Try again with the setup you want to use.');
      }
      if (delay === null) {
        throw new Error('The mic couldn’t pick up the tones clearly. Bring the headphone or speaker closer, then try again.');
      }
      const profile = { delay, outputLatency: after.outputLatency };
      let persistent = false;
      try {
        localStorage.setItem(after.key, JSON.stringify(profile));
        persistent = true;
      } catch { /* Use this measurement until the studio closes. */ }
      timingProfiles.current.set(after.key, { profile, persistent });
      const saved = { delay, persistent, outputKnown: after.outputKnown };
      setTiming(saved);
      return saved;
    } catch (reason) {
      if (current()) {
        setCalibrationError(reason instanceof Error ? reason.message : 'Could not measure recording timing. Try again.');
      }
      return null;
    } finally {
      if (current()) {
        activeCalibration.current = null;
        setCalibrating(false);
        setBusy(false);
      }
    }
  }

  function releaseMicrophone() {
    cancelCalibration();
    setTiming(null);
    audioDevices.current = [];
    recorderRef.current?.dispose(); recorderRef.current = null;
    levelRef.current = 0; setInputLevel(0);
    setMicrophoneLabel(null);
  }

  async function enableMicrophone(deviceId = inputDevice, fallbackCandidate = candidate) {
    if (locked || busy) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      setError('Recording needs microphone support on HTTPS or localhost. Try a current Safari, Chrome, Edge or Firefox.'); return;
    }
    const run = ++runRef.current;
    stopMetronome(); releaseMicrophone();
    getEngine().pause(); setPlaying(false);
    setError(''); setRecordingState('requesting');
    let stream: MediaStream | undefined;
    try {
      const context = await getEngine().ready();
      stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      } });
      if (disposed.current || run !== runRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      let recorder: MicrophoneRecorder | undefined;
      recorder = await MicrophoneRecorder.open(context, stream, (value) => {
        if (!recorder || recorderRef.current !== recorder || disposed.current) return;
        levelRef.current = value; setInputLevel(value);
      }, (reason) => {
        if (!recorder || recorderRef.current !== recorder || disposed.current) return;
        cancelPendingRecording();
        releaseMicrophone();
        report(reason);
        setRecordingState(contentRef.current.candidate ? 'review' : 'idle');
      });
      if (disposed.current || run !== runRef.current) { recorder.dispose(); return; }
      recorderRef.current = recorder;
      setMicrophoneLabel(stream.getAudioTracks()[0]?.label || 'Connected microphone');
      setInputDevice(recorder.device.deviceId || deviceId);
      setTiming(savedTimingFor(recorder));
      // Device enumeration can wait for visibility when the Recorder is in another tab.
      // Let a deferred result restore the profile without holding up microphone setup.
      const refresh = refreshAudioDevices(recorder);
      if (!document.hidden) {
        let deadline: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([refresh, new Promise<void>(resolve => { deadline = setTimeout(resolve, 200); })]);
        clearTimeout(deadline);
      }
      if (!disposed.current && run === runRef.current && recorderRef.current === recorder) setRecordingState('ready');
    } catch (reason) {
      stream?.getTracks().forEach((track) => track.stop());
      if (disposed.current || run !== runRef.current) return;
      releaseMicrophone(); setRecordingState(fallbackCandidate ? 'review' : 'idle');
      const name = reason instanceof DOMException ? reason.name : '';
      setError(name === 'NotAllowedError' ? 'Microphone access was declined. Allow it in your browser site settings, then try again.' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'That microphone is unavailable. Choose another input and try again.' : reason instanceof Error ? reason.message : 'Could not open the microphone. Please try again.');
    }
  }

  async function stopRecording(disconnectAfter = false) {
    const recorder = recorderRef.current;
    if (!recorder || stoppingRef.current) return;
    stoppingRef.current = true;
    const run = runRef.current;
    const sampleRate = recorder.sampleRate;
    updateRecording.current = null;
    stopMetronome(); getEngine().pause(); setPlaying(false); setRecordingState('processing');
    let receivedAudio = false;
    try {
      const samples = await recorder.stop();
      if (disposed.current || run !== runRef.current) return;
      receivedAudio = true;
      if (samples.length < sampleRate * .25) throw new Error('That take was too short. Record at least a moment before stopping.');
      const id = `take-${crypto.randomUUID()}`;
      const duration = getEngine().addSamples(id, samples, sampleRate);
      decodedRecordings.current.set(id, id);
      const placement = recordedPlacement(duration, capturePlacement.current.position, capturePlacement.current.delay);
      const take: Layer = { ...placement, id, name: partName.trim() || `Layer ${layers.length + 1}`, kind: 'recording', enabled: true, volume: .85, recorded: true, blob: recordingBlob(encodeWavBytes([samples], sampleRate)), duration, peaks: getEngine().peaks(id) };
      getEngine().configureSession([...backingLayers, take], capturePlacement.current.position);
      setPosition(capturePlacement.current.position);
      // Create the retake draft only after the microphone returns actual samples.
      const original = candidate ?? layers.find(layer => layer.id === retakeLayerId);
      const next = original?.recorded
        ? appendTake(original, { id, blob: take.blob, duration, peaks: take.peaks, ...placement })
        : { ...take, takeId: id, takes: takesOf(take) };
      decodedRecordings.current.delete(next.id);
      editHistory.current = []; setUndoCount(0);
      setCandidate(next); setPreviewCandidate(true); setSoloId(null); setRecordingState('review');
    } catch (reason) {
      if (!disposed.current && run === runRef.current) {
        if (!receivedAudio) releaseMicrophone();
        report(reason);
        setRecordingState(candidate ? 'review' : recorderRef.current && !disconnectAfter ? 'ready' : 'idle');
      }
    } finally {
      stoppingRef.current = false;
      if (disconnectAfter && !disposed.current && run === runRef.current) releaseMicrophone();
    }
  }

  async function record() {
    if (recordingState !== 'ready' || !recorderRef.current || busy || activeCalibration.current) return;
    const run = runRef.current;
    const recorder = recorderRef.current;
    stopMetronome(); setError(''); setRecordingState('countdown'); setCountdown(0);
    setLivePeaks([]); setElapsed(0); setSoloId(null);
    try {
      const engine = getEngine();
      const context = await engine.ready();
      await prepareAudio();
      if (disposed.current || run !== runRef.current || recorder !== recorderRef.current) return;
      const position = engine.position;
      const savedTiming = savedTimingFor(recorder);
      setTiming(savedTiming);
      const followingAudio = canSoundClick(metronomeMode, headphones) || (volume > 0 && backingLayers.some(
        layer => layer.enabled && layer.volume > 0 && clipBounds(layer).end > position));
      capturePlacement.current = {
        position,
        delay: followingAudio ? savedTiming?.delay ?? recordingDelay(context, recorder.inputLatency) : 0,
      };
      setRecordFrom(position);
      engine.configureSession(backingLayers, position);
      const { beatSeconds, startAt, beatAt } = recordingSchedule(context.currentTime, tempo, countIn, position, beatOffset);
      recorder.start(startAt);
      engine.volume(volume);
      engine.playAt(backingLayers, startAt, position);
      metronomeRef.current = new Metronome(context);
      metronomeRef.current.start(beatAt, tempo, canSoundClick(metronomeMode, headphones));
      if (metronomeMode !== 'off') startVisualBeat(context, beatAt, beatSeconds);
      let lastPeakAt = startAt - .08;
      const update = () => {
        const time = context.currentTime;
        const seconds = time - startAt;
        if (seconds < 0) {
          const beat = metronomeBeatAt(time, beatAt, beatSeconds);
          setCountdown(countIn && beat >= 0 ? Math.max(0, 4 - beat) : 0);
        } else {
          setRecordingState('recording'); setCountdown(0); setElapsed(seconds); setPosition(position + seconds);
          if (time - lastPeakAt >= .075) {
            lastPeakAt = time;
            setLivePeaks((current) => [...current.slice(-63), Math.min(1, levelRef.current * 3)]);
          }
        }
      };
      update();
      updateRecording.current = update;
    } catch (reason) {
      if (run === runRef.current && !disposed.current) {
        recorder.cancel(); stopMetronome(); getEngine().pause(); setPlaying(false);
        setCountdown(0); report(reason); setRecordingState(candidate ? 'review' : 'ready');
      }
    }
  }

  function cancelPendingRecording() {
    runRef.current++;
    updateRecording.current = null;
    recorderRef.current?.cancel();
    stopMetronome(); getEngine().pause(); setPlaying(false); setCountdown(0);
  }

  function cancelCountIn() {
    cancelPendingRecording();
    setRecordingState('ready');
  }

  function returnToTake() {
    cancelPendingRecording();
    setRecordingState('review');
  }

  function disconnectMicrophone() {
    cancelPendingRecording();
    releaseMicrophone();
    setRecordingState(candidate ? 'review' : 'idle');
  }

  async function alignBeat(id: string) {
    const layer = layers.find(item => item.id === id);
    if (!layer || locked || busy) return;
    const run = runRef.current;
    setBusy(true);
    setBeatAlignmentStatus('Finding the beat…');
    try {
      const builtInStem = !layer.recorded && (demoLayers.some(item => item.id === id) || id === harmonyLayer.id);
      const { startAt, trimStart } = clipBounds(layer);
      const [prepared] = builtInStem ? [layer] : await prepareAudio(false, layer);
      if (run !== runRef.current || disposed.current) return;
      // The original demo stems were generated on the same 84 BPM grid.
      const alignment = builtInStem
        ? { tempo: 84, beatOffset: nextBeatDelay(0, 84, startAt - trimStart) }
        : getEngine().measureBeat(prepared);
      if (!alignment) {
        setBeatAlignmentStatus(`Couldn’t find a steady beat in ${layer.name}. Try a layer with a clearer rhythm.`);
        return;
      }
      stopMetronome();
      setTempo(alignment.tempo);
      setBeatOffset(alignment.beatOffset);
      setBeatAlignmentStatus(`Aligned to ${layer.name} at ${alignment.tempo} BPM.`);
    } catch (reason) {
      if (!disposed.current) setBeatAlignmentStatus(reason instanceof Error ? reason.message : 'Could not read audio for beat alignment.');
    } finally {
      if (!disposed.current) setBusy(false);
    }
  }

  function startBeatPreview(context: AudioContext) {
    stopMetronome();
    const engine = getEngine();
    const clock = engine.playbackClock;
    let when = context.currentTime + .08;
    let until = Infinity;
    if (clock && beatOffset !== undefined) {
      const outputStart = clock.startTime + OUTPUT_DELAY;
      when += nextBeatDelay(when - outputStart, tempo, beatOffset);
      until = outputStart + engine.duration;
    }
    metronomeRef.current = new Metronome(context);
    metronomeRef.current.start(when, tempo, canSoundClick(metronomeMode, headphones), until);
    setMetronomePreview(true);
    startVisualBeat(context, when, 60 / tempo, until);
  }

  async function previewMetronome() {
    if (locked || busy) return;
    if (metronomePreview) { stopMetronome(); return; }
    setBusy(true);
    const run = runRef.current;
    try {
      const context = await getEngine().ready();
      if (run !== runRef.current || disposed.current) return;
      startBeatPreview(context);
    } catch (reason) { report(reason); }
    finally { setBusy(false); }
  }

  async function reviewTake(alone: boolean) {
    if (!candidate || locked || busy) return;
    setError(''); setBusy(true); stopMetronome();
    try {
      await prepareAudio(true);
      const review = [...backingLayers, candidate].map((layer) => ({ ...layer, enabled: alone ? layer.id === candidate.id : layer.id === candidate.id || layer.enabled }));
      setSoloId(alone ? candidate.id : null); setPreviewCandidate(true);
      getEngine().configureSession([...backingLayers, candidate], getEngine().position);
      await getEngine().play(review, true, getEngine().position);
      getEngine().volume(volume); setPlaying(true);
    } catch (reason) { report(reason); }
    finally { setBusy(false); }
  }

  async function downloadSong() {
    if (locked || busy || exporting.current) return;
    exporting.current = true; setExportBusy(true); setBusy(true); setError(''); setExportStatus('Preparing audio…');
    const filename = songFilename(title);
    try {
      const prepared = await prepareAudio(false);
      const blob = await exportSong(prepared, volume, (stage) => { if (!disposed.current) setExportStatus(stage); });
      if (disposed.current) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExportStatus('Your WAV is ready. Check your downloads.');
    } catch (reason) {
      if (!disposed.current) {
        setExportStatus('');
        report(reason instanceof RangeError ? new Error('This song is too large to download on this device. Try a desktop browser with more available memory.') : reason);
      }
    } finally {
      exporting.current = false;
      if (!disposed.current) { setExportBusy(false); setBusy(false); }
    }
  }

  function download(layer: Layer) {
    if (!layer.blob) return;
    const url = URL.createObjectURL(layer.blob);
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `${layer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${layer.blob.type.includes('wav') ? 'wav' : layer.blob.type.includes('mp4') ? 'm4a' : 'webm'}`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    songId, cloudStatus: cloud.status(songId, localRevision), cloudError: cloud.errors[songId], retryCloud: cloud.retry,
    title, setTitle, artwork, setArtwork, localReady: localReady && !accountBlocked, loadError: accountBlocked ? 'Sign in to the account that owns this song to reopen it. Your local recordings are still on this device.' : loadError, saveState, saveError, audioError, retrySave: () => persistSong(), openMySongs,
    layers, archivedLayers, candidate, retakeLayerId, playing, busy, error, workspace, withDemo, recordingState, countdown,
    split, splitError, importSong, cancelSplit: () => splitRun.current?.abort(),
    elapsed, position, recordFrom, advanceClock, duration: engineRef.current?.duration ?? 80 / 7, inputLevel, volume, soloId,
    locked, hasRecordings, previewCandidate,
    togglePlayback, pausePlayback, stopPlayback, stopVersion, readSongPosition, seekSong, beginScrub, scrubSong, endScrub, toggleLayer, previewHarmony, toggleCandidatePreview, discardDemoPreview, keepCandidate, enterWorkspace, applyTourScene,
    beginEdit, updateClip, chooseTake, renameLayer, manageLayer, undoEdit, canUndoEdit: undoCount > 0, recordAnother, cancelRetake, discardTake, canDiscardTake: nextDraft !== candidate,
    enableMicrophone, record, stopRecording, cancelCountIn, returnToTake, disconnectMicrophone, download, downloadSong, exportStatus, exportBusy, reviewTake,
    partName, setPartName, tempo, beatOffset, beatAlignmentStatus, alignBeat, countIn, setCountIn, metronomeMode, headphones, beatIndex, metronomePreview, livePeaks, devices, inputDevice, previewMetronome,
    timing, calibrating, calibrationError, calibrateTiming, cancelCalibration,
    microphoneConnected: microphoneLabel !== null,
    microphoneLabel: microphoneLabel ?? 'Microphone not connected',
    setTempo: (value: number) => {
      stopMetronome();
      setBeatOffset(undefined);
      setBeatAlignmentStatus('');
      setTempo(Math.max(40, Math.min(240, Number.isFinite(value) ? value : 84)));
    },
    setMetronomeMode: (mode: MetronomeMode) => { stopMetronome(); setMetronomeMode(mode); },
    setHeadphones: (value: boolean) => { stopMetronome(); setHeadphones(value); if (!value && metronomeMode === 'sound') setMetronomeMode('visual'); },
    changeInput: (id: string) => { setInputDevice(id); void enableMicrophone(id); },
    setPreviewCandidate, setError,
    setSoloId: (id: string | null) => { if (!locked) setSoloId(id); },
    setLayerColor: (id: string, color: LayerColor) => {
      if (!locked && !busy) setLayers(current => current.map(layer => layer.id === id && layer.color !== color ? { ...layer, color } : layer));
    },
    setLayerVolume: (id: string, value: number) => setLayers((current) => current.map((layer) => layer.id === id ? { ...layer, volume: value } : layer)),
    setVolume: (value: number) => { setVolumeState(value); getEngine().volume(value); },
  };
}

export type Studio = ReturnType<typeof useStudio>;
