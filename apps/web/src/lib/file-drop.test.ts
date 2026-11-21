import assert from 'node:assert/strict';
import test from 'node:test';
import { isFileDrop, preventFileNavigation } from './file-drop';

test('recognizes a protected OS file drag before Safari populates files', () => {
  assert.equal(isFileDrop({ types: ['Files'], items: [], files: { length: 0 } } as unknown as DataTransfer), true);
  assert.equal(isFileDrop({ types: [], items: [{ kind: 'file' }], files: { length: 0 } } as unknown as DataTransfer), true);
});

test('recognizes file payloads but preserves text and link dragging', () => {
  assert.equal(isFileDrop({ types: [], items: [], files: { length: 1 } } as unknown as DataTransfer), true);
  assert.equal(isFileDrop({ types: ['text/uri-list', 'text/plain'], items: [{ kind: 'string' }], files: { length: 0 } } as unknown as DataTransfer), false);
  assert.equal(isFileDrop(null), false);
});

test('cancels file navigation without consuming the upload event or text drops', () => {
  const target = new EventTarget();
  target.addEventListener('drop', event => preventFileNavigation(event as DragEvent));
  let received = 0;
  target.addEventListener('drop', () => received++);
  const drop = new Event('drop', { cancelable: true });
  Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], items: [], files: { length: 0 } } });
  assert.equal(target.dispatchEvent(drop), false);
  assert.equal(drop.defaultPrevented, true);
  assert.equal(received, 1, 'the upload target can still handle the drop');
  const text = new Event('drop', { cancelable: true });
  Object.defineProperty(text, 'dataTransfer', { value: { types: ['text/plain'], items: [], files: { length: 0 } } });
  assert.equal(target.dispatchEvent(text), true);
  assert.equal(text.defaultPrevented, false);
});
