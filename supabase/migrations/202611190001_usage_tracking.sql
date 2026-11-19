begin;

create table if not exists public.usage_events (
  id uuid primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  event_name text not null check (event_name in (
    'session_started', 'page_viewed', 'studio_opened', 'song_reopened',
    'recording_started', 'recording_completed', 'take_kept', 'layer_added', 'take_discarded'
  )),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  surface text not null check (surface in ('landing', 'studio', 'songs')),
  signed_in boolean not null,
  layer_count integer check (layer_count between 0 and 10000),
  is_retake boolean
);
create index if not exists usage_events_visitor_received on public.usage_events(visitor_id, received_at);
create index if not exists usage_events_event_occurred on public.usage_events(event_name, occurred_at);
alter table public.usage_events enable row level security;
revoke all on public.usage_events from public, anon, authenticated;

-- Both browser roles can submit a bounded event batch. Only database administrators can read it.
create or replace function public.record_usage_events(p_events jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  event jsonb;
  visitor uuid;
  recent_count integer;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'Expected an event batch' using errcode = '22023';
  end if;
  if jsonb_array_length(p_events) not between 1 and 20 or octet_length(p_events::text) > 16384 then
    raise exception 'Event batch is too large' using errcode = '22023';
  end if;

  for event in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(event) <> 'object' then
      raise exception 'Expected an event object' using errcode = '22023';
    end if;
    if event - array['id', 'visitor_id', 'session_id', 'event_name', 'occurred_at', 'surface', 'signed_in', 'layer_count', 'is_retake'] <> '{}'::jsonb
      or not event ?& array['id', 'visitor_id', 'session_id', 'event_name', 'occurred_at', 'surface', 'signed_in']
      or jsonb_typeof(event->'signed_in') <> 'boolean'
      or (event ? 'is_retake' and jsonb_typeof(event->'is_retake') <> 'boolean')
      or (event ? 'layer_count' and (jsonb_typeof(event->'layer_count') <> 'number' or (event->>'layer_count') !~ '^[0-9]{1,5}$')) then
      raise exception 'Unsupported event fields' using errcode = '22023';
    end if;
    if (event->>'occurred_at')::timestamptz not between now() - interval '7 days' and now() + interval '5 minutes' then
      continue;
    end if;
    visitor := (event->>'visitor_id')::uuid;
    -- Serializing submissions for one visitor prevents concurrent tabs bypassing the cap.
    perform pg_advisory_xact_lock(hashtextextended(visitor::text, 19319));
    select count(*) into recent_count from public.usage_events
      where visitor_id = visitor and received_at >= now() - interval '24 hours';
    if recent_count >= 1000 then continue; end if;
    insert into public.usage_events(id, visitor_id, session_id, event_name, occurred_at, surface, signed_in, layer_count, is_retake)
      values ((event->>'id')::uuid, visitor, (event->>'session_id')::uuid, event->>'event_name',
        (event->>'occurred_at')::timestamptz, event->>'surface', (event->>'signed_in')::boolean,
        (event->>'layer_count')::integer, (event->>'is_retake')::boolean)
      on conflict (id) do nothing;
  end loop;
end;
$$;
revoke all on function public.record_usage_events(jsonb) from public, anon, authenticated;
grant execute on function public.record_usage_events(jsonb) to anon, authenticated;

comment on table public.usage_events is 'Pseudonymous browser activity. No account IDs, song identifiers, titles, audio, or email addresses. signed_in is client-reported. Submission is untrusted telemetry.';
commit;
