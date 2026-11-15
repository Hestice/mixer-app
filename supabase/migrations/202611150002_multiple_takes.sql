begin;
alter table public.songs drop constraint if exists songs_content_check;
alter table public.songs add constraint songs_content_check check (jsonb_typeof(content) = 'object' and content->>'version' in ('1', '2'));

create or replace function public.save_song(
  p_id uuid, p_expected_revision bigint, p_commit_id uuid, p_content jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_song public.songs;
begin
  if v_owner is null then raise exception 'Sign in to back up songs' using errcode = '42501'; end if;
  if p_id is null or p_commit_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_content is null or coalesce(p_content->>'version', '') not in ('1', '2')
    or jsonb_typeof(p_content->'layers') is distinct from 'array'
    or octet_length(p_content::text) > 2097152 then
    raise exception 'Invalid song manifest' using errcode = '22023';
  end if;
  if p_expected_revision = 0 then
    insert into public.songs(owner_id, id, revision, commit_id, content)
      values(v_owner, p_id, 1, p_commit_id, p_content)
      on conflict (owner_id, id) do nothing returning * into v_song;
    if found then return to_jsonb(v_song); end if;
  end if;
  select * into v_song from public.songs where owner_id = v_owner and id = p_id for update;
  if found and v_song.commit_id = p_commit_id then return to_jsonb(v_song); end if;
  if not found or v_song.revision <> p_expected_revision then
    raise exception 'Song revision conflict' using errcode = '40001';
  end if;
  if v_song.content->>'version' = '2' and p_content->>'version' = '1' then
    raise exception 'This song requires a newer app version' using errcode = '22023';
  end if;
  update public.songs set revision = revision + 1, commit_id = p_commit_id,
    content = p_content, updated_at = now()
    where owner_id = v_owner and id = p_id returning * into v_song;
  return to_jsonb(v_song);
end;
$$;
revoke all on function public.save_song(uuid, bigint, uuid, jsonb) from public, anon;
grant execute on function public.save_song(uuid, bigint, uuid, jsonb) to authenticated;

commit;
