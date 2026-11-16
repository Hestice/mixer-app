import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultDeckLayout, moveDeckPanel, readDeckLayout } from './studio-layout';

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
