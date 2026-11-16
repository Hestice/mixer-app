import { Play, Pause, Mic } from './icons';
import { Tonearm } from './tonearm';
import type { Studio } from '../hooks/use-studio';
import { useVinylRotation } from '../hooks/use-vinyl-rotation';
import { timeLabel } from '../lib/session';

export function Deck({ side, studio, chapter, showParts = false }: { side: 'left' | 'right'; studio: Studio; chapter: number; showParts?: boolean }) {
  const left = side === 'left';
  const state = studio.recordingState;
  const harmonyKept = studio.layers.some((layer) => layer.id === 'harmony');
  const canTry = !left && !studio.workspace && chapter <= 3 && !harmonyKept && !studio.candidate;
  const candidateAudible = !['countdown', 'recording', 'processing'].includes(state) && studio.playing && !!studio.candidate && (studio.soloId ? studio.soloId === studio.candidate.id : studio.previewCandidate);
  const spinning = left ? studio.playing && studio.layers.length > 0 : candidateAudible;
  const grooves = useVinylRotation(spinning);
  const empty = left ? !studio.layers.length : !studio.candidate && !canTry;
  const recording = !left && state === 'recording';
  const guitarOnly = !studio.candidate && studio.layers.every((layer) => layer.id === 'guitar' || !layer.enabled);
  const action = left ? studio.playing ? 'Pause song' : chapter === 0 && !studio.workspace && guitarOnly ? 'Play guitar' : 'Play song'
    : recording ? 'Recording' : state === 'countdown' ? 'Get ready' : state === 'processing' ? 'Preparing take' : state === 'requesting' ? 'Connecting microphone'
    : canTry ? 'Try this layer' : studio.candidate ? candidateAudible ? 'Turn layer off' : 'Turn layer on' : 'Your next take';
  const rightStatus = studio.workspace ? ({ idle: 'Ready for a new part', requesting: 'Connecting microphone', ready: 'Microphone connected', countdown: 'Count-in', recording: 'Recording', processing: 'Preparing take', review: 'Not kept yet' }[state]) : studio.candidate ? 'Not kept yet' : canTry ? 'Example: harmony' : 'Ready to record';

  const title = left ? studio.workspace && !studio.withDemo ? 'Your song' : 'After hours' : recording ? timeLabel(studio.elapsed) : state === 'countdown' ? String(studio.countdown) : studio.candidate?.name ?? (canTry ? 'Harmony' : 'Your voice');
  const disabled = studio.busy || studio.locked || empty;

  return <div className={`deck deck-${side} ${empty ? 'deck-empty' : ''} ${recording ? 'is-recording' : ''}`}>
    <h2 className="deck-heading">{left ? 'Your song' : 'Try a new layer'}<span>{left ? studio.playing ? 'Playing' : 'Paused' : rightStatus}</span></h2>
    <div className="platter-surround">
      <button className="platter" disabled={disabled} aria-label={action} onClick={() => { if (canTry) void studio.previewHarmony(); else if (left) void studio.togglePlayback(); else void studio.toggleCandidatePreview(); }}>
        <span ref={grooves} className="grooves" aria-hidden="true" />
        {!left && ['ready', 'recording'].includes(state) && <span className="input-ring" style={{ opacity: 0.15 + studio.inputLevel * .85, borderWidth: 2 + studio.inputLevel * 8 }} />}
        <span className={`record-label ${left ? 'label-sand' : 'label-slate'}`}>
          <span className="label-title">{title}</span>
          <span className="disc-symbol" aria-hidden="true">{empty ? left ? <span className="empty-disc-count">0</span> : <Mic size={22} /> : spinning ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}</span>
          <span className="disc-action">{empty && !recording && state !== 'countdown' ? left ? 'No layers yet' : 'Not recorded yet' : action}</span>
        </span>
      </button>
      <Tonearm playing={spinning} teach={left && !studio.workspace && chapter === 0 && showParts} />
    </div>
    {left && <div className="deck-readout"><span>{studio.layers.filter((layer) => layer.enabled).length} {studio.layers.filter((layer) => layer.enabled).length === 1 ? 'layer on' : 'layers on'}</span>{studio.layers.length > 0 && <time>{timeLabel(studio.position)} / {timeLabel(studio.duration)}</time>}</div>}
  </div>;
}
