'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { CircleAlert, AudioLines, ArrowRight, Check, Upload, X } from 'lucide-react';
import type { Studio } from '../hooks/use-studio';
import { isFileDrop } from '../lib/file-drop';
import { SongImport } from './song-import';

export function SongSplitDialog({ studio, open, onOpenChange, showEntry }: {
  studio: Studio; open: boolean; onOpenChange: (value: boolean) => void; showEntry: boolean;
}) {
  const [over, setOver] = useState(false);
  const [dropError, setDropError] = useState('');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const disabled = studio.busy || studio.locked;
  const result = studio.splitResult;
  const progress = studio.split?.progress;
  function changeOpen(next: boolean) {
    if (next) setDropError('');
    onOpenChange(next);
  }
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    {showEntry && <Dialog.Trigger asChild><button className="landing-split-entry" disabled={disabled} data-over={over}
      onDragOver={event => {
        if (!isFileDrop(event.dataTransfer)) return;
        event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={event => {
        if (!isFileDrop(event.dataTransfer)) return;
        event.preventDefault(); setOver(false);
        if (disabled) return;
        onOpenChange(true);
        const files = event.dataTransfer.files;
        setDropError(files.length === 1 ? '' : 'Choose one song at a time.');
        if (files.length === 1) void studio.importSong(files[0]);
      }}>
      <Upload size={16} aria-hidden="true" /><span>Split your own song</span>
    </button></Dialog.Trigger>}
    <Dialog.Portal>
      <Dialog.Overlay className="song-split-overlay" />
      <Dialog.Content className="song-split-dialog" onInteractOutside={event => { if (studio.split) event.preventDefault(); }}>
        <div className="song-split-heading">
          <Dialog.Title>{result ? 'Your song is ready' : 'Split a song'}</Dialog.Title>
          <Dialog.Close className="song-split-close" aria-label="Close song splitter" title={studio.split ? 'Close and keep splitting' : 'Close song splitter'}><X size={20} aria-hidden="true" /></Dialog.Close>
        </div>
        <Dialog.Description className="studio-sr-only">Separate vocals, drums, bass and other instruments.</Dialog.Description>
        {result ? <div className="song-split-result">
          <strong>{result.title}</strong><p>{result.layerCount} layers saved on this device</p>
          <a className="button button-dark" href={`/studio?song=${result.id}`}>Open in studio<ArrowRight size={16} aria-hidden="true" /></a>
          <button className="text-button" onClick={studio.clearSplitResult}>Split another song</button>
        </div> : <SongImport studio={studio} inDialog />}
        {dropError && !studio.split && !result && <p role="alert">{dropError}</p>}
      </Dialog.Content>
    </Dialog.Portal>
    {mounted && !open && (studio.split || result || studio.splitError) && createPortal(<button className="song-split-job" onClick={() => changeOpen(true)} aria-label={result ? 'Open completed song split' : studio.splitError ? 'Show song split error' : 'Show song split progress'}>
      {result ? <Check size={18} aria-hidden="true" /> : studio.splitError ? <CircleAlert size={18} aria-hidden="true" /> : <AudioLines size={18} aria-hidden="true" />}
      <span role="status">{result ? 'Your song is ready' : studio.splitError ? 'Song split failed' : studio.split?.saving ? 'Saving your song…' : 'Splitting your song…'}</span>
      {!result && progress !== null && progress !== undefined && progress > 0 && <span>{Math.round(progress * 100)}%</span>}
    </button>, document.body)}
  </Dialog.Root>;
}
