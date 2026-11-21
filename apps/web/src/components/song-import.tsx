'use client';

import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { AudioLines, Upload, X } from 'lucide-react';
import type { Studio } from '../hooks/use-studio';
import { isFileDrop } from '../lib/file-drop';
import { splitDurationLimit, splitStems } from '../lib/song-separation';
import { RecordDisc } from './record-artwork';
import './song-import.css';

const listeningNotes = [
  'Try singing over the backing parts.',
  'Hear the bass to follow the chord changes.',
  'Record your own harmony.',
];

function SplitProgress({ split, cancel }: { split: NonNullable<Studio['split']>; cancel: () => void }) {
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - split.startedAt) / 1000));
  useEffect(() => {
    const interval = setInterval(() => setSeconds(Math.floor((Date.now() - split.startedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [split.startedAt]);
  const stage = split.saving ? 'Saving your song…' : split.progress === null ? 'Opening audio…' : split.progress === 0
    ? 'Setting up the split…' : split.progress === 1 ? 'Preparing your layers…' : 'Separating the parts…';
  return <div className="song-split-progress">
    <div className="song-split-status"><strong role="status">{stage}</strong>{split.progress !== null && split.progress > 0 && <span>{Math.round(split.progress * 100)}%</span>}</div>
    <span className="studio-import-file" title={split.fileName}>{split.fileName}</span>
    <div className="song-split-parts" aria-hidden="true">{Object.entries(splitStems).map(([id, part], index) => <div key={id} style={{ '--part-index': index } as CSSProperties}>
      <span>{part.name}</span><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
    </div>)}</div>
    <progress aria-label="Song split progress" max={1} value={split.progress ?? undefined} />
    <p className="song-split-note" key={Math.floor(seconds / 12)}>{listeningNotes[Math.floor(seconds / 12) % listeningNotes.length]}</p>
    <div className="song-split-bottom"><span>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} elapsed</span><button className="song-split-cancel" type="button" onClick={cancel} disabled={split.saving}><X size={14} aria-hidden="true" />Cancel split</button></div>
  </div>;
}

export function SongImport({ studio, inDialog = false }: { studio: Studio; inDialog?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [dropError, setDropError] = useState('');
  const { split } = studio;
  const disabled = studio.locked || studio.busy;

  function choose(files: FileList | null) {
    if (!files?.length || disabled) return;
    if (files.length !== 1) { setDropError('Choose one song at a time.'); return; }
    setDropError('');
    void studio.importSong(files[0]);
  }

  function handleDrag(event: DragEvent) {
    if (!isFileDrop(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    if (!disabled) setOver(true);
  }

  return <div className="studio-song-import" onDragOver={handleDrag}
    onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setOver(false); }}
    onDrop={event => {
      if (!isFileDrop(event.dataTransfer)) return;
      event.preventDefault();
      setOver(false);
      choose(event.dataTransfer.files);
    }}>
    <input hidden ref={input} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={event => {
      choose(event.target.files);
      event.target.value = '';
    }} />
    <div className="studio-import-surface" data-over={over} data-splitting={!!split} aria-busy={!!split}>
      <span className="studio-import-art" aria-hidden="true">
        <span className="studio-import-disc"><RecordDisc /></span>
        <span className="studio-import-sleeve"><AudioLines size={24} /></span>
      </span>
      {split ? <SplitProgress split={split} cancel={studio.cancelSplit} /> : <button className="studio-import-pick" type="button" disabled={disabled} onClick={() => input.current?.click()}>
        <span className="studio-import-copy"><strong className="studio-import-title">{inDialog ? 'Drop a file or browse' : 'Split a song'}</strong>
          {!inDialog && <span>{over ? 'Drop your song' : 'Drop a file or browse'}</span>}<small>MP3 or WAV, up to {splitDurationLimit}</small>
        </span>
        <Upload className="studio-import-icon" size={20} aria-hidden="true" />
      </button>}
    </div>
    {split ? <p>This can take a few minutes. Keep this tab open.</p> : <p>Get separate vocals, drums, bass, and other instruments.</p>}
    {(dropError || studio.splitError) && <p className="studio-import-error" role="alert">{dropError || studio.splitError}</p>}
  </div>;
}
