import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UsageTracker, type UsageEvent } from './usage-tracking';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function setup(storage: Storage | null = new MemoryStorage()) {
  let now = Date.parse('2026-11-19T04:00:00Z');
  let online = true;
  const received: UsageEvent[] = [];
  const send = async (batch: UsageEvent[]) => { if (!online) return false; received.push(...batch); return true; };
  return {
    tracker: new UsageTracker({ storage, send, now: () => now }), storage, received, send,
    advance: (milliseconds: number) => { now += milliseconds; },
    offline: () => { online = false; }, online: () => { online = true; }, now: () => now,
  };
}

const studio = { surface: 'studio' as const };

test('signed-out use records actions, and signing in preserves the browser identity', async () => {
  const { tracker, received } = setup();
  tracker.track('recording_started', studio, false);
  tracker.track('recording_completed', studio, false);
  tracker.track('take_kept', { ...studio, layer_count: 1, is_retake: false }, true);
  await tracker.flush();
  assert.deepEqual(received.map(event => event.event_name), ['session_started', 'recording_started', 'recording_completed', 'take_kept']);
  assert.equal(new Set(received.map(event => event.visitor_id)).size, 1);
  assert.equal(new Set(received.map(event => event.session_id)).size, 1);
  assert.equal(received[1].signed_in, false);
  assert.equal(received[3].signed_in, true);
});

test('reloading retains the visitor, current session, and unsent events', async () => {
  const run = setup();
  run.offline();
  run.tracker.track('recording_completed', studio, false);
  await run.tracker.flush();
  assert.equal(run.received.length, 0);
  const next = new UsageTracker({ storage: run.storage, send: run.send, now: run.now });
  next.track('song_reopened', studio, false);
  run.online();
  await next.flush();
  assert.equal(run.received.length, 3);
  assert.equal(new Set(run.received.map(event => event.visitor_id)).size, 1);
  assert.equal(new Set(run.received.map(event => event.session_id)).size, 1);
});

test('returning after inactivity starts another session for the same visitor', async () => {
  const run = setup();
  run.tracker.track('page_viewed', studio, false);
  await run.tracker.flush();
  run.advance(31 * 60 * 1000);
  run.tracker.track('song_reopened', studio, false);
  await run.tracker.flush();
  assert.equal(new Set(run.received.map(event => event.visitor_id)).size, 1);
  assert.equal(new Set(run.received.map(event => event.session_id)).size, 2);
  assert.equal(run.received.filter(event => event.event_name === 'session_started').length, 2);
});

test('two tabs retain each other’s appends, and retried event IDs are stable', async () => {
  const run = setup();
  const other = new UsageTracker({ storage: run.storage, send: run.send, now: run.now });
  run.tracker.track('recording_completed', studio, false);
  other.track('song_reopened', studio, false);
  await other.flush();
  assert.deepEqual(new Set(run.received.map(event => event.event_name)), new Set(['session_started', 'recording_completed', 'song_reopened']));
  const firstIds = run.received.map(event => event.id);
  await run.tracker.flush();
  assert.ok(run.received.every(event => firstIds.includes(event.id)), 'another tab can retry existing IDs for server deduplication');
});

test('only allowlisted event fields leave the browser', async () => {
  const { tracker, received } = setup();
  const context = { ...studio, layer_count: 2, title: 'Private song', email: 'private@example.com', song_id: crypto.randomUUID(), audio: new Blob(['private']) };
  tracker.track('take_kept', context, false);
  await tracker.flush();
  assert.ok(received.every(event => Object.keys(event).every(key => ['id','visitor_id','session_id','event_name','occurred_at','signed_in','surface','layer_count','is_retake'].includes(key))));
  assert.equal(JSON.stringify(received).includes('Private'), false);
  assert.equal(JSON.stringify(received).includes('example.com'), false);
});

test('blocked or full storage and a failed collector cannot interrupt recording actions', async () => {
  const blocked = new Proxy({} as Storage, { get() { throw new DOMException('Blocked', 'SecurityError'); } });
  const tracker = new UsageTracker({ storage: blocked, send: async () => { throw new Error('Offline'); } });
  assert.doesNotThrow(() => tracker.track('recording_started', studio, false));
  await assert.doesNotReject(tracker.flush());
});

test('offline collection remains bounded and is sent in small batches', async () => {
  const run = setup();
  for (let index = 0; index < 250; index++) {
    run.tracker.track('take_kept', studio, false);
    run.advance(1);
  }
  assert.ok(run.storage!.length <= 201);
  const batches: number[] = [];
  const reloaded = new UsageTracker({ storage: run.storage, now: run.now, send: async events => { batches.push(events.length); return true; } });
  await reloaded.flush();
  assert.equal(batches.reduce((sum, size) => sum + size, 0), 200);
  assert.ok(batches.every(size => size <= 20));
});

test('a network timeout retries the same event IDs and clears only successful batches', async () => {
  const storage = new MemoryStorage();
  let fail = true;
  const attempts: UsageEvent[][] = [];
  const tracker = new UsageTracker({ storage, send: async events => { attempts.push(events); return !fail; } });
  tracker.track('take_kept', studio, false);
  await tracker.flush();
  fail = false;
  await tracker.flush();
  await tracker.flush();
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(storage.length, 1, 'only the browser identity remains');
});

test('concurrent flush calls cannot overlap or lose an event captured in flight', async () => {
  let complete: ((value: boolean) => void) | undefined;
  const batches: UsageEvent[][] = [];
  const tracker = new UsageTracker({ storage: new MemoryStorage(), send: async batch => {
    batches.push(batch);
    if (batches.length === 1) return new Promise<boolean>(resolve => { complete = resolve; });
    return true;
  } });
  tracker.track('recording_completed', studio, false);
  const flushing = tracker.flush();
  await tracker.flush();
  tracker.track('take_kept', studio, false);
  complete!(true);
  await flushing;
  await tracker.flush();
  assert.equal(batches.length, 2);
  assert.deepEqual(batches[1].map(event => event.event_name), ['take_kept']);
});

test('stale offline events expire without changing the returning visitor identity', async () => {
  const run = setup();
  run.tracker.track('page_viewed', studio, false);
  run.advance(8 * 24 * 60 * 60 * 1000);
  run.tracker.track('song_reopened', studio, false);
  await run.tracker.flush();
  assert.deepEqual(run.received.map(event => event.event_name), ['session_started', 'song_reopened']);
});
