'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, GripVertical, PanelTop } from 'lucide-react';
import { deckDropTarget, deckGrid, deckLayoutKey, deckPositions, defaultDeckLayout, dockDeckPanel, isStudioPanel,
  panelAtDeckEdge, panelNames, readDeckLayout, swapDeckPanels, visibleDeckLayout,
  type DeckDrop, type DeckLayout, type DeckSnapRegion, type StudioPanel } from '../lib/studio-layout';
import type { StudioDeckControls } from '../hooks/use-studio-deck-controls';
import type { useDetachedStudioPanels } from '../hooks/use-detached-studio-panels';
import { panelIcons, RecorderPanel, TimelinePanel, TurntablePanel } from './studio-panel-content';

const arrowPositions = { ArrowUp: 'top', ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'bottom' } as const;
type Drag = { panel: StudioPanel; target: DeckDrop | null; cursor?: { x: number; y: number } };
type Grab = { panel: StudioPanel; pointer: number; x: number; y: number; moving: boolean };

export function StudioDeck({ deck, tabs }: { deck: StudioDeckControls; tabs: ReturnType<typeof useDetachedStudioPanels> }) {
  const [layout, setLayout] = useState<DeckLayout>(defaultDeckLayout);
  const [drag, setDrag] = useState<Drag | null>(null);
  const grab = useRef<Grab | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const grid = useRef<HTMLDivElement>(null);
  const snapTargets = useRef<HTMLDivElement>(null);
  const beforeMove = useRef(new Map<string, DOMRect>());
  const focusAfterMove = useRef<StudioPanel | null>(null);

  useLayoutEffect(() => {
    try { setLayout(readDeckLayout(localStorage.getItem(deckLayoutKey))); }
    catch { /* The deck still works without a saved layout. */ }
  }, []);

  useLayoutEffect(() => {
    if (focusAfterMove.current) {
      grid.current?.querySelector<HTMLElement>(`[data-panel="${focusAfterMove.current}"] .studio-panel-grip`)?.focus({ preventScroll: true });
      focusAfterMove.current = null;
    }
    if (!beforeMove.current.size) return;
    for (const node of grid.current?.querySelectorAll<HTMLElement>('[data-panel]') ?? []) {
      const before = beforeMove.current.get(node.dataset.panel!);
      if (!before) continue;
      const after = node.getBoundingClientRect();
      const x = before.left - after.left;
      const y = before.top - after.top;
      if (x || y) node.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 280, easing: 'cubic-bezier(.22,.74,.25,1)' });
    }
    beforeMove.current.clear();
  }, [layout]);

  function saveLayout(next: typeof layout) {
    if (next === layout) return;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const node of grid.current?.querySelectorAll<HTMLElement>('[data-panel]') ?? []) {
        beforeMove.current.set(node.dataset.panel!, node.getBoundingClientRect());
        node.getAnimations().forEach(animation => animation.cancel());
      }
    }
    setLayout(next);
    try { localStorage.setItem(deckLayoutKey, JSON.stringify(next)); }
    catch { /* Use the new layout for the current session. */ }
  }

  function move(panel: StudioPanel, target: DeckDrop, keyboard = false) {
    const next = target.kind === 'dock' ? dockDeckPanel(layout, panel, target.position) : swapDeckPanels(layout, panel, target.panel);
    if (next === layout) return;
    if (keyboard) focusAfterMove.current = panel;
    saveLayout(next);
    setAnnouncement(target.kind === 'dock'
      ? `${panelNames[panel]} docked at the ${target.position}.`
      : `${panelNames[panel]} swapped with ${panelNames[target.panel]}.`);
  }

  const attached = visibleDeckLayout(layout, tabs.panels);
  const matrix = attached ? deckGrid(attached) : [];
  const visible = [...new Set(matrix.flat())];
  const recorderIndex = visible.indexOf('recorder');
  const stackedRecorderDirection = recorderIndex < visible.indexOf('timeline') ? 'top' : 'bottom';
  const sharedRecorderRow = matrix.find(row => row.includes('timeline') && row.includes('recorder'));
  const recorderDirection = sharedRecorderRow
    ? sharedRecorderRow.indexOf('recorder') < sharedRecorderRow.indexOf('timeline') ? 'left' : 'right'
    : stackedRecorderDirection;
  const primary = visible.includes('timeline') ? 'timeline' : visible.includes('recorder') ? 'recorder' : visible[0];
  const primaryRow = matrix.findIndex(row => row.includes(primary) && row.includes('recorder'));
  const fillRow = primaryRow < 0 ? matrix.findIndex(row => row.includes(primary)) : primaryRow;
  const trackCount = matrix[0]?.length ?? 0;
  const timelineColumns = Array.from({ length: trackCount }, (_, column) => column)
    .filter(column => matrix.some(row => row[column] === 'timeline'));
  const style = {
    '--deck-areas': matrix.map(row => `"${row.join(' ')}"`).join(' '),
    '--deck-rows': matrix.map((_, index) => index === fillRow ? 'minmax(145px, 1fr)' : 'auto').join(' '),
    '--deck-columns': Array.from({ length: trackCount }, (_, index) =>
      timelineColumns.length === 1 && index !== timelineColumns[0]
        ? `minmax(0, min(${trackCount === 3 ? 25 : 38}%, 335px))`
        : 'minmax(0, 1fr)').join(' '),
    '--deck-stacked-rows': visible.map(panel => panel === primary ? 'minmax(145px, 1fr)' : 'auto').join(' '),
  } as CSSProperties;
  const savedGrid = deckGrid(layout);
  const edgePanels = deckPositions.map(position => panelAtDeckEdge(savedGrid, position));

  function positionAt(x: number, y: number, panel: StudioPanel) {
    const regions: DeckSnapRegion[] = deckPositions.flatMap((position, index) => {
      if (edgePanels[index] === panel) return [];
      const target = snapTargets.current?.querySelector(`[data-position="${position}"]`);
      return target ? [{ position, bounds: target.getBoundingClientRect() }] : [];
    });
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('.studio-deck-panel');
    const hovered = hit && grid.current?.contains(hit) ? hit.dataset.panel : undefined;
    return deckDropTarget({ x, y }, panel, regions, isStudioPanel(hovered) ? hovered : undefined);
  }

  function pickUp(event: PointerEvent<HTMLButtonElement>, panel: StudioPanel) {
    if (event.button !== 0 || !event.isPrimary || grab.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    grab.current = { panel, pointer: event.pointerId, x: event.clientX, y: event.clientY, moving: false };
  }

  function followPointer(event: PointerEvent<HTMLButtonElement>) {
    const origin = grab.current;
    if (!origin || origin.pointer !== event.pointerId) return;
    const { clientX: x, clientY: y } = event;
    if (!origin.moving && Math.hypot(x - origin.x, y - origin.y) < 6) return;
    origin.moving = true;
    setDrag({ panel: origin.panel, target: positionAt(x, y, origin.panel), cursor: { x, y } });
  }

  function putDown(event: PointerEvent<HTMLButtonElement>, canceled = false) {
    const origin = grab.current;
    if (!origin || origin.pointer !== event.pointerId) return;
    grab.current = null;
    setDrag(null);
    const { clientX: x, clientY: y } = event;
    if (!canceled && (origin.moving || Math.hypot(x - origin.x, y - origin.y) >= 6)) {
      const position = positionAt(x, y, origin.panel);
      if (position) move(origin.panel, position);
    }
  }

  function toggleKeyboardDrag(panel: StudioPanel) {
    if (drag?.panel === panel && !drag.cursor) {
      if (drag.target) move(panel, drag.target, true);
      else setAnnouncement(`${panelNames[panel]} stays in place.`);
      setDrag(null);
    } else {
      setDrag({ panel, target: null });
      setAnnouncement(`${panelNames[panel]} picked up. Use the arrow keys to choose an edge or S to choose a panel to swap with.`);
    }
  }

  function arrangeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, panel: StudioPanel) {
    if (grab.current) return;
    const carrying = drag?.panel === panel && !drag.cursor;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!event.repeat) toggleKeyboardDrag(panel);
    } else if (carrying && event.key === 'Escape') {
      event.preventDefault();
      setDrag(null);
      setAnnouncement('Move canceled.');
    } else if (carrying && Object.hasOwn(arrowPositions, event.key)) {
      event.preventDefault();
      const position = arrowPositions[event.key as keyof typeof arrowPositions];
      const alreadyDocked = edgePanels[deckPositions.indexOf(position)] === panel;
      setDrag({ panel, target: alreadyDocked ? null : { kind: 'dock', position } });
      setAnnouncement(alreadyDocked ? `Already docked at the ${position}.` : `Dock ${position}.`);
    } else if (carrying && event.key.toLowerCase() === 's') {
      event.preventDefault();
      const others = visible.filter(other => other !== panel);
      if (!others.length) return;
      const index = drag.target?.kind === 'swap' ? others.indexOf(drag.target.panel) : -1;
      const other = others[(index + 1) % others.length];
      setDrag({ panel, target: { kind: 'swap', panel: other } });
      setAnnouncement(`Swap with ${panelNames[other]}.`);
    }
  }

  const DragIcon = drag && panelIcons[drag.panel];

  return <>
    {!!tabs.panels.length && <div className="studio-detached-tabs" aria-label="Detached panels">
      {tabs.panels.map(panel => <div key={panel} className="studio-tab-chip">
        <button type="button" className="studio-toolbar-button" onClick={() => tabs.focus(panel)} aria-label={`Show detached ${panelNames[panel].toLowerCase()}`}>
          <ExternalLink size={13} aria-hidden="true" />{panelNames[panel]}
        </button>
        <button type="button" className="studio-toolbar-button" onClick={() => tabs.redock(panel, true)}
          aria-label={`Dock ${panelNames[panel].toLowerCase()}`} title={`Dock ${panelNames[panel].toLowerCase()}`}><PanelTop size={14} aria-hidden="true" /></button>
      </div>)}
    </div>}
    <div className="studio-deck-area">
      <div className="studio-deck-grid" ref={grid} style={style}>
        {visible.map(panel => {
          const Icon = panelIcons[panel];
          const label = panelNames[panel];
          const row = matrix.findIndex(track => track.includes(panel));
          const column = matrix[row].indexOf(panel);
          const narrow = matrix[row].lastIndexOf(panel) - column + 1 < trackCount;
          return <div className="studio-deck-panel" key={panel} style={{ '--panel-area': panel } as CSSProperties}
            data-panel={panel} data-primary={panel === primary} data-narrow={narrow}
            data-divider-top={row > 0} data-divider-left={column > 0} data-filled={matrix[fillRow]?.includes(panel)}
            data-picked-up={drag?.panel === panel}
            data-target={drag?.target?.kind === 'swap' && drag.target.panel === panel}>
            <div className="studio-panel-bar">
              <button type="button" className="studio-panel-grip" aria-label={`Move ${label.toLowerCase()}`} data-studio-playback-shortcut
                aria-describedby="studio-drag-help" title={`Drag to move ${label.toLowerCase()}`}
                onPointerDown={event => pickUp(event, panel)} onPointerMove={followPointer}
                onPointerUp={event => putDown(event)} onPointerCancel={event => putDown(event, true)}
                onLostPointerCapture={event => putDown(event, true)} onKeyDown={event => arrangeWithKeyboard(event, panel)}
                onKeyUp={event => {
                  // Space belongs to playback even when playback is unavailable.
                  if (event.key === ' ') event.preventDefault();
                }}
                onClick={event => { if (event.detail === 0 && !grab.current) toggleKeyboardDrag(panel); }}
                onBlur={() => { if (drag && !drag.cursor) setDrag(null); }}
                onContextMenu={event => event.preventDefault()}>
                <GripVertical className="studio-panel-grip-icon" size={14} aria-hidden="true" /><Icon size={13} aria-hidden="true" />{label}
              </button>
              <div className="studio-panel-actions">
                <button type="button" className="studio-toolbar-button" aria-label={`Detach ${label.toLowerCase()}`}
                  title={`Open ${label.toLowerCase()} in a new tab`} onClick={() => tabs.detach(panel)}><ExternalLink size={14} aria-hidden="true" /></button>
              </div>
            </div>
            {panel === 'turntable' ? <TurntablePanel deck={deck} /> : panel === 'timeline'
              ? <TimelinePanel deck={deck} recorderGuide={recorderIndex >= 0 ? { direction: recorderDirection, stackedDirection: stackedRecorderDirection } : undefined} />
              : <RecorderPanel deck={deck} />}
          </div>;
        })}
        {!visible.length && <p className="studio-all-detached">All panels are open in separate tabs.</p>}
      </div>
      <div className="studio-drop-targets" ref={snapTargets} data-active={!!drag} aria-hidden="true">
        {deckPositions.map((position, index) => <div key={position} data-position={position}
          data-source={drag?.panel === edgePanels[index]}
          data-target={drag?.target?.kind === 'dock' && drag.target.position === position}>
          <span>Dock {position}</span>
        </div>)}
      </div>
    </div>
    {drag?.cursor && DragIcon && createPortal(<div className="studio-drag-preview" aria-hidden="true"
      style={{ left: drag.cursor.x, top: drag.cursor.y }}><DragIcon size={15} />
      {drag.target?.kind === 'swap' ? `Swap with ${panelNames[drag.target.panel]}` : panelNames[drag.panel]}
    </div>, document.body)}
    <span className="studio-sr-only" id="studio-drag-help">Drag to an edge to dock or onto another panel to swap. Press Enter to pick up, use the arrow keys for an edge or S to choose a panel, then press Enter to drop or Escape to cancel. Space plays or pauses the song.</span>
    <span className="studio-sr-only" role="status">{announcement}</span>
  </>;
}
