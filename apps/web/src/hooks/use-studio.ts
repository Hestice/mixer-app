'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../lib/audio-engine';
import { commitLayer, demoLayers, harmonyLayer, tourScene, type Layer } from '../lib/session';

export type RecordingState = 'idle' | 'requesting' | 'ready' | 'countdown' | 'recording' | 'processing' | 'review';

export function useStudio() {
  const engineRef = useRef<AudioEngine | null>(null);
  const getEngine = () => engineRef.current ?? (engineRef.current = new AudioEngine());
  const tourChapterRef = useRef(0);
  const [layers, setLayers] = useState<Layer[]>(demoLayers);
  const [candidate, setCandidate] = useState<Layer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [workspace, setWorkspace] = useState(false);
  const [withDemo, setWithDemo] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [countdown, setCountdown] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [position, setPosition] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [volume, setVolumeState] = useState(0.65);
  const [previewCandidate, setPreviewCandidate] = useState(true);
  const [soloId, setSoloId] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const monitorRef = useRef<AudioContext | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const hasRecordings = layers.some((layer) => layer.recorded) || !!candidate?.recorded;
  const locked = ['requesting', 'countdown', 'recording', 'processing'].includes(recordingState);
  const mix = [...layers, ...(candidate ? [{ ...candidate, enabled: previewCandidate }] : [])].map((layer) => ({
    ...layer, enabled: soloId ? layer.id === soloId : layer.enabled,
  }));
  const mixRef = useRef(mix);
  mixRef.current = mix;

  useEffect(() => { engineRef.current?.sync(mix); }, [layers, candidate, previewCandidate, soloId, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    disposed.current = false;
    const interval = setInterval(() => setPosition(engineRef.current?.position ?? 0), 100);
    return () => {
      disposed.current = true;
      clearInterval(interval);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void monitorRef.current?.close();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hasRecordings && recordingState !== 'recording') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasRecordings, recordingState]);

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
      if (!workspace || withDemo) await engine.loadDemo();
      await engine.play(mixRef.current);
      engine.volume(volume);
      setPlaying(true);
    } catch (reason) { report(reason); }
    finally { setBusy(false); }
  }

  async function toggleLayer(id: string) {
    if (locked || busy) return;
    const next = layers.map((layer) => layer.id === id ? { ...layer, enabled: !layer.enabled } : layer);
    setSoloId(null); setLayers(next);
    // An explicit enable action should be audible even if the song was paused.
    if (!playing && next.find((layer) => layer.id === id)?.enabled) {
      setBusy(true); setError('');
      try {
        if (!workspace || withDemo) await getEngine().loadDemo();
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
      if (!workspace || withDemo) await getEngine().loadDemo();
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

  function keepCandidate() {
    if (!candidate || locked) return;
    if (!layers.length && candidate.recorded) {
      // The first freely timed recording defines the composition's loop.
      getEngine().reset(); setPlaying(false);
    }
    setLayers((current) => commitLayer(current, candidate));
    setCandidate(null); setSoloId(null); setPreviewCandidate(true);
    setRecordingState('idle');
  }

  function enterWorkspace(useDemo: boolean) {
    if (workspace || busy || locked) return;
    getEngine().reset(); setPlaying(false); setError('');
    setWorkspace(true); setWithDemo(useDemo); setCandidate(null); setSoloId(null);
    setLayers(useDemo ? layers : []);
    setRecordingState('idle');
    if (useDemo) getEngine().setLoopDuration(80 / 7);
  }

  async function enableMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Recording needs a browser with microphone support on HTTPS or localhost. You can still explore the demo.'); return;
    }
    setError(''); setRecordingState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (disposed.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const context = new AudioContext();
      monitorRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser(); analyser.fftSize = 256;
      source.connect(analyser); // Intentionally never connected to speakers.
      const data = new Float32Array(analyser.fftSize);
      const measure = () => {
        if (context.state === 'closed' || disposed.current) return;
        analyser.getFloatTimeDomainData(data);
        setInputLevel(Math.min(1, Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length) * 5));
        requestAnimationFrame(measure);
      };
      measure();
      setRecordingState('ready');
    } catch (reason) {
      setRecordingState(candidate ? 'review' : 'idle');
      const name = reason instanceof DOMException ? reason.name : '';
      setError(name === 'NotAllowedError' ? 'Microphone access was declined. Allow it in your browser site settings, then try again.' : name === 'NotFoundError' ? 'No microphone was found. Connect one and try again.' : 'Could not open the microphone. Check that another app is not using it.');
    }
  }

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void monitorRef.current?.close(); monitorRef.current = null;
    setInputLevel(0);
  }, []);

  function stopRecording() {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    if (recorderRef.current?.state === 'recording') { setRecordingState('processing'); recorderRef.current.stop(); }
    getEngine().reset(); setPlaying(false);
  }

  async function beginTake() {
    const stream = streamRef.current;
    if (!stream) return;
    try {
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { setError('The recording was interrupted. Your previous layers are still here.'); stopRecording(); };
      recorder.onstop = async () => {
        releaseMicrophone();
        if (disposed.current) return;
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          if (blob.size < 100) throw new Error('That take was too short. Try recording a little longer.');
          const id = `take-${crypto.randomUUID()}`;
          const duration = await getEngine().addRecording(id, blob);
          if (!layers.length) getEngine().setLoopDuration(duration);
          setCandidate({ id, name: `Take ${layers.filter((layer) => layer.recorded).length + 1}`, kind: 'recording', enabled: true, volume: 0.85, recorded: true, blob, peaks: getEngine().peaks(id) });
          setPreviewCandidate(true); setSoloId(null); setRecordingState('review');
        } catch (reason) { report(reason); setRecordingState(candidate ? 'review' : 'idle'); }
      };
      getEngine().reset();
      if (layers.length) {
        if (withDemo) await getEngine().loadDemo();
        await getEngine().play(layers, true);
        setPlaying(true);
      }
      recorder.start(100);
      setElapsed(0); setRecordingState('recording');
      const started = Date.now();
      recordingTimer.current = setInterval(() => setElapsed((Date.now() - started) / 1000), 100);
      // Overdubs capture one cycle; free first takes are capped to avoid accidental runaway capture.
      stopTimer.current = setTimeout(stopRecording, layers.length ? getEngine().duration * 1000 : 120_000);
    } catch (reason) { releaseMicrophone(); report(reason); setRecordingState(candidate ? 'review' : 'idle'); }
  }

  function record() {
    if (recordingState !== 'ready') return;
    setCountdown(3); setRecordingState('countdown');
    let remaining = 3;
    countdownRef.current = setInterval(() => {
      remaining -= 1; setCountdown(remaining);
      if (!remaining) { clearInterval(countdownRef.current!); countdownRef.current = null; void beginTake(); }
    }, 1000);
  }

  function cancelSetup() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null; releaseMicrophone();
    setCountdown(0); setRecordingState(candidate ? 'review' : 'idle');
  }

  function download(layer: Layer) {
    if (!layer.blob) return;
    const url = URL.createObjectURL(layer.blob);
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `${layer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${layer.blob.type.includes('mp4') ? 'm4a' : 'webm'}`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    layers, candidate, playing, busy, error, workspace, withDemo, recordingState, countdown,
    elapsed, position, duration: engineRef.current?.duration ?? 80 / 7, inputLevel, volume, soloId,
    locked, hasRecordings, previewCandidate,
    togglePlayback, toggleLayer, previewHarmony, toggleCandidatePreview, discardDemoPreview, keepCandidate, enterWorkspace, applyTourScene,
    enableMicrophone, record, stopRecording, cancelSetup, download,
    setPreviewCandidate, setError,
    setSoloId: (id: string | null) => { if (!locked) setSoloId(id); },
    setLayerVolume: (id: string, value: number) => setLayers((current) => current.map((layer) => layer.id === id ? { ...layer, volume: value } : layer)),
    setVolume: (value: number) => { setVolumeState(value); getEngine().volume(value); },
  };
}

export type Studio = ReturnType<typeof useStudio>;
