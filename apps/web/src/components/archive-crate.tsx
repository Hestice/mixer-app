import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ArchiveRestore, Check, ChevronLeft, ChevronRight, CloudCheck, HardDrive } from 'lucide-react';
import { RecordDisc, RecordSleeve } from './record-artwork';
import type { RecordArt } from '../lib/record-art';
import { timeLabel } from '../lib/session';
import { animateArchiveRestore } from './archive-restore-animation';

const recordsPerCrate = 6;
type RestoreMotion = (restored: Set<string>) => Promise<void>;

interface ArchivedSong {
  id: string;
  title: string;
  artwork?: RecordArt;
  layerCount: number;
  duration: number;
  hasTake: boolean;
  backedUp: boolean;
  backupStatus: string;
  backupError?: string;
  canManage: boolean;
}

export function ArchiveCrate({ songs, selected, restoring, onSelect, onClear, restoreTarget, onRestore, onRetry, renderActions }: {
  songs: ArchivedSong[];
  selected: string[];
  restoring: boolean;
  onSelect: (id: string) => void;
  onClear: () => void;
  restoreTarget: RefObject<HTMLButtonElement | null>;
  onRestore: (animate: RestoreMotion) => void;
  onRetry: () => void;
  renderActions: (id: string, animate: RestoreMotion) => ReactNode;
}) {
  const [browsedId, setBrowsedId] = useState<string>();
  const [hoveredId, setHoveredId] = useState<string>();
  const [tippedCount, setTippedCount] = useState(0);
  const [page, setPage] = useState(0);
  const crate = useRef<HTMLDivElement>(null);
  const lastPage = Math.ceil(songs.length / recordsPerCrate) - 1;
  const currentPage = Math.min(page, lastPage);
  const firstRecord = currentPage * recordsPerCrate;
  const stack = songs.slice(firstRecord, firstRecord + recordsPerCrate);
  const browsed = stack.find(song => song.id === browsedId) ?? stack[0];
  const StorageIcon = browsed.backedUp ? CloudCheck : HardDrive;
  const selectedOffline = songs.some(song => selected.includes(song.id) && !song.canManage);
  const restoreDisabled = restoring || !selected.length || selectedOffline;
  const hasPreviewNotes = songs.some(song => song.backupError || !song.canManage);
  const selectedOutsideCrate = songs.filter(song => selected.includes(song.id) && !stack.includes(song)).slice(0, recordsPerCrate);

  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [lastPage, page]);

  function browse(direction: -1 | 1) {
    const nextPage = currentPage + direction;
    if (restoring || nextPage < 0 || nextPage > lastPage) return;
    setHoveredId(undefined);
    setTippedCount(0);
    setPage(nextPage);
  }

  function animate(restored: Set<string>) {
    return animateArchiveRestore(crate.current, restoreTarget.current, restored);
  }

  return <section className="archive-room" aria-labelledby="archive-title">
    <header className="archive-header">
      <div>
        <h2 id="archive-title">Archive</h2>
        <p>Browse the sleeves and select the songs you want to restore.</p>
      </div>
      {lastPage > 0 && <div className="archive-browse-buttons" role="group" aria-label="Browse records">
        <button type="button" className="library-dialog-button" aria-label="Previous records" aria-disabled={restoring || currentPage === 0} onClick={() => browse(-1)}><ChevronLeft size={17} aria-hidden="true" /></button>
        <span>{firstRecord + 1}–{firstRecord + stack.length} of {songs.length}</span>
        <button type="button" className="library-dialog-button" aria-label="Next records" aria-disabled={restoring || currentPage === lastPage} onClick={() => browse(1)}><ChevronRight size={17} aria-hidden="true" /></button>
      </div>}
    </header>
    <div ref={crate} className="archive-crate" onPointerLeave={event => {
      setHoveredId(undefined);
      if (!event.currentTarget.querySelector('.archive-record-picker:focus-visible')) setTippedCount(0);
    }} onBlur={event => {
      if (!hoveredId && !event.currentTarget.contains(event.relatedTarget)) setTippedCount(0);
    }}>
      <ul className="archive-records" aria-label="Archived songs">
        {stack.map((song, index) => {
          const isSelected = selected.includes(song.id);
          const blocked = restoring || (!song.canManage && !isSelected);
          return <li key={song.id} className="archive-record" data-flight-song={song.id}
            data-hovered={song.id === hoveredId} data-selected={isSelected} data-tipped={index < tippedCount}
            style={{ '--slot': stack.length - index - 1 } as CSSProperties}>
            <span className="archive-record-art" aria-hidden="true">
              <span className="archive-record-disc"><RecordDisc artwork={song.artwork} /></span>
              <RecordSleeve artwork={song.artwork} title={song.title} />
              <span className="archive-record-check">{isSelected && <Check size={13} strokeWidth={2.5} />}</span>
            </span>
            <button type="button" className="archive-record-picker" aria-label={song.title} aria-pressed={isSelected}
              aria-disabled={blocked} onPointerMove={event => {
                if (event.pointerType === 'touch' || restoring) return;
                if (song.id === hoveredId && song.id === browsed.id) return;
                setBrowsedId(song.id);
                setHoveredId(song.id);
                setTippedCount(current => Math.max(current, index));
              }}
              onFocus={event => {
                setBrowsedId(song.id);
                if (event.currentTarget.matches(':focus-visible')) setTippedCount(current => Math.max(current, index));
              }} onClick={() => {
                setBrowsedId(song.id);
                if (!blocked) onSelect(song.id);
              }} />
          </li>;
        })}
      </ul>
      <div className="archive-crate-front" aria-hidden="true"><span /></div>
      <div className="archive-crate-side" aria-hidden="true" />
      {selectedOutsideCrate.length > 0 && <div hidden aria-hidden="true">
        {selectedOutsideCrate.map(song => <div key={song.id} data-flight-song={song.id}>
          <RecordSleeve artwork={song.artwork} title={song.title} />
        </div>)}
      </div>}
    </div>
    <div className="archive-preview">
      <div className="archive-preview-copy">
        <h3 title={browsed.title}>{browsed.title}</h3>
        <div className="song-card-meta">
          <span className="song-backup-status" data-storage={browsed.backedUp ? 'cloud' : 'device'}>
            <StorageIcon size={13} aria-hidden="true" />{browsed.backupStatus}
          </span>
          <span>{browsed.layerCount} {browsed.layerCount === 1 ? 'layer' : 'layers'} · {timeLabel(browsed.duration)}</span>
          {browsed.hasTake && <span className="song-review-badge">Take to review</span>}
        </div>
      </div>
      {renderActions(browsed.id, animate)}
    </div>
    {hasPreviewNotes && <div className="archive-preview-note">
      {browsed.backupError ? <>
        <p className="cloud-error" title={browsed.backupError}>{browsed.backupError}</p>
        <button className="text-button" onClick={onRetry}>Retry backup</button>
      </> : !browsed.canManage && <p className="archive-offline">Connect to the internet to restore this song.</p>}
    </div>}
    {selectedOffline && <p className="archive-offline archive-selection-offline">Reconnect to restore the selected cloud songs.</p>}
    <footer className="archive-selection">
      <p role="status">{selected.length ? `${selected.length} selected` : 'No songs selected'}</p>
      <div className="song-selection-actions">
        {!!selected.length && <button type="button" className="library-dialog-button" disabled={restoring} onClick={onClear}>Clear</button>}
        <button type="button" className="library-dialog-button" data-variant="primary" aria-disabled={restoreDisabled}
          onClick={() => { if (!restoreDisabled) onRestore(animate); }}><ArchiveRestore size={16} aria-hidden="true" />
          {restoring ? 'Restoring…' : selected.length === 1 ? 'Restore song' : 'Restore songs'}
        </button>
      </div>
    </footer>
  </section>;
}
