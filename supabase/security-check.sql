-- Transactional verification. Test identities and rows are rolled back.
begin;
insert into auth.users(id) values
  ('57ff070e-6f49-4a21-aa18-56547df62001'),
  ('57ff070e-6f49-4a21-aa18-56547df62002');
set local role authenticated;
select set_config('request.jwt.claim.sub', '57ff070e-6f49-4a21-aa18-56547df62001', true);
do $$
declare first_save jsonb; replay jsonb;
begin
  first_save := public.save_song('57ff070e-6f49-4a21-aa18-56547df63001', 0,
    '57ff070e-6f49-4a21-aa18-56547df64001', '{"version":1,"title":"Security test","layers":[],"candidate":null}');
  replay := public.save_song('57ff070e-6f49-4a21-aa18-56547df63001', 0,
    '57ff070e-6f49-4a21-aa18-56547df64001', '{"version":1,"title":"Security test","layers":[],"candidate":null}');
  if first_save->>'revision' <> '1' or replay->>'revision' <> '1' then raise exception 'Idempotency failed'; end if;
  begin
    perform public.save_song('57ff070e-6f49-4a21-aa18-56547df63001', 0,
      '57ff070e-6f49-4a21-aa18-56547df64002', '{"version":1,"title":"Stale write","layers":[]}');
    raise exception 'Stale write was accepted';
  exception when serialization_failure then null;
  end;
  perform public.save_song('57ff070e-6f49-4a21-aa18-56547df63001', 1,
    '57ff070e-6f49-4a21-aa18-56547df64003', '{"version":2,"title":"Multiple takes","layers":[]}');
  begin
    perform public.save_song('57ff070e-6f49-4a21-aa18-56547df63001', 2,
      '57ff070e-6f49-4a21-aa18-56547df64004', '{"version":1,"title":"Old client","layers":[]}');
    raise exception 'Old client erased the take collection';
  exception when invalid_parameter_value then null;
  end;
  begin
    update public.songs set revision = 999 where id = '57ff070e-6f49-4a21-aa18-56547df63001';
    raise exception 'Direct update bypassed the RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '57ff070e-6f49-4a21-aa18-56547df62002', true);
do $$
begin
  if exists(select 1 from public.songs where id = '57ff070e-6f49-4a21-aa18-56547df63001') then
    raise exception 'Another account can read this song';
  end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.save_song('57ff070e-6f49-4a21-aa18-56547df63001', 0,
      '57ff070e-6f49-4a21-aa18-56547df64002', '{"version":1,"title":"Anonymous","layers":[]}');
    raise exception 'Anonymous writes are allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
begin
  if not exists(select 1 from storage.buckets where id = 'recordings' and public = false) then raise exception 'Recording bucket is not private'; end if;
  if not exists(select 1 from pg_class where oid = 'public.songs'::regclass and relrowsecurity) then raise exception 'Song RLS is not enabled'; end if;
end $$;
rollback;
select 'PASS: owner isolation, anonymous denial, revision conflicts, idempotency, v2 upgrade/downgrade protection, private bucket' as result;
