import { getSupabase } from './supabase';

export type UsageEventName = 'session_started' | 'page_viewed' | 'studio_opened' | 'song_reopened'
  | 'recording_started' | 'recording_completed' | 'take_kept' | 'layer_added' | 'take_discarded';
export type UsageSurface = 'landing' | 'studio' | 'songs';
export type UsageContext = { surface: UsageSurface; layer_count?: number; is_retake?: boolean };
export type UsageEvent = UsageContext & {
  id: string; visitor_id: string; session_id: string; event_name: UsageEventName;
  occurred_at: string; signed_in: boolean;
};

type Identity = { visitor: string; session: string; lastActivity: number };
type UsageOptions = {
  storage: Storage | null;
  send: (events: UsageEvent[]) => Promise<boolean>;
  now?: () => number;
  uuid?: () => string;
};

const identityKey = 'listening-room:usage:identity';
const eventPrefix = 'listening-room:usage:event:';
const sessionTimeout = 30 * 60 * 1000;
const maxAge = 7 * 24 * 60 * 60 * 1000;
const maxQueued = 200;
const batchSize = 20;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Best-effort telemetry has its own bounded outbox and never participates in audio autosave. */
export class UsageTracker {
  private identity: Identity | null = null;
  private pending = new Map<string, UsageEvent>();
  private flushing = false;
  private now: () => number;
  private uuid: () => string;

  constructor(private options: UsageOptions) {
    this.now = options.now ?? Date.now;
    this.uuid = options.uuid ?? (() => crypto.randomUUID());
  }

  track(name: Exclude<UsageEventName, 'session_started'>, context: UsageContext, signedIn: boolean) {
    try {
      const now = this.now();
      const stored = this.readIdentity();
      let identity = stored && (!this.identity || stored.lastActivity >= this.identity.lastActivity) ? stored : this.identity;
      const newSession = !identity || now - identity.lastActivity >= sessionTimeout || now < identity.lastActivity;
      identity = { visitor: identity?.visitor ?? this.uuid(), session: newSession ? this.uuid() : identity!.session, lastActivity: now };
      this.identity = identity;
      try { this.options.storage?.setItem(identityKey, JSON.stringify(identity)); } catch { /* Session-only identity still works. */ }
      const event = {
        visitor_id: identity.visitor, session_id: identity.session,
        occurred_at: new Date(now).toISOString(), signed_in: signedIn,
        surface: context.surface,
        ...(context.layer_count !== undefined ? { layer_count: Math.max(0, Math.min(10000, Math.floor(context.layer_count))) } : {}),
        ...(context.is_retake !== undefined ? { is_retake: context.is_retake } : {}),
      };
      if (newSession) this.enqueue({ ...event, id: identity.session, event_name: 'session_started' });
      this.enqueue({ ...event, id: this.uuid(), event_name: name });
    } catch { /* Storage, UUID, or telemetry failures must never interrupt Studio. */ }
  }

  private readIdentity(): Identity | null {
    try {
      const raw = this.options.storage?.getItem(identityKey);
      const value = raw ? JSON.parse(raw) as Identity : null;
      return value && uuidPattern.test(value.visitor) && uuidPattern.test(value.session) && Number.isFinite(value.lastActivity) ? value : null;
    } catch { return null; }
  }

  private enqueue(event: UsageEvent) {
    this.pending.set(event.id, event);
    // Each event has its own key so another tab cannot overwrite an outbox append.
    try { this.options.storage?.setItem(eventPrefix + event.id, JSON.stringify(event)); } catch { /* Retain the in-memory copy. */ }
    for (const stale of this.readQueue().slice(0, -maxQueued)) this.remove(stale.id);
  }

  private readQueue() {
    const events = new Map(this.pending);
    const storage = this.options.storage;
    try {
      if (storage) for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key?.startsWith(eventPrefix)) continue;
        const event = JSON.parse(storage.getItem(key) ?? 'null') as UsageEvent | null;
        if (event && key === eventPrefix + event.id) events.set(event.id, event);
      }
    } catch { /* The current tab's outbox remains available if browser storage is blocked. */ }
    const now = this.now();
    return [...events.values()].filter(event => {
      const time = Date.parse(event.occurred_at);
      if (Number.isFinite(time) && time >= now - maxAge && time <= now + 5 * 60 * 1000) return true;
      this.remove(event.id);
      return false;
    }).sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
  }

  private remove(id: string) {
    this.pending.delete(id);
    try { this.options.storage?.removeItem(eventPrefix + id); } catch { /* Server event IDs also deduplicate retries. */ }
  }

  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const events = this.readQueue();
      for (let index = 0; index < events.length; index += batchSize) {
        const batch = events.slice(index, index + batchSize);
        if (!await this.options.send(batch)) break;
        for (const event of batch) this.remove(event.id);
      }
    } catch { /* An offline or unavailable collector leaves the outbox for the next attempt. */ }
    finally { this.flushing = false; }
  }
}

let tracker: UsageTracker | null = null;
let signedIn = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

export function startUsageTracking(enabled: boolean) {
  const privacy = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (!enabled || privacy.doNotTrack === '1' || privacy.globalPrivacyControl) return () => {};
  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { /* Use a temporary browser identity when storage is unavailable. */ }
  tracker ??= new UsageTracker({ storage, send: async events => {
    const client = getSupabase();
    if (!client) return false;
    const { error } = await client.rpc('record_usage_events', { p_events: events }).abortSignal(AbortSignal.timeout(10000));
    return !error;
  } });
  const flush = () => { void tracker?.flush(); };
  const visible = () => { if (!document.hidden) flush(); };
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', visible);
  const interval = window.setInterval(flush, 30000);
  flush();
  return () => {
    window.removeEventListener('online', flush);
    document.removeEventListener('visibilitychange', visible);
    window.clearInterval(interval);
  };
}

export function setUsageSignedIn(value: boolean) { signedIn = value; }

export function trackUsage(name: Exclude<UsageEventName, 'session_started'>, context: UsageContext) {
  if (!tracker) return;
  const current = tracker;
  const accountState = signedIn;
  // Browser storage and collection run outside the recording callback.
  queueMicrotask(() => {
    current.track(name, context, accountState);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { void current.flush(); }, 1000);
  });
}
