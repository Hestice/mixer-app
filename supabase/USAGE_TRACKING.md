# Usage tracking

Apply `migrations/202611190001_usage_tracking.sql` before deploying the PR. It adds a separate event table and a submission function callable by signed-out and signed-in clients. Production already has the required Supabase URL and publishable key. No additional provider or private browser key is needed.

Run `usage-report.sql` as postgres in the Supabase SQL Editor for daily usage, counts of visitors reaching recording milestones, and returns after the first completed Studio recording. Anonymous and authenticated API roles cannot read the event table or submit arbitrary properties.

## Events

| Event | Recorded when |
| --- | --- |
| `session_started` | The browser first reports activity, or reports activity after 30 minutes without tracked activity. |
| `page_viewed` | Landing, Studio, or My songs opens, or becomes visible again. Only a fixed surface name is sent. |
| `studio_opened` | A new Studio session initializes or a saved song loads successfully. |
| `song_reopened` | A saved song with layers or a review take loads successfully. |
| `recording_started` | Actual microphone recording begins after the optional count-in. |
| `recording_completed` | Captured audio becomes a usable take for review. |
| `take_kept` | The user keeps a take, including replacement takes. |
| `layer_added` | Keeping a take adds a new layer. Replacement takes and auto-imported stems do not count. |
| `take_discarded` | The user discards an actual review take. |

Reports filter Studio activity to exclude the landing demo. Events originating in detached panels are reported once by their Studio owner. Opening a detached panel does not start another tracked session.

`layer_count` records the active layer count when available. `is_retake` distinguishes recording and keeping a replacement take. `signed_in` is the client-reported account state when the action happens. It supports an approximate anonymous/signed-in breakdown, including the brief period before authentication is restored. It is not a verified identity or authorization signal.

## Browser identity and delivery

A random UUID in localStorage recognizes the same browser profile across sessions and days. Signing in preserves that browser ID. Different browsers and devices count separately, including for the same account. Clearing browser data resets the ID. When storage is blocked, the temporary identity lasts until the page closes.

The event payload includes only random browser/session/event IDs, event time, surface, account state, layer count, and retake state. Song IDs, song titles, layer names, audio, waveforms, emails, referrers, full URLs, and device details are excluded. Supabase may retain request information in its own infrastructure logs.

Do Not Track and Global Privacy Control disable collection. Tracking is enabled automatically for Vercel production deployments. `NEXT_PUBLIC_USAGE_TRACKING=false` disables it explicitly, and `NEXT_PUBLIC_USAGE_TRACKING=true` enables intentional local testing. Deploy again after changing the flag. Local development and preview deployments are otherwise excluded.

The browser batches events in an independent outbox, limited to 200 events and seven days. It retries on reconnect, page visibility, and a 30-second interval. Collection failures never block microphone access, recording, or audio autosave. Event UUIDs make server retries idempotent. Other tabs cannot overwrite queued event appends. Closing the browser immediately after an action can delay delivery until another visit.

The collector accepts up to 20 small events per call and 1,000 per browser ID per 24 hours. Browser-submitted events are untrusted, can be blocked or forged, and should be used for product validation. Analytics begins at deployment and cannot reconstruct earlier local-only usage.

## Interpreting returns

The reports use Philippine calendar days. Day 1 means activity on the next calendar day after the first completed Studio recording. Day 7 means activity seven calendar days later. The within-week count includes any subsequent day through day 7. Cohort flags distinguish completed observation periods so fresh cohorts are not treated as failures. A reopened song on the same day is counted as a reopen, while a return on another day contributes to retention.

The reports count browser profiles. Multiple sessions, repeated takes, and repeated page visibility events are activity counts, while distinct visitor counts reduce repeat actions to one browser profile. The event summary does not enforce step order and should not be presented as a strict conversion funnel.
