import assert from 'node:assert/strict';
import test from 'node:test';
import { deckDropTarget, deckGrid, defaultDeckLayout, dockDeckPanel, panelAtDeckEdge, readDeckLayout, swapDeckPanels,
  visibleDeckLayout, type DeckSnapRegion } from './studio-layout';

test('docking the recorder at the left edge spans the full height and preserves the order of the other panels', () => {
  const docked = dockDeckPanel(defaultDeckLayout, 'recorder', 'left');
  assert.deepEqual(deckGrid(docked), [['recorder', 'turntable'], ['recorder', 'timeline']]);
  assert.equal(panelAtDeckEdge(deckGrid(docked), 'left'), 'recorder');
  assert.equal(dockDeckPanel(docked, 'recorder', 'left'), docked);
  assert.deepEqual(readDeckLayout(JSON.stringify(docked)), docked);
});

test('docking the timeline at the right edge gives it the full height', () => {
  const docked = dockDeckPanel(defaultDeckLayout, 'timeline', 'right');
  assert.deepEqual(deckGrid(docked), [['turntable', 'timeline'], ['recorder', 'timeline']]);
});

test('swapping directly with a panel preserves the existing grid shape', () => {
  const swapped = swapDeckPanels(defaultDeckLayout, 'recorder', 'timeline');
  assert.deepEqual(deckGrid(swapped), [['turntable', 'turntable'], ['recorder', 'timeline']]);
  assert.equal(panelAtDeckEdge(deckGrid(swapped), 'left'), null);
});

test('top and bottom edge docking spans the full width', () => {
  const top = dockDeckPanel(defaultDeckLayout, 'recorder', 'top');
  const bottom = dockDeckPanel(defaultDeckLayout, 'turntable', 'bottom');
  assert.deepEqual(deckGrid(top), [['recorder'], ['turntable'], ['timeline']]);
  assert.deepEqual(deckGrid(bottom), [['timeline', 'recorder'], ['turntable', 'turntable']]);
});

test('detaching a panel gives its space to the remaining panels', () => {
  const layout = dockDeckPanel(defaultDeckLayout, 'recorder', 'left');
  const remaining = visibleDeckLayout(layout, ['recorder']);
  assert.ok(remaining);
  assert.deepEqual(deckGrid(remaining), [['turntable'], ['timeline']]);
  assert.equal(visibleDeckLayout(layout, ['recorder', 'timeline', 'turntable']), null);
});

test('older layouts retain the panels and their order', () => {
  assert.deepEqual(readDeckLayout('{"turntable":"top","timeline":"left","recorder":"right"}'), defaultDeckLayout);
  const stacked = readDeckLayout('{"turntable":"top","timeline":"right","recorder":"bottom"}');
  assert.deepEqual(deckGrid(stacked), [['turntable'], ['timeline'], ['recorder']]);
});

test('a corrupt layout preference falls back to the default', () => {
  for (const value of [null, '{', 'null', '{}',
    '{"turntable":"top","timeline":"top","recorder":"right"}',
    '{"axis":"rows","first":"turntable","second":{"axis":"columns","first":"timeline","second":"timeline"}}']) {
    assert.deepEqual(readDeckLayout(value), defaultDeckLayout);
  }
});

const snapRegions: DeckSnapRegion[] = [
  { position: 'left', bounds: { left: 0, right: 200, top: 100, bottom: 700 } },
];

test('the edge docks while the body of the same panel swaps', () => {
  assert.deepEqual(deckDropTarget({ x: 100, y: 350 }, 'recorder', snapRegions, 'timeline'), { kind: 'dock', position: 'left' });
  assert.deepEqual(deckDropTarget({ x: 500, y: 350 }, 'recorder', snapRegions, 'timeline'), { kind: 'swap', panel: 'timeline' });
  assert.equal(deckDropTarget({ x: 500, y: 350 }, 'recorder', snapRegions, 'recorder'), null);
  assert.equal(deckDropTarget({ x: 500, y: 40 }, 'recorder', snapRegions), null);
});
