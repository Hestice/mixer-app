-- Run in the SQL editor of your Supabase project.
begin;

create table if not exists public.songs (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  revision bigint not null check (revision > 0),
  commit_id uuid not null,
  content jsonb not null check (jsonb_typeof(content) = 'object' and content->>'version' = '1'),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
alter table public.songs enable row level security;
revoke all on public.songs from anon, authenticated;
grant select on public.songs to authenticated;
drop policy if exists "Read own songs" on public.songs;
create policy "Read own songs" on public.songs for select to authenticated
  using (owner_id = (select auth.uid()));

-- All writes use a compare-and-swap revision and an idempotency token.
-- SECURITY DEFINER is intentional: clients cannot bypass this with a table update.
create or replace function public.save_song(
  p_id uuid, p_expected_revision bigint, p_commit_id uuid, p_content jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_song public.songs;
begin
  if v_owner is null then raise exception 'Sign in to back up songs' using errcode = '42501'; end if;
  if p_id is null or p_commit_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_content is null or p_content->>'version' is distinct from '1'
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
  update public.songs set revision = revision + 1, commit_id = p_commit_id,
    content = p_content, updated_at = now()
    where owner_id = v_owner and id = p_id returning * into v_song;
  return to_jsonb(v_song);
end;
$$;
revoke all on function public.save_song(uuid, bigint, uuid, jsonb) from public, anon;
grant execute on function public.save_song(uuid, bigint, uuid, jsonb) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values('recordings', 'recordings', false, 52428800, array['audio/wav'])
  on conflict(id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['audio/wav'];
drop policy if exists "Read own recordings" on storage.objects;
create policy "Read own recordings" on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Upload own recordings" on storage.objects;
create policy "Upload own recordings" on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No UPDATE policy: audio is immutable and addressed by its SHA-256 hash.
-- No DELETE policy: this first release does not delete cloud backups.
commit;
