import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoSession } from './demo';

test('demo catalog exposes distinct same-origin assets without external music', () => {
  assert.equal(new Set(demoSession.layers.map((layer) => layer.id)).size, 4);
  for (const layer of demoSession.layers) assert.match(layer.file, /^\/audio\/[a-z]+\.wav$/);
});
