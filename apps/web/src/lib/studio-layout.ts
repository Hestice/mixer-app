export const panelNames = {
  turntable: 'Turntable',
  timeline: 'Layers & timeline',
  recorder: 'Recorder',
} as const;

export type StudioPanel = keyof typeof panelNames;

export const deckPositions = ['top', 'left', 'right', 'bottom'] as const;
export type DeckPosition = typeof deckPositions[number];
export type DeckLayout = Record<StudioPanel, DeckPosition>;

export const defaultDeckLayout: DeckLayout = { turntable: 'top', timeline: 'left', recorder: 'right' };
export const deckLayoutKey = 'listening-room:studio-layout';
export const panelPath = '/studio/panel';

export function isStudioPanel(value: string | null): value is StudioPanel {
  return value !== null && Object.hasOwn(panelNames, value);
}

export function readDeckLayout(value: string | null): DeckLayout {
  try {
    const { turntable, timeline, recorder } = JSON.parse(value ?? '{}');
    const positions = [turntable, timeline, recorder];
    if (new Set(positions).size === 3 && positions.every(position => deckPositions.includes(position))) {
      return { turntable, timeline, recorder };
    }
  } catch {
    // An invalid preference can always fall back to the default deck.
  }
  return defaultDeckLayout;
}

export function moveDeckPanel(layout: DeckLayout, panel: StudioPanel, position: DeckPosition): DeckLayout {
  if (layout[panel] === position) return layout;
  const next = { ...layout };
  const occupant = (Object.keys(layout) as StudioPanel[]).find(key => layout[key] === position);
  if (occupant) next[occupant] = layout[panel];
  next[panel] = position;
  return next;
}
