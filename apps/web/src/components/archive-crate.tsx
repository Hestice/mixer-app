import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArchiveRestore, Check, ChevronLeft, ChevronRight, CloudCheck, HardDrive } from 'lucide-react';
import { RecordDisc, RecordSleeve } from './record-artwork';
import type { RecordArt } from '../lib/record-art';
import { timeLabel } from '../lib/session';

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

export function ArchiveCrate({ songs, selected, restoring, onSelect, onClear, onRestore, onRetry, renderActions }: {
  songs: ArchivedSong[];
  selected: string[];
  restoring: boolean;
  onSelect: (id: string) => void;
  onClear: () => void;
  onRestore: () => void;
  onRetry: () => void;
  renderActions: (id: string) => ReactNode;
}) {
  const [browsedId, setBrowsedId] = useState<string>();
  const [hoveredId, setHoveredId] = useState<string>();
  const [scrollBounds, setScrollBounds] = useState({ previous: false, next: false });
  const viewport = useRef<HTMLDivElement>(null);
  const records = useRef<HTMLUListElement>(null);
  const browsed = songs.find(song => song.id === browsedId) ?? songs[0];
  const StorageIcon = browsed.backedUp ? CloudCheck : HardDrive;
  const selectedOffline = songs.some(song => selected.includes(song.id) && !song.canManage);
  const restoreDisabled = restoring || !selected.length || selectedOffline;

  useEffect(() => {
    const scroller = viewport.current;
    const list = records.current;
    if (!scroller || !list) return;
    const measure = () => {
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      const previous = scroller.scrollLeft > 1;
      const next = scroller.scrollLeft < maxScroll - 1;
      setScrollBounds(current => current.previous === previous && current.next === next ? current : { previous, next });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(list);
    scroller.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', measure);
    };
  }, []);

  function browse(direction: -1 | 1) {
    const scroller = viewport.current;
    if (!scroller || !(direction === -1 ? scrollBounds.previous : scrollBounds.next)) return;
    scroller.scrollBy({
      left: direction * scroller.clientWidth * .72,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  return <section className="archive-room" aria-labelledby="archive-title">
    <header className="archive-header">
      <div>
        <h2 id="archive-title">Archive</h2>
        <p>Browse the sleeves and select the songs you want to restore.</p>
      </div>
      {(scrollBounds.previous || scrollBounds.next) && <div className="archive-browse-buttons" role="group" aria-label="Browse records">
        <button type="button" className="library-dialog-button" aria-label="Scroll to previous records" aria-disabled={!scrollBounds.previous} onClick={() => browse(-1)}><ChevronLeft size={17} aria-hidden="true" /></button>
        <button type="button" className="library-dialog-button" aria-label="Scroll to next records" aria-disabled={!scrollBounds.next} onClick={() => browse(1)}><ChevronRight size={17} aria-hidden="true" /></button>
      </div>}
    </header>
    <div className="archive-crate" style={{ '--record-count': songs.length } as CSSProperties}>
      <div ref={viewport} className="archive-crate-scroll" onPointerLeave={() => setHoveredId(undefined)}>
        <ul ref={records} className="archive-records" aria-label="Archived songs">
          {songs.map(song => {
            const isSelected = selected.includes(song.id);
            const blocked = restoring || (!song.canManage && !isSelected);
            return <li key={song.id} className="archive-record" data-hovered={song.id === hoveredId} data-selected={isSelected}>
              <span className="archive-record-art" aria-hidden="true">
                <span className="archive-record-disc"><RecordDisc artwork={song.artwork} /></span>
                <RecordSleeve artwork={song.artwork} title={song.title} />
                <span className="archive-record-check">{isSelected && <Check size={15} strokeWidth={2.5} />}</span>
              </span>
              <button type="button" className="archive-record-picker" aria-label={song.title} aria-pressed={isSelected}
                aria-disabled={blocked} onPointerEnter={event => {
                  if (event.pointerType === 'touch') return;
                  setBrowsedId(song.id);
                  setHoveredId(song.id);
                }}
                onFocus={() => setBrowsedId(song.id)} onClick={() => {
                  setBrowsedId(song.id);
                  if (!blocked) onSelect(song.id);
                }} />
            </li>;
          })}
        </ul>
      </div>
      <div className="archive-crate-front" aria-hidden="true"><span /></div>
      <div className="archive-crate-side" aria-hidden="true" />
    </div>
    <div className="archive-preview">
      <div className="archive-preview-copy">
        <h3>{browsed.title}</h3>
        <div className="song-card-meta">
          <span className="song-backup-status" data-storage={browsed.backedUp ? 'cloud' : 'device'}>
            <StorageIcon size={13} aria-hidden="true" />{browsed.backupStatus}
          </span>
          <span>{browsed.layerCount} {browsed.layerCount === 1 ? 'layer' : 'layers'} · {timeLabel(browsed.duration)}</span>
          {browsed.hasTake && <span className="song-review-badge">Take to review</span>}
        </div>
        {!browsed.canManage && <p className="archive-offline">Connect to the internet to restore this song.</p>}
      </div>
      {renderActions(browsed.id)}
    </div>
    {browsed.backupError && <div className="song-backup-error"><p>{browsed.backupError}</p><button className="text-button" onClick={onRetry}>Retry backup</button></div>}
    {selectedOffline && <p className="archive-offline archive-selection-offline">Reconnect to restore the selected cloud songs.</p>}
    <footer className="archive-selection">
      <p role="status">{selected.length ? `${selected.length} selected` : 'No songs selected'}</p>
      <div className="song-selection-actions">
        {!!selected.length && <button type="button" className="library-dialog-button" disabled={restoring} onClick={onClear}>Clear</button>}
        <button type="button" className="library-dialog-button" data-variant="primary" aria-disabled={restoreDisabled}
          onClick={() => { if (!restoreDisabled) onRestore(); }}><ArchiveRestore size={16} aria-hidden="true" />
          {restoring ? 'Restoring…' : selected.length === 1 ? 'Restore song' : 'Restore songs'}
        </button>
      </div>
    </footer>
  </section>;
}
