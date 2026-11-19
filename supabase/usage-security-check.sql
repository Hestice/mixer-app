-- Run as postgres after the usage-tracking migration. Every fixture is rolled back.
begin;

do $$
begin
  if has_table_privilege('anon', 'public.usage_events', 'select')
    or has_table_privilege('anon', 'public.usage_events', 'insert')
    or has_table_privilege('authenticated', 'public.usage_events', 'select')
    or has_table_privilege('authenticated', 'public.usage_events', 'insert') then
    raise exception 'Browser roles must not access analytics rows directly';
  end if;
  if not has_function_privilege('anon', 'public.record_usage_events(jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.record_usage_events(jsonb)', 'execute') then
    raise exception 'Both browser roles must be able to submit usage';
  end if;
end;
$$;

set local role anon;
do $$
declare
  sample jsonb := jsonb_build_object(
    'id', '00000000-0000-4000-8000-000000000001',
    'visitor_id', '00000000-0000-4000-8000-000000000002',
    'session_id', '00000000-0000-4000-8000-000000000003',
    'event_name', 'recording_completed', 'surface', 'studio',
    'occurred_at', now(), 'signed_in', false, 'layer_count', 1
  );
begin
  perform public.record_usage_events(jsonb_build_array(sample));
  perform public.record_usage_events(jsonb_build_array(sample));
  begin
    perform public.record_usage_events(jsonb_build_array(sample || '{"email":"private@example.com"}'::jsonb));
    raise exception 'Unexpected success for an unapproved property';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_usage_events(jsonb_build_array(sample || '{"id":"invalid-id"}'::jsonb));
    raise exception 'Unexpected success for an invalid event ID';
  exception when invalid_text_representation then null;
  end;
  begin
    perform public.record_usage_events(jsonb_build_array(sample || '{"event_name":"unapproved"}'::jsonb));
    raise exception 'Unexpected success for an invalid event name';
  exception when check_violation then null;
  end;
  begin
    perform public.record_usage_events(jsonb_build_array(sample || '{"signed_in":"false"}'::jsonb));
    raise exception 'Unexpected success for an invalid account flag';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_usage_events((select jsonb_agg(sample) from generate_series(1, 21)));
    raise exception 'Unexpected success for an oversized batch';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_usage_events(jsonb_build_array(sample || '{"layer_count":-1}'::jsonb));
    raise exception 'Unexpected success for a negative layer count';
  exception when invalid_parameter_value then null;
  end;
  -- A stale event is acknowledged and dropped so it cannot block the remaining outbox.
  perform public.record_usage_events(jsonb_build_array(sample || jsonb_build_object(
    'id', '00000000-0000-4000-8000-000000000004', 'occurred_at', now() - interval '8 days'
  )));
end;
$$;
reset role;

do $$
begin
  if (select count(*) from public.usage_events where visitor_id = '00000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'Retries must deduplicate and stale events must be dropped';
  end if;
end;
$$;

-- Enforce the per-browser cap even when a client submits more than one batch.
insert into public.usage_events(id, visitor_id, session_id, event_name, occurred_at, surface, signed_in)
  select gen_random_uuid(), '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000006', 'take_kept', now(), 'studio', false
  from generate_series(1, 1000);
set local role authenticated;
select public.record_usage_events(jsonb_build_array(jsonb_build_object(
  'id', '00000000-0000-4000-8000-000000000007',
  'visitor_id', '00000000-0000-4000-8000-000000000005',
  'session_id', '00000000-0000-4000-8000-000000000006',
  'event_name', 'take_kept', 'surface', 'studio', 'occurred_at', now(), 'signed_in', true
)));
reset role;
do $$
begin
  if exists(select 1 from public.usage_events where id = '00000000-0000-4000-8000-000000000007') then
    raise exception 'The per-browser limit was bypassed';
  end if;
end;
$$;
rollback;
