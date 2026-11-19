-- Run these read-only queries as postgres in the Supabase SQL Editor.
-- Visitors are browser profiles on this origin. They are not unique people.

-- Daily activity, including people using Studio while signed out.
select (occurred_at at time zone 'Asia/Manila')::date as day,
  count(distinct visitor_id) as visitors,
  count(distinct session_id) filter (where event_name = 'session_started') as sessions,
  count(distinct visitor_id) filter (where surface = 'studio' and not signed_in) as signed_out_studio_visitors,
  count(*) filter (where event_name = 'recording_started' and surface = 'studio') as recordings_started,
  count(*) filter (where event_name = 'recording_completed' and surface = 'studio') as recordings_completed,
  count(*) filter (where event_name = 'take_kept' and surface = 'studio') as takes_kept,
  count(*) filter (where event_name = 'layer_added' and surface = 'studio') as layers_added,
  count(distinct visitor_id) filter (where event_name = 'layer_added' and surface = 'studio' and layer_count >= 2) as visitors_with_multiple_layers,
  count(distinct visitor_id) filter (where event_name = 'song_reopened' and surface = 'studio') as visitors_reopening_songs
from public.usage_events
where occurred_at >= now() - interval '30 days'
group by day order by day desc;

-- Visitors reaching each step during the last 30 days.
-- This is an activity summary. It does not require the steps to occur in order.
select event_name, count(*) as events, count(distinct visitor_id) as visitors,
  count(distinct visitor_id) filter (where not signed_in) as signed_out_visitors
from public.usage_events
where occurred_at >= now() - interval '30 days'
  and (surface = 'studio' or event_name in ('session_started', 'page_viewed'))
group by event_name order by visitors desc;

-- Return use after the first successful Studio recording.
-- Day 1 and day 7 use Philippine calendar days and exclude immature cohorts.
with first_recordings as (
  select visitor_id, min((occurred_at at time zone 'Asia/Manila')::date) as first_day
  from public.usage_events where event_name = 'recording_completed' and surface = 'studio'
  group by visitor_id
), active_days as (
  select distinct visitor_id, (occurred_at at time zone 'Asia/Manila')::date as day
  from public.usage_events where surface = 'studio'
), returns as (
  select first_recordings.visitor_id, first_day,
    bool_or(day = first_day + 1) as returned_day_1,
    bool_or(day = first_day + 7) as returned_day_7,
    bool_or(day > first_day and day <= first_day + 7) as returned_within_week
  from first_recordings join active_days using (visitor_id)
  group by first_recordings.visitor_id, first_day
)
select first_day, count(*) as first_time_recorders,
  count(*) filter (where returned_day_1) as returned_day_1,
  count(*) filter (where returned_day_7) as returned_day_7,
  count(*) filter (where returned_within_week) as returned_within_week,
  first_day + 1 < (now() at time zone 'Asia/Manila')::date as day_1_observable,
  first_day + 7 <= (now() at time zone 'Asia/Manila')::date as day_7_started,
  first_day + 7 < (now() at time zone 'Asia/Manila')::date as full_week_observable
from returns group by first_day order by first_day desc;
