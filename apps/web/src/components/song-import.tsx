'use client';

import { useRef, useState, type DragEvent } from 'react';
import { ArrowDownToLine, AudioLines, X } from 'lucide-react';
import type { Studio } from '../hooks/use-studio';
import { splitDurationLimit } from '../lib/song-separation';
import { RecordDisc } from './record-artwork';

export function SongImport({ studio }: { studio: Studio }) {
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
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    if (!disabled) setOver(true);
  }

  return <div className="studio-song-import" onDragOver={handleDrag}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false); }}
    onDrop={event => {
      if (!event.dataTransfer.files.length) return;
      event.preventDefault();
      setOver(false);
      choose(event.dataTransfer.files);
    }}>
    <input hidden ref={input} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={event => {
      choose(event.target.files);
      event.target.value = '';
    }} />
    <div className="studio-import-surface" data-over={over} data-splitting={!!split}>
      <span className="studio-import-art" aria-hidden="true">
        <span className="studio-import-disc"><RecordDisc /></span>
        <span className="studio-import-sleeve"><AudioLines size={24} /></span>
      </span>
      {split ? <div className="studio-import-progress">
        <span className="studio-import-title" role="status">{split.progress === null ? 'Reading audio…' : split.progress === 1 ? 'Preparing layers…' : 'Splitting the song…'}</span>
        <span className="studio-import-file" title={split.fileName}>{split.fileName}</span>
        <progress aria-label="Song split progress" max={1} value={split.progress || undefined} />
        <button className="studio-toolbar-button" type="button" onClick={studio.cancelSplit}><X size={14} aria-hidden="true" />Cancel</button>
      </div> : <button className="studio-import-pick" type="button" disabled={disabled} onClick={() => input.current?.click()}>
        <span className="studio-import-copy"><strong className="studio-import-title">Split a song</strong>
          <span>Drop a file or browse</span><small>MP3 or WAV · Up to {splitDurationLimit}</small>
        </span>
        <ArrowDownToLine className="studio-import-icon" size={16} aria-hidden="true" />
      </button>}
    </div>
    {split ? <p>This can take several minutes. Keep this tab open.</p> : <p>Get separate vocals, drums, bass, and instruments.</p>}
    {(dropError || studio.splitError) && <p className="studio-import-error" role="alert">{dropError || studio.splitError}</p>}
  </div>;
}
