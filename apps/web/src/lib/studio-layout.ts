export const panelNames = {
  turntable: 'Turntable',
  timeline: 'Layers & timeline',
  recorder: 'Recorder',
} as const;

export type StudioPanel = keyof typeof panelNames;

export const deckPositions = ['top', 'left', 'right', 'bottom'] as const;
export type DeckPosition = typeof deckPositions[number];
export type DeckLayout = StudioPanel | { axis: 'rows' | 'columns'; first: DeckLayout; second: DeckLayout };
export type DeckDrop = { kind: 'dock'; position: DeckPosition } | { kind: 'swap'; panel: StudioPanel };

export const defaultDeckLayout: DeckLayout = {
  axis: 'rows',
  first: 'turntable',
  second: { axis: 'columns', first: 'timeline', second: 'recorder' },
};
export const deckLayoutKey = 'listening-room:studio-layout';
export const panelPath = '/studio/panel';

export function isStudioPanel(value: unknown): value is StudioPanel {
  return typeof value === 'string' && Object.hasOwn(panelNames, value);
}

function isDeckLayout(value: unknown, seen: Set<StudioPanel>): value is DeckLayout {
  if (isStudioPanel(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  }
  return !!value && typeof value === 'object' && 'axis' in value && 'first' in value && 'second' in value
    && (value.axis === 'rows' || value.axis === 'columns')
    && isDeckLayout(value.first, seen) && isDeckLayout(value.second, seen);
}

export function readDeckLayout(value: string | null): DeckLayout {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    const seen = new Set<StudioPanel>();
    if (isDeckLayout(parsed, seen) && seen.size === 3) return parsed;

    const legacy = parsed as Record<StudioPanel, DeckPosition>;
    const panels = Object.keys(panelNames) as StudioPanel[];
    const positions = panels.map(panel => legacy[panel]);
    if (new Set(positions).size === 3 && positions.every(position => deckPositions.includes(position))) {
      const [top, left, right, bottom] = deckPositions.map(position => panels.find(panel => legacy[panel] === position));
      const middle: DeckLayout | undefined = left && right ? { axis: 'columns', first: left, second: right } : left ?? right;
      return [top, middle, bottom].filter((row): row is DeckLayout => !!row)
        .reduce((first, second) => ({ axis: 'rows', first, second }));
    }
  } catch {
    // An invalid preference can always fall back to the default deck.
  }
  return defaultDeckLayout;
}

export function visibleDeckLayout(layout: DeckLayout, detached: readonly StudioPanel[]): DeckLayout | null {
  if (typeof layout === 'string') return detached.includes(layout) ? null : layout;
  const first = visibleDeckLayout(layout.first, detached);
  const second = visibleDeckLayout(layout.second, detached);
  if (!first || !second) return first ?? second;
  return first === layout.first && second === layout.second ? layout : { ...layout, first, second };
}

export function deckGrid(layout: DeckLayout): StudioPanel[][] {
  if (typeof layout === 'string') return [[layout]];
  const first = deckGrid(layout.first);
  const second = deckGrid(layout.second);
  // With three panels, at most one half of a split can have its own tracks.
  if (layout.axis === 'columns') {
    return Array.from({ length: Math.max(first.length, second.length) }, (_, index) =>
      [...first[index % first.length], ...second[index % second.length]]);
  }
  const columns = Math.max(first[0].length, second[0].length);
  return [...first, ...second].map(row => Array.from({ length: columns }, (_, index) => row[index % row.length]));
}

export function panelAtDeckEdge(grid: StudioPanel[][], position: DeckPosition): StudioPanel | null {
  if (!grid.length) return null;
  const edge = position === 'top' ? grid[0]
    : position === 'bottom' ? grid[grid.length - 1]
    : grid.map(row => position === 'left' ? row[0] : row[row.length - 1]);
  return edge.every(panel => panel === edge[0]) ? edge[0] : null;
}

export function dockDeckPanel(layout: DeckLayout, panel: StudioPanel, position: DeckPosition): DeckLayout {
  if (panelAtDeckEdge(deckGrid(layout), position) === panel) return layout;
  const rest = visibleDeckLayout(layout, [panel]);
  if (!rest) return layout;
  const axis = position === 'left' || position === 'right' ? 'columns' : 'rows';
  return position === 'top' || position === 'left'
    ? { axis, first: panel, second: rest }
    : { axis, first: rest, second: panel };
}

export function swapDeckPanels(layout: DeckLayout, panel: StudioPanel, other: StudioPanel): DeckLayout {
  if (typeof layout === 'string') return layout === panel ? other : layout === other ? panel : layout;
  const first = swapDeckPanels(layout.first, panel, other);
  const second = swapDeckPanels(layout.second, panel, other);
  return first === layout.first && second === layout.second ? layout : { ...layout, first, second };
}

export type DeckSnapRegion = {
  position: DeckPosition;
  bounds: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;
};

export function deckDropTarget(
  { x, y }: { x: number; y: number },
  source: StudioPanel,
  regions: DeckSnapRegion[],
  hovered?: StudioPanel,
): DeckDrop | null {
  const edge = regions.find(({ bounds }) => x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom);
  if (edge) return { kind: 'dock', position: edge.position };
  return hovered && hovered !== source ? { kind: 'swap', panel: hovered } : null;
}
