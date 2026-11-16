import { Download, Mic, Square } from './icons';
import type { Studio } from '../hooks/use-studio';

export function RecordingPanel({ studio, onKeep }: { studio: Studio; onKeep: () => void }) {
  const state = studio.recordingState;
  const recording = state === 'recording';
  function capture() {
    if (recording) studio.stopRecording();
    else if (state === 'countdown') studio.cancelCountIn();
    else if (state === 'review') studio.recordAnother();
    else if (state === 'ready') studio.record();
    else void studio.enableMicrophone();
  }
  const action = state === 'idle' ? 'Connect microphone' : state === 'ready' ? 'Record my layer' : state === 'recording' ? 'Stop recording' : state === 'countdown' ? 'Cancel count-in' : state === 'requesting' ? 'Connecting...' : state === 'processing' ? 'Preparing take...' : 'Record another take';
  return <div className="recording-panel">
    {['ready','recording'].includes(state) && <div className="mic-level"><span>{studio.inputLevel > .015 ? 'Input detected' : 'Waiting for a sound'}</span><div className="input-meter" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(studio.inputLevel * 100)}><span style={{ width: `${studio.inputLevel * 100}%` }} /></div></div>}
    {state === 'review' && studio.candidate && <div className="review-actions"><button className="button button-dark" onClick={onKeep}>Keep in my song</button><button className="text-button" onClick={() => studio.setSoloId(studio.soloId === studio.candidate!.id ? null : studio.candidate!.id)}>{studio.soloId === studio.candidate.id ? 'Hear with my song' : 'Hear just this take'}</button><button className="text-button" onClick={() => studio.download(studio.candidate!)}><Download size={14} />Download take</button></div>}
    <button className={`button ${state === 'review' ? 'button-light' : 'button-record'}`} disabled={studio.busy || ['requesting','processing'].includes(state)} onClick={capture}>{recording ? <Square size={17} fill="currentColor" /> : <Mic size={18} />}{action}</button>
    {state === 'ready' && <button className="text-button" onClick={studio.disconnectMicrophone}>Disconnect microphone</button>}
    {recording && <p>{studio.layers.length ? 'Recording one loop of your song.' : 'Up to 2 minutes.'}</p>}
  </div>;
}
