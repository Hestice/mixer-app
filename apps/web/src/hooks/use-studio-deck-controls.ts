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
  const recorder = useRef<((moveFocus: boolean) => void) | null>(null);
  const state = studio.recordingState;
  const duration = Math.max(0, ...studio.layers.map(layer => clipBounds(layer).end));
  const span = Math.max(16, duration + 4, studio.candidate ? clipBounds(studio.candidate).end + 4 : 0,
    state === 'recording' ? studio.recordFrom + studio.elapsed + 4 : 0);

  const registerTurntable = useCallback((cue: TurntableCue) => {
    turntable.current = cue;
    return () => { if (turntable.current === cue) turntable.current = null; };
  }, []);

  const registerRecorder = useCallback((reveal: (moveFocus: boolean) => void) => {
    recorder.current = reveal;
    return () => { if (recorder.current === reveal) recorder.current = null; };
  }, []);

  async function toggleTransport({ keptMix = false, instant = false } = {}) {
    if (studio.locked) return;
    if (cuePending.current) {
      if (instant) {
        studio.pausePlayback();
        turntable.current?.stop();
      }
      return;
    }
    if (studio.busy) return;
    if (studio.playing) {
      studio.pausePlayback();
      return;
    }
    const cue = instant ? null : turntable.current;
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

  function revealRecording(moveFocus = true) {
    recorder.current?.(moveFocus);
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

  function discardTake(moveFocus: boolean) {
    if (!studio.discardTake()) return;
    setNotice('Take discarded. Undo brings it back.');
    revealRecording(moveFocus);
  }

  function retakeLayer(id: string, moveFocus: boolean) {
    setCaptureOptions(true);
    setNotice('');
    studio.recordAnother(id);
    revealRecording(moveFocus);
  }

  function addLayer(moveFocus: boolean) {
    revealRecording(moveFocus);
    if (state === 'idle') capture();
    else setCaptureOptions(true);
  }

  return {
    studio, notice, setNotice, compactDeck, setCompactDeck, captureOptions, setCaptureOptions, cueing, span, duration,
    registerTurntable, registerRecorder, toggleTransport, stopTransport, capture, discardTake, retakeLayer, addLayer, revealRecording,
  };
}

export type StudioDeckControls = ReturnType<typeof useStudioDeckControls>;
