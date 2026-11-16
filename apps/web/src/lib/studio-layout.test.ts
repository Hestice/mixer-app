import assert from 'node:assert/strict';
import test from 'node:test';
import { deckSnapPosition, defaultDeckLayout, moveDeckPanel, readDeckLayout, type DeckSnapRegion } from './studio-layout';

test('dropping a panel onto an occupied position swaps both panels', () => {
  const moved = moveDeckPanel(defaultDeckLayout, 'turntable', 'right');
  assert.deepEqual(moved, { turntable: 'right', timeline: 'left', recorder: 'top' });
  assert.equal(defaultDeckLayout.turntable, 'top');
});

test('dropping into an empty position moves only the dragged panel', () => {
  const moved = moveDeckPanel(defaultDeckLayout, 'recorder', 'bottom');
  assert.deepEqual(moved, { turntable: 'top', timeline: 'left', recorder: 'bottom' });
  assert.equal(moveDeckPanel(moved, 'recorder', 'bottom'), moved);
  assert.deepEqual(readDeckLayout(JSON.stringify(moved)), moved);
});

test('a corrupt layout preference cannot hide or overlap panels', () => {
  for (const value of [null, '{', 'null', '{}',
    '{"turntable":"top","timeline":"top","recorder":"right"}',
    '{"turntable":"top","timeline":"left","recorder":"hidden"}']) {
    assert.deepEqual(readDeckLayout(value), defaultDeckLayout);
  }
});

const snapRegions: DeckSnapRegion[] = [
  { position: 'top', bounds: { left: 200, right: 800, top: 100, bottom: 160 } },
  { position: 'left', bounds: { left: 0, right: 200, top: 100, bottom: 700 } },
  { position: 'right', bounds: { left: 800, right: 1000, top: 100, bottom: 700 } },
  { position: 'bottom', bounds: { left: 200, right: 800, top: 640, bottom: 700 } },
];

test('the right snap zone overrides the panel underneath it', () => {
  assert.equal(deckSnapPosition({ x: 900, y: 350 }, 'left', snapRegions, 'left'), 'right');
});

test('a panel can move from the bottom to any other edge', () => {
  const stacked = moveDeckPanel(defaultDeckLayout, 'recorder', 'bottom');
  const destinations = [
    { x: 500, y: 130, expected: 'top' },
    { x: 100, y: 400, expected: 'left' },
    { x: 900, y: 400, expected: 'right' },
  ] as const;
  for (const { x, y, expected } of destinations) {
    const position = deckSnapPosition({ x, y }, 'bottom', snapRegions);
    assert.equal(position, expected);
    assert.equal(moveDeckPanel(stacked, 'recorder', position).recorder, expected);
  }
});

test('dropping on a panel between snap zones swaps it, while releasing on the source or outside the deck cancels', () => {
  assert.equal(deckSnapPosition({ x: 500, y: 400 }, 'right', snapRegions, 'top'), 'top');
  assert.equal(deckSnapPosition({ x: 900, y: 400 }, 'right', snapRegions, 'right'), null);
  assert.equal(deckSnapPosition({ x: 500, y: 40 }, 'right', snapRegions), null);
});
