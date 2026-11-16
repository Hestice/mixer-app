import { useCallback, useRef, useState } from 'react';
import { clipBounds } from '../lib/clip-edits';
import type { Studio } from './use-studio';

type TurntableCue = { start: () => Promise<void>; stop: () => void };

export function useStudioDeckControls(studio: Studio) {
  const [notice, setNotice] = useState('');
  const [compactDeck, setCompactDeck] = useState(false);
  const [captureOptions, setCaptureOptions] = useState<boolean | null>(null);
  const [cueing, setCueing] = useState(false);
  const cuePending = useRef(false);
  const turntable = useRef<TurntableCue | null>(null);
  const recorder = useRef<(() => void) | null>(null);
  const state = studio.recordingState;
  const duration = Math.max(0, ...studio.layers.map(layer => clipBounds(layer).end));
  const span = Math.max(16, duration + 4, studio.candidate ? clipBounds(studio.candidate).end + 4 : 0,
    state === 'recording' ? studio.recordFrom + studio.elapsed + 4 : 0);

  const registerTurntable = useCallback((cue: TurntableCue) => {
    turntable.current = cue;
    return () => { if (turntable.current === cue) turntable.current = null; };
  }, []);

  const registerRecorder = useCallback((focus: () => void) => {
    recorder.current = focus;
    return () => { if (recorder.current === focus) recorder.current = null; };
  }, []);

  async function toggleTransport(keptMix = false) {
    if (studio.locked || studio.busy || cuePending.current) return;
    if (studio.playing) {
      studio.pausePlayback();
      return;
    }
    const cue = turntable.current;
    cuePending.current = true;
    setCueing(true);
    try {
      await studio.togglePlayback({ cue: cue?.start, closeCue: cue?.stop, keptMix });
    } finally {
      cuePending.current = false;
      setCueing(false);
    }
  }

  function stopTransport() {
    studio.stopPlayback();
    turntable.current?.stop();
  }

  function revealRecording() {
    recorder.current?.();
  }

  function capture() {
    setNotice('');
    if (state === 'recording') {
      setCaptureOptions(true);
      void studio.stopRecording();
    } else if (state === 'countdown') studio.cancelCountIn();
    else if (state === 'ready') void studio.record();
    else if (state === 'review' && studio.candidate) {
      const name = studio.candidate.name;
      setCaptureOptions(null);
      studio.keepCandidate();
      setNotice(studio.retakeLayerId ? `${name} now uses this take. Earlier takes are still saved.` : `${name} added to your song.`);
    } else if (state === 'idle') {
      setCaptureOptions(true);
      void studio.enableMicrophone();
    }
  }

  function discardTake() {
    if (!studio.discardTake()) return;
    setNotice('Take discarded. Undo brings it back.');
    revealRecording();
  }

  function retakeLayer(id: string) {
    setCaptureOptions(true);
    setNotice('');
    studio.recordAnother(id);
    revealRecording();
  }

  function addLayer() {
    revealRecording();
    if (state === 'idle') capture();
    else setCaptureOptions(true);
  }

  return {
    studio, notice, setNotice, compactDeck, setCompactDeck, captureOptions, setCaptureOptions, cueing, span, duration,
    registerTurntable, registerRecorder, toggleTransport, stopTransport, capture, discardTake, retakeLayer, addLayer, revealRecording,
  };
}

export type StudioDeckControls = ReturnType<typeof useStudioDeckControls>;
