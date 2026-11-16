'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, GripVertical, PanelTop } from 'lucide-react';
import { deckLayoutKey, deckPositions, defaultDeckLayout, moveDeckPanel, panelNames, readDeckLayout,
  type DeckPosition, type StudioPanel } from '../lib/studio-layout';
import type { StudioDeckControls } from '../hooks/use-studio-deck-controls';
import type { useDetachedStudioPanels } from '../hooks/use-detached-studio-panels';
import { panelIcons, RecorderPanel, TimelinePanel, TurntablePanel } from './studio-panel-content';

const positionNames = { top: 'Top', left: 'Left', right: 'Right', bottom: 'Bottom' };
const arrowPositions = { ArrowUp: 'top', ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'bottom' } as const;
const panelIds = Object.keys(panelNames) as StudioPanel[];
type Drag = { panel: StudioPanel; target: DeckPosition | null; cursor?: { x: number; y: number } };
type Grab = { panel: StudioPanel; pointer: number; x: number; y: number; moving: boolean };

export function StudioDeck({ deck, tabs }: { deck: StudioDeckControls; tabs: ReturnType<typeof useDetachedStudioPanels> }) {
  const [layout, setLayout] = useState(defaultDeckLayout);
  const [drag, setDrag] = useState<Drag | null>(null);
  const grab = useRef<Grab | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const grid = useRef<HTMLDivElement>(null);
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

  function move(panel: StudioPanel, position: DeckPosition, keyboard = false) {
    const next = moveDeckPanel(layout, panel, position);
    if (next !== layout) {
      if (keyboard) focusAfterMove.current = panel;
      saveLayout(next);
      setAnnouncement(`${panelNames[panel]} moved to the ${position}.`);
    }
  }

  const visible = deckPositions.flatMap(position => {
    const panel = panelIds.find(id => layout[id] === position && !tabs.panels.includes(id));
    return panel ? [{ panel, position }] : [];
  });
  const occupied = new Set(visible.map(item => item.position));
  const expanded = visible.find(item => item.panel === 'timeline')
    ?? visible.find(item => item.panel === 'recorder') ?? visible[0];
  const fill = 'minmax(145px, 1fr)';
  const sideFill = expanded?.position === 'left' || expanded?.position === 'right';
  const rows = [
    expanded?.position === 'top' ? fill : occupied.has('top') ? 'auto' : '0px',
    sideFill ? fill : occupied.has('left') || occupied.has('right') ? 'auto' : '0px',
    expanded?.position === 'bottom' ? fill : occupied.has('bottom') ? 'auto' : '0px',
  ].join(' ');
  const style = {
    '--deck-rows': rows,
    '--deck-stacked-rows': visible.map(item => item === expanded ? fill : 'auto').join(' '),
  } as CSSProperties;

  function positionAt(x: number, y: number) {
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-position]');
    if (!hit || !grid.current?.contains(hit)) return null;
    return deckPositions.find(position => position === hit.dataset.position) ?? null;
  }

  function pickUp(event: PointerEvent<HTMLButtonElement>, panel: StudioPanel) {
    if (event.button !== 0 || !event.isPrimary || grab.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    grab.current = { panel, pointer: event.pointerId, x: event.clientX, y: event.clientY, moving: false };
  }

  function followPointer(event: PointerEvent<HTMLButtonElement>) {
    const origin = grab.current;
    if (!origin || origin.pointer !== event.pointerId) return;
    const { clientX: x, clientY: y } = event;
    if (!origin.moving && Math.hypot(x - origin.x, y - origin.y) < 6) return;
    origin.moving = true;
    setDrag({ panel: origin.panel, target: positionAt(x, y), cursor: { x, y } });
  }

  function putDown(event: PointerEvent<HTMLButtonElement>, canceled = false) {
    const origin = grab.current;
    if (!origin || origin.pointer !== event.pointerId) return;
    grab.current = null;
    setDrag(null);
    if (!canceled && origin.moving) {
      const position = positionAt(event.clientX, event.clientY);
      if (position) move(origin.panel, position);
    }
  }

  function toggleKeyboardDrag(panel: StudioPanel) {
    if (drag?.panel === panel && !drag.cursor) {
      if (drag.target && drag.target !== layout[panel]) move(panel, drag.target, true);
      else setAnnouncement(`${panelNames[panel]} stays in place.`);
      setDrag(null);
    } else {
      setDrag({ panel, target: layout[panel] });
      setAnnouncement(`${panelNames[panel]} picked up. Use the arrow keys to choose a position, then press Enter to drop.`);
    }
  }

  function arrangeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, panel: StudioPanel) {
    if (grab.current) return;
    const carrying = drag?.panel === panel && !drag.cursor;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) toggleKeyboardDrag(panel);
    } else if (carrying && event.key === 'Escape') {
      event.preventDefault();
      setDrag(null);
      setAnnouncement('Move canceled.');
    } else if (carrying && Object.hasOwn(arrowPositions, event.key)) {
      event.preventDefault();
      const position = arrowPositions[event.key as keyof typeof arrowPositions];
      const occupant = visible.find(item => item.position === position && item.panel !== panel);
      setDrag({ panel, target: position });
      setAnnouncement(occupant ? `${positionNames[position]}. Swap with ${panelNames[occupant.panel]}.` : positionNames[position]);
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
    <div className="studio-deck-grid" ref={grid} style={style} data-sides={occupied.has('left') && occupied.has('right')}
      data-timeline-side={visible.find(item => item.panel === 'timeline')?.position}>
      {visible.map(({ panel, position }) => {
        const Icon = panelIcons[panel];
        const label = panelNames[panel];
        return <div className="studio-deck-panel" key={panel} data-panel={panel} data-position={position} data-primary={expanded?.position === position}
          data-filled={expanded?.position === position || sideFill && (position === 'left' || position === 'right')}
          data-picked-up={drag?.panel === panel}
          data-target={!!drag && drag.panel !== panel && drag.target === position}>
          <div className="studio-panel-bar">
            <button type="button" className="studio-panel-grip" aria-label={`Move ${label.toLowerCase()}`}
              aria-describedby="studio-drag-help" title={`Drag to move ${label.toLowerCase()}`}
              onPointerDown={event => pickUp(event, panel)} onPointerMove={followPointer}
              onPointerUp={event => putDown(event)} onPointerCancel={event => putDown(event, true)}
              onLostPointerCapture={event => putDown(event, true)} onKeyDown={event => arrangeWithKeyboard(event, panel)}
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
            ? <TimelinePanel deck={deck} /> : <RecorderPanel deck={deck} />}
        </div>;
      })}
      {drag && <div className="studio-drop-targets" aria-hidden="true">
        {deckPositions.filter(position => !occupied.has(position)).map(position =>
          <div key={position} data-position={position} data-target={drag.target === position}>
            <span>{positionNames[position]}</span>
          </div>)}
      </div>}
      {!visible.length && <p className="studio-all-detached">All panels are open in separate tabs.</p>}
    </div>
    {drag?.cursor && DragIcon && createPortal(<div className="studio-drag-preview" aria-hidden="true"
      style={{ left: drag.cursor.x, top: drag.cursor.y }}><DragIcon size={15} />{panelNames[drag.panel]}</div>, document.body)}
    <span className="studio-sr-only" id="studio-drag-help">Drag to rearrange. With a keyboard, press Space to pick up, use the arrow keys to choose a position, then press Enter to drop.</span>
    <span className="studio-sr-only" role="status">{announcement}</span>
  </>;
}
