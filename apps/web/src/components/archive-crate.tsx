import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ArchiveRestore, Check, CloudCheck, HardDrive } from 'lucide-react';
import { RecordDisc, RecordSleeve } from './record-artwork';
import { recordArt, type RecordArt } from '../lib/record-art';
import { timeLabel } from '../lib/session';
import { animateArchiveRestore } from './archive-restore-animation';
import { archiveBaskets, recordsPerBasket, type ArchiveOrder } from '../lib/archive-baskets';
type RestoreMotion = (restored: Set<string>) => Promise<void>;

interface ArchivedSong {
  id: string;
  title: string;
  artwork?: RecordArt;
  archivedAt?: number | null;
  createdAt?: number;
  layerCount: number;
  duration: number;
  hasTake: boolean;
  backedUp: boolean;
  backupStatus: string;
  backupError?: string;
  canManage: boolean;
}

function CrateWalls() {
  return <>
    <span className="archive-crate-front" aria-hidden="true"><span /></span>
    <span className="archive-crate-side" aria-hidden="true" />
  </>;
}

function BasketPreview({ songs }: { songs: ArchivedSong[] }) {
  return <span className="archive-crate archive-crate-mini" aria-hidden="true">
    {songs.map((song, index) => <span key={song.id} className="archive-record"
      style={{ '--slot': songs.length - index - 1, '--cover-color': recordArt(song.artwork).sleeveColor } as CSSProperties}>
      <span className="archive-record-art" />
    </span>)}
    <CrateWalls />
  </span>;
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
  const [pointerAnchor, setPointerAnchor] = useState<{ songId: string; x: number; y: number }>();
  const [order, setOrder] = useState<ArchiveOrder>('archived');
  const [basketIndex, setBasketIndex] = useState(0);
  const crate = useRef<HTMLDivElement>(null);
  const basketOrigin = useRef<DOMRect>(null);
  const baskets = useMemo(() => archiveBaskets(songs, order), [songs, order]);
  const currentBasket = Math.min(basketIndex, baskets.length - 1);
  const stack = baskets[currentBasket].records;
  const browsed = stack.find(song => song.id === browsedId) ?? stack[0];
  const StorageIcon = browsed.backedUp ? CloudCheck : HardDrive;
  const selectedOffline = songs.some(song => selected.includes(song.id) && !song.canManage);
  const restoreDisabled = restoring || !selected.length || selectedOffline;
  const hasPreviewNotes = songs.some(song => song.backupError || !song.canManage);
  const selectedOutsideCrate = songs.filter(song => selected.includes(song.id) && !stack.includes(song)).slice(0, recordsPerBasket);

  useEffect(() => {
    if (basketIndex !== currentBasket) setBasketIndex(currentBasket);
  }, [basketIndex, currentBasket]);

  useLayoutEffect(() => {
    const origin = basketOrigin.current;
    basketOrigin.current = null;
    const element = crate.current;
    if (!origin || !element) return;
    const destination = element.getBoundingClientRect();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scroll = Math.min(destination.bottom - window.innerHeight + 24, destination.top - 24);
    if (scroll > 0) window.scrollBy({ top: scroll, behavior: reduceMotion ? 'instant' : 'smooth' });
    if (reduceMotion || !element.animate) return;
    const move = element.animate([
      { transform: `translate(${origin.left - destination.left}px, ${origin.top - destination.top}px) scale(${origin.width / destination.width})` },
      { transform: 'translate(0, 0) scale(1)' },
    ], { duration: 420, easing: 'cubic-bezier(.22,.72,.25,1)' });
    element.dataset.pulling = 'true';
    let canceled = false;
    void move.finished.catch(() => {}).then(() => {
      if (!canceled) delete element.dataset.pulling;
    });
    return () => {
      canceled = true;
      move.cancel();
      delete element.dataset.pulling;
    };
  }, [currentBasket, order]);

  function resetBrowsing() {
    setBrowsedId(undefined);
    setHoveredId(undefined);
    setPointerAnchor(undefined);
    setTippedCount(0);
  }

  function openBasket(index: number, trigger: HTMLButtonElement) {
    if (restoring || index === currentBasket) return;
    basketOrigin.current = trigger.querySelector('.archive-crate-mini')?.getBoundingClientRect() ?? null;
    resetBrowsing();
    setBasketIndex(index);
  }

  function animate(restored: Set<string>) {
    return animateArchiveRestore(crate.current, restoreTarget.current, restored);
  }

  return <section className="archive-room" aria-labelledby="archive-title">
    <header className="archive-header">
      <div>
        <h2 id="archive-title">Archive</h2>
        <p>{baskets.length > 1 ? 'Choose a basket, then select the sleeves you want to restore.' : 'Browse the sleeves and select the songs you want to restore.'}</p>
      </div>
      {songs.length > 1 && <label className="archive-sort">
        Organize by
        <select value={order} disabled={restoring} onChange={event => {
          resetBrowsing();
          setOrder(event.target.value as ArchiveOrder);
          setBasketIndex(0);
        }}>
          <option value="archived">Date archived</option>
          <option value="created">Date created</option>
          <option value="title">Title (A–Z)</option>
        </select>
      </label>}
    </header>
    {baskets.length > 1 && <ul className="archive-basket-shelf" aria-label="Archive baskets">
      {baskets.map((basket, index) => <li key={index} className="archive-basket">
        <button type="button" className="archive-basket-trigger" aria-pressed={index === currentBasket} aria-controls="archive-open-basket"
          disabled={restoring} onClick={event => openBasket(index, event.currentTarget)}>
          <BasketPreview songs={basket.records} />
          <span className="archive-basket-meta"><strong>Basket {index + 1}</strong><span>{basket.records.length} {basket.records.length === 1 ? 'sleeve' : 'sleeves'}</span></span>
          <span className="archive-basket-range" title={basket.description}>{basket.label}</span>
        </button>
      </li>)}
    </ul>}
    <div ref={crate} id="archive-open-basket" className="archive-crate archive-crate-open" onPointerLeave={event => {
      setHoveredId(undefined);
      setPointerAnchor(undefined);
      if (!event.currentTarget.querySelector('.archive-record-picker:focus-visible')) setTippedCount(0);
    }} onBlur={event => {
      if (!hoveredId && !event.currentTarget.contains(event.relatedTarget)) setTippedCount(0);
    }}>
      <ul className="archive-records" aria-label={baskets.length > 1 ? `Archived songs in basket ${currentBasket + 1}` : "Archived songs"}>
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
                if (index < tippedCount) {
                  // Keep the original hover point clickable as this sleeve returns upright.
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setPointerAnchor({ songId: song.id, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
                } else {
                  setPointerAnchor(undefined);
                }
                setBrowsedId(song.id);
                setHoveredId(song.id);
                setTippedCount(index);
              }}
              onFocus={event => {
                setBrowsedId(song.id);
                if (event.currentTarget.matches(':focus-visible')) {
                  setHoveredId(undefined);
                  setPointerAnchor(undefined);
                  setTippedCount(index);
                }
              }} onClick={() => {
                setBrowsedId(song.id);
                if (!blocked) onSelect(song.id);
              }}>
              <span className="archive-record-hit-area" aria-hidden="true" />
              {pointerAnchor?.songId === song.id && <span className="archive-record-pointer-anchor" aria-hidden="true"
                style={{ left: pointerAnchor.x, top: pointerAnchor.y }} onPointerLeave={() => setPointerAnchor(undefined)} />}
            </button>
          </li>;
        })}
      </ul>
      <CrateWalls />
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
