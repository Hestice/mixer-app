'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendTake, editClip, selectTake, takesOf } from '../lib/clip-edits';
import type { ClipEdits } from '../lib/session';
import { RecordingReadError, readRecording, recordingBlob, recordingCopies, replaceLayerAudio } from '../lib/recording-storage';
import type { RecordArt } from '../lib/record-art';
import { OUTPUT_DELAY } from '../lib/audio-output';
import { recordingDelay, recordedPlacement } from '../lib/recording-timing';
import { AudioEngine } from '../lib/audio-engine';
import { commitLayer, demoLayers, harmonyLayer, tourScene, type Layer } from '../lib/session';
import { MicrophoneRecorder } from '../lib/microphone-recorder';
import { Metronome, canSoundClick, type MetronomeMode } from '../lib/metronome';
import { encodeWavBytes } from '../lib/wav';
import { exportSong, songFilename } from '../lib/song-export';
import { useCloud } from '../components/cloud-provider';
import { getBackupPreference } from '../lib/backup-store';
import { getSong, openLocalSong, SongWriter, storageMessage, type SongContent } from '../lib/song-store';

export type RecordingState = 'idle' | 'requesting' | 'ready' | 'countdown' | 'recording' | 'processing' | 'review';

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
  const [layers, setLayers] = useState<Layer[]>(startInWorkspace ? [] : demoLayers);
  const [candidate, setCandidate] = useState<Layer | null>(null);
  const [retakeLayerId, setRetakeLayerId] = useState<string | undefined>();
  const editHistory = useRef<{ layers: Layer[]; candidate: Layer | null; retakeLayerId?: string }[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
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
  const [countIn, setCountIn] = useState(true);
  const [metronomeMode, setMetronomeMode] = useState<MetronomeMode>('visual');
  const [headphones, setHeadphones] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [metronomePreview, setMetronomePreview] = useState(false);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [microphoneLabel, setMicrophoneLabel] = useState('Microphone not connected');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputDevice, setInputDevice] = useState('');
  const recorderRef = useRef<MicrophoneRecorder | null>(null);
  const metronomeRef = useRef<Metronome | null>(null);
  const levelRef = useRef(0);
  const runRef = useRef(0);
  const stoppingRef = useRef(false);
  const capturePlacement = useRef({ position: 0, delay: 0 });
  const [recordFrom, setRecordFrom] = useState(0);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const disposed = useRef(false);
  const hasRecordings = layers.some((layer) => layer.recorded) || !!candidate?.recorded;
  const locked = accountBlocked || (workspace && !localReady) || ['requesting', 'countdown', 'recording', 'processing'].includes(recordingState);
  const backingLayers = layers.filter((layer) => layer.id !== retakeLayerId);
  const mix = [...(candidate && previewCandidate ? backingLayers : layers), ...(candidate && (!workspace || recordingState === 'review' && previewCandidate) ? [{ ...candidate, enabled: previewCandidate }] : [])].map((layer) => ({
    ...layer, enabled: soloId ? layer.id === soloId : layer.enabled,
  }));
  const mixRef = useRef(mix);
  mixRef.current = mix;

  const content = useMemo<SongContent>(() => ({ title, artwork, layers, candidate, retakeLayerId, withDemo, volume, partName, tempo, countIn, metronomeMode }),
    [title, artwork, layers, candidate, retakeLayerId, withDemo, volume, partName, tempo, countIn, metronomeMode]);
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
      void openLocalSong(id, cloud.user?.id).then(({ song, audioError, protectionError, ownerMismatch }) => {
        if (canceled) return;
        if (ownerMismatch) { setLoadError('Sign in to the account that owns this song to reopen it. Your local recordings are still on this device.'); return; }
        if (!song) { setLoadError('This song is not on this browser. It may have been saved on another device, or its browser data was cleared.'); return; }
        setAudioError(audioError?.message ?? '');
        if (protectionError) setSaveError(storageMessage(protectionError));
        setLoadError(''); setSongId(id); setOwnerId(song.ownerId); setLocalRevision(song.revision);
        writerRef.current = new SongWriter(id, song.revision);
        setArtwork(song.artwork); setTitle(song.title); setLayers(song.layers); setCandidate(song.candidate); setRetakeLayerId(song.retakeLayerId);
        setWithDemo(song.withDemo); setVolumeState(song.volume); setPartName(song.partName);
        setTempo(song.tempo); setCountIn(song.countIn);
        // Headphones must be confirmed again before any audible click.
        setMetronomeMode(song.metronomeMode === 'sound' ? 'visual' : song.metronomeMode);
        setRecordingState(song.candidate ? 'review' : 'idle'); setPreviewCandidate(false);
        getEngine().configureSession(song.layers);
        restoredContent.current = true;
        setLocalReady(true);
      }).catch(() => { if (!canceled) setLoadError('Your songs could not be opened. Check that browser storage is available, then reload to try again.'); });
    }
    return () => { canceled = true; };
  }, [workspace, cloud.ready, cloud.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!accountBlocked) return;
    if (recordingState === 'recording') void stopRecording();
    else cancelSetup();
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

  async function openMySongs() {
    if (locked || busy) return;
    stopMetronome(); getEngine().pause(); setPlaying(false); setBusy(true);
    try {
      let snapshot = contentRef.current;
      while (true) {
        if (!(savedContent === snapshot && !saveError) && !await persistSong(snapshot)) return;
        if (snapshot === contentRef.current) break;
        snapshot = contentRef.current;
      }
      releaseMicrophone(); window.location.assign('/songs');
    } finally { if (!disposed.current) setBusy(false); }
  }

  async function prepareAudio(includeCandidate = previewCandidate) {
    const run = runRef.current;
    const engine = getEngine();
    if (!workspace || withDemo) await engine.loadDemo();
    const prepared = [...(candidate && includeCandidate ? backingLayers : layers), ...(candidate && includeCandidate ? [candidate] : [])];
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

  useEffect(() => {
    disposed.current = false;
    const interval = setInterval(() => {
      if (!recorderRef.current?.isCapturing) setPosition(engineRef.current?.position ?? 0);
      setPlaying(engineRef.current?.playing ?? false);
    }, 80);
    return () => {
      disposed.current = true;
      clearInterval(interval);
      runRef.current++;
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      if (previewTimer.current) clearInterval(previewTimer.current);
      recorderRef.current?.dispose(); recorderRef.current = null;
      metronomeRef.current?.stop();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!workspace || (saveState === 'saved' && !['countdown', 'recording', 'processing'].includes(recordingState))) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (persistedContent.current !== contentRef.current || ['countdown', 'recording', 'processing'].includes(recordingState)) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [workspace, saveState, recordingState]);

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

  async function togglePlayback() {
    if (locked || busy) return;
    setError('');
    const engine = getEngine();
    if (playing) { engine.pause(); setPlaying(false); return; }
    setBusy(true);
    try {
      await prepareAudio(previewCandidate);
      if (workspace && !layers.length && !candidate) return;
      await engine.play(mixRef.current);
      engine.volume(volume);
      setPlaying(true);
    } catch (reason) { report(reason); }
    finally { setBusy(false); }
  }

  async function seekSong(value: number) {
    if (locked || busy || !Number.isFinite(value)) return;
    const position = Math.max(0, Math.min(3600, value));
    const engine = getEngine();
    // Sources are already decoded during playback. Seeking never starts a paused song.
    engine.seek(mixRef.current, position);
    setPosition(position); setPlaying(engine.playing);
  }

  async function toggleLayer(id: string) {
    if (locked || busy) return;
    const next = layers.map((layer) => layer.id === id ? { ...layer, enabled: !layer.enabled } : layer);
    setSoloId(null); setLayers(next);
    // An explicit enable action should be audible even if the song was paused.
    if (!workspace && !playing && next.find((layer) => layer.id === id)?.enabled) {
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
    editHistory.current = [...editHistory.current.slice(-29), { layers, candidate, retakeLayerId }];
    setUndoCount(editHistory.current.length);
    getEngine().pause(); setPlaying(false);
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
    getEngine().pause(); setPlaying(false); releaseMicrophone();
    setLayers(previous.layers); setCandidate(previous.candidate); setRetakeLayerId(previous.retakeLayerId);
    setRecordingState(previous.candidate ? 'review' : 'idle'); setPreviewCandidate(false); setSoloId(null);
    decodedRecordings.current.clear(); setUndoCount(editHistory.current.length);
  }

  function keepCandidate() {
    if (!candidate || locked || busy) return;
    if (workspace) beginEdit();
    const next = retakeLayerId ? layers.map((layer) => layer.id === retakeLayerId ? { ...candidate, id: layer.id, enabled: layer.enabled, volume: layer.volume } : layer) : commitLayer(layers, candidate);
    if (workspace) { getEngine().configureSession(next, getEngine().position); setPlaying(false); }
    setLayers(next); setCandidate(null); setRetakeLayerId(undefined); setSoloId(null); setPreviewCandidate(false);
    setRecordingState('idle');
    if (workspace) setPartName(next.length === 1 ? 'Vocals' : `Layer ${next.length + 1}`);
  }

  function recordAnother(id?: string) {
    if (locked || busy || (id && candidate)) return;
    const layer = id ? layers.find((item) => item.id === id) : candidate;
    if (!layer) return;
    if (id) { setRetakeLayerId(id); setCandidate(layer); }
    setPartName(layer.name); setPreviewCandidate(false);
    void enableMicrophone(inputDevice, layer);
  }

  async function auditionLayer(layer: Layer, alone: boolean) {
    if (locked || busy) return;
    setBusy(true); setError(''); stopMetronome();
    try {
      await prepareAudio(false);
      const review = layers.map((item) => ({ ...item, enabled: alone ? item.id === layer.id : item.enabled }));
      setSoloId(alone ? layer.id : null); setPreviewCandidate(false);
      getEngine().configureSession(layers, getEngine().position);
      await getEngine().play(review, true, getEngine().position);
      getEngine().volume(volume); setPlaying(true);
    } catch (reason) { report(reason); }
    finally { setBusy(false); }
  }

  function enterWorkspace(useDemo: boolean) {
    if (workspace || busy || locked) return;
    getEngine().pause(); setPlaying(false); setError('');
    setWorkspace(true); setWithDemo(useDemo); setTitle(useDemo ? 'After hours · my version' : 'Untitled song'); setCandidate(null); setSoloId(null);
    setLayers(useDemo ? layers : []);
    setRecordingState('idle');
    getEngine().configureSession(useDemo ? layers : []);
  }

  function stopMetronome() {
    metronomeRef.current?.stop();
    if (previewTimer.current) clearInterval(previewTimer.current);
    previewTimer.current = null;
    setMetronomePreview(false); setBeat(-1);
  }

  function releaseMicrophone() {
    recorderRef.current?.dispose(); recorderRef.current = null;
    levelRef.current = 0; setInputLevel(0);
    setMicrophoneLabel('Microphone not connected');
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
      const recorder = await MicrophoneRecorder.open(context, stream, (value) => {
        if (run !== runRef.current || disposed.current) return;
        levelRef.current = value; setInputLevel(value);
      }, (reason) => {
        runRef.current++;
        if (recordingTimer.current) clearInterval(recordingTimer.current);
        stopMetronome(); releaseMicrophone(); getEngine().pause(); setPlaying(false);
        report(reason); setRecordingState(fallbackCandidate ? 'review' : 'idle');
      });
      if (disposed.current || run !== runRef.current) { recorder.dispose(); return; }
      recorderRef.current = recorder;
      setMicrophoneLabel(stream.getAudioTracks()[0]?.label || 'Connected microphone');
      setInputDevice(stream.getAudioTracks()[0]?.getSettings().deviceId || deviceId);
      setRecordingState('ready');
      void navigator.mediaDevices.enumerateDevices().then((items) => {
        if (!disposed.current && run === runRef.current) setDevices(items.filter((item) => item.kind === 'audioinput'));
      }).catch(() => {});
    } catch (reason) {
      stream?.getTracks().forEach((track) => track.stop());
      if (disposed.current || run !== runRef.current) return;
      releaseMicrophone(); setRecordingState(fallbackCandidate ? 'review' : 'idle');
      const name = reason instanceof DOMException ? reason.name : '';
      setError(name === 'NotAllowedError' ? 'Microphone access was declined. Allow it in your browser site settings, then try again.' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'That microphone is unavailable. Choose another input and try again.' : reason instanceof Error ? reason.message : 'Could not open the microphone. Please try again.');
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || stoppingRef.current) return;
    stoppingRef.current = true;
    const run = runRef.current;
    const sampleRate = recorder.sampleRate;
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    stopMetronome(); getEngine().pause(); setPlaying(false); setRecordingState('processing');
    try {
      const samples = await recorder.stop();
      if (disposed.current || run !== runRef.current) return;
      if (samples.length < sampleRate * .25) throw new Error('That take was too short. Record at least a moment before stopping.');
      const id = `take-${crypto.randomUUID()}`;
      const duration = getEngine().addSamples(id, samples, sampleRate);
      decodedRecordings.current.set(id, id);
      const placement = recordedPlacement(duration, capturePlacement.current.position, capturePlacement.current.delay);
      const take: Layer = { ...placement, id, name: partName.trim() || `Layer ${layers.length + 1}`, kind: 'recording', enabled: true, volume: .85, recorded: true, blob: recordingBlob(encodeWavBytes([samples], sampleRate)), duration, peaks: getEngine().peaks(id) };
      getEngine().configureSession([...backingLayers, take], capturePlacement.current.position);
      setPosition(capturePlacement.current.position);
      // A retry adds an alternative; the previous recording and its edits remain intact.
      const next = candidate?.recorded ? appendTake(candidate, { id, blob: take.blob, duration, peaks: take.peaks, ...placement }) : { ...take, takeId: id, takes: takesOf(take) };
      decodedRecordings.current.delete(next.id);
      editHistory.current = []; setUndoCount(0);
      setCandidate(next); setPreviewCandidate(true); setSoloId(null); setRecordingState('review');
    } catch (reason) {
      if (!disposed.current && run === runRef.current) { report(reason); setRecordingState(candidate ? 'review' : 'idle'); }
    } finally {
      stoppingRef.current = false;
      if (!disposed.current && run === runRef.current) releaseMicrophone();
    }
  }

  async function record() {
    if (recordingState !== 'ready' || !recorderRef.current || busy) return;
    const run = runRef.current;
    const recorder = recorderRef.current;
    stopMetronome(); setError(''); setRecordingState('countdown'); setCountdown(countIn ? 4 : 0);
    setLivePeaks([]); setElapsed(0); setSoloId(null);
    try {
      const engine = getEngine();
      const context = await engine.ready();
      await prepareAudio();
      if (disposed.current || run !== runRef.current || recorder !== recorderRef.current) return;
      const position = engine.position;
      capturePlacement.current = { position, delay: backingLayers.some(layer => layer.enabled && layer.volume > 0) || canSoundClick(metronomeMode, headphones) ? recordingDelay(context, recorder.inputLatency) : 0 };
      setRecordFrom(position);
      engine.configureSession(backingLayers, position);
      const beatSeconds = 60 / tempo;
      const countAt = context.currentTime + .12;
      const startAt = countAt + (countIn ? 4 * beatSeconds : 0);
      recorder.start(startAt);
      engine.volume(volume);
      engine.playAt(backingLayers, startAt, position);
      metronomeRef.current = new Metronome(context);
      metronomeRef.current.start(countAt + OUTPUT_DELAY, tempo, canSoundClick(metronomeMode, headphones));
      const update = () => {
        const seconds = context.currentTime - startAt;
        if (seconds < 0) {
          setCountdown(countIn ? Math.min(4, Math.ceil(-seconds / beatSeconds)) : 0);
        } else {
          setRecordingState('recording'); setCountdown(0); setElapsed(seconds); setPosition(position + seconds);
          setLivePeaks((current) => [...current.slice(-63), Math.min(1, levelRef.current * 3)]);
        }
        setBeat(metronomeMode !== 'off' || seconds < 0 ? Math.max(0, Math.floor((context.currentTime - countAt) / beatSeconds)) % 4 : -1);
      };
      update();
      recordingTimer.current = setInterval(update, 80);
    } catch (reason) {
      if (run === runRef.current && !disposed.current) {
        recorder.cancel(); stopMetronome(); getEngine().pause(); releaseMicrophone();
        report(reason); setRecordingState(candidate ? 'review' : 'idle');
      }
    }
  }

  function cancelSetup() {
    runRef.current++;
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    stopMetronome(); releaseMicrophone(); getEngine().pause(); setPlaying(false);
    setCountdown(0); setRecordingState(candidate ? 'review' : 'idle');
  }

  async function previewMetronome() {
    if (locked || busy) return;
    if (metronomePreview) { stopMetronome(); return; }
    setBusy(true);
    const run = runRef.current;
    try {
      const context = await getEngine().ready();
      if (run !== runRef.current || disposed.current) return;
      const when = context.currentTime + .08;
      metronomeRef.current = new Metronome(context);
      metronomeRef.current.start(when, tempo, canSoundClick(metronomeMode, headphones));
      setMetronomePreview(true);
      previewTimer.current = setInterval(() => setBeat(Math.max(0, Math.floor((context.currentTime - when) / (60 / tempo))) % 4), 40);
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
    layers, candidate, retakeLayerId, playing, busy, error, workspace, withDemo, recordingState, countdown,
    elapsed, position, recordFrom, duration: engineRef.current?.duration ?? 80 / 7, inputLevel, volume, soloId,
    locked, hasRecordings, previewCandidate,
    togglePlayback, seekSong, toggleLayer, previewHarmony, toggleCandidatePreview, discardDemoPreview, keepCandidate, enterWorkspace, applyTourScene,
    beginEdit, updateClip, chooseTake, undoEdit, canUndoEdit: undoCount > 0, recordAnother, auditionLayer,
    enableMicrophone, record, stopRecording, cancelSetup, download, downloadSong, exportStatus, exportBusy, reviewTake,
    partName, setPartName, tempo, countIn, setCountIn, metronomeMode, headphones, beat, metronomePreview, livePeaks, microphoneLabel, devices, inputDevice, previewMetronome,
    setTempo: (value: number) => { stopMetronome(); setTempo(Math.max(40, Math.min(240, Number.isFinite(value) ? value : 84))); },
    setMetronomeMode: (mode: MetronomeMode) => { stopMetronome(); setMetronomeMode(mode); },
    setHeadphones: (value: boolean) => { stopMetronome(); setHeadphones(value); if (!value && metronomeMode === 'sound') setMetronomeMode('visual'); },
    changeInput: (id: string) => { setInputDevice(id); void enableMicrophone(id); },
    setPreviewCandidate, setError,
    setSoloId: (id: string | null) => { if (!locked) setSoloId(id); },
    setLayerVolume: (id: string, value: number) => setLayers((current) => current.map((layer) => layer.id === id ? { ...layer, volume: value } : layer)),
    setVolume: (value: number) => { setVolumeState(value); getEngine().volume(value); },
  };
}

export type Studio = ReturnType<typeof useStudio>;
