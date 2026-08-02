create extension if not exists pgcrypto;

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null default 'our little space',
  relationship_start date,
  timezone text not null default 'Asia/Hong_Kong',
  public_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table if not exists public.timeline_entries (
  id text primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  type text not null check (type in ('memory', 'milestone')),
  title text not null,
  date date not null,
  location text,
  body text,
  tags text[] not null default '{}',
  kind text check (kind in ('anniversary', 'one-off')),
  repeat_annual boolean not null default false,
  time time,
  note text,
  photo_ids text[] not null default '{}',
  system_role text check (system_role in ('relationship-start')),
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id text primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null,
  type text not null,
  status text not null,
  due_date date,
  location text,
  link text,
  image text,
  note text,
  priority text not null default 'medium',
  assignee text not null default '一起',
  completed_at date,
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id text primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '',
  date date not null,
  timeline_entry_id text references public.timeline_entries(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists timeline_entries_space_date_idx on public.timeline_entries(space_id, date desc);
create index if not exists plans_space_created_idx on public.plans(space_id, created_at desc);
create index if not exists photos_space_date_idx on public.photos(space_id, date desc);

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['spaces', 'timeline_entries', 'plans', 'photos'] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

create or replace function public.is_space_member(target_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.space_members
    where space_id = target_space_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.storage_space_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.timeline_entries enable row level security;
alter table public.plans enable row level security;
alter table public.photos enable row level security;

drop policy if exists "spaces_select_members_or_demo" on public.spaces;
create policy "spaces_select_members_or_demo"
on public.spaces for select
to anon, authenticated
using (public_demo or public.is_space_member(id));

drop policy if exists "spaces_insert_demo" on public.spaces;
create policy "spaces_insert_demo"
on public.spaces for insert
to anon, authenticated
with check (public_demo);

drop policy if exists "spaces_update_members" on public.spaces;
create policy "spaces_update_members"
on public.spaces for update
to authenticated
using (public.is_space_member(id))
with check (public.is_space_member(id));

drop policy if exists "spaces_delete_members" on public.spaces;
create policy "spaces_delete_members"
on public.spaces for delete
to authenticated
using (public.is_space_member(id));

drop policy if exists "space_members_select_self" on public.space_members;
create policy "space_members_select_self"
on public.space_members for select
to authenticated
using (user_id = auth.uid() or public.is_space_member(space_id));

drop policy if exists "timeline_members_or_demo" on public.timeline_entries;
create policy "timeline_members_or_demo"
on public.timeline_entries for all
to anon, authenticated
using (public.is_space_member(space_id) or exists (select 1 from public.spaces where id = space_id and public_demo))
with check (public.is_space_member(space_id) or exists (select 1 from public.spaces where id = space_id and public_demo));

drop policy if exists "plans_members_or_demo" on public.plans;
create policy "plans_members_or_demo"
on public.plans for all
to anon, authenticated
using (public.is_space_member(space_id) or exists (select 1 from public.spaces where id = space_id and public_demo))
with check (public.is_space_member(space_id) or exists (select 1 from public.spaces where id = space_id and public_demo));

drop policy if exists "photos_members_or_demo" on public.photos;
create policy "photos_members_or_demo"
on public.photos for all
to anon, authenticated
using (public.is_space_member(space_id) or exists (select 1 from public.spaces where id = space_id and public_demo))
with check (public.is_space_member(space_id) or exists (select 1 from public.spaces where id = space_id and public_demo));

insert into public.spaces (slug, name, public_demo)
values ('public-demo', 'our little space', true)
on conflict (slug) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('love-space-photos', 'love-space-photos', false, 20971520, array['image/*'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "love_photos_select" on storage.objects;
create policy "love_photos_select"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'love-space-photos'
  and (public.is_space_member(public.storage_space_id(name)) or exists (
    select 1 from public.spaces where id = public.storage_space_id(name) and public_demo
  ))
);

drop policy if exists "love_photos_insert" on storage.objects;
create policy "love_photos_insert"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'love-space-photos'
  and (public.is_space_member(public.storage_space_id(name)) or exists (
    select 1 from public.spaces where id = public.storage_space_id(name) and public_demo
  ))
);

drop policy if exists "love_photos_update" on storage.objects;
create policy "love_photos_update"
on storage.objects for update
to anon, authenticated
using (
  bucket_id = 'love-space-photos'
  and (public.is_space_member(public.storage_space_id(name)) or exists (
    select 1 from public.spaces where id = public.storage_space_id(name) and public_demo
  ))
)
with check (
  bucket_id = 'love-space-photos'
  and (public.is_space_member(public.storage_space_id(name)) or exists (
    select 1 from public.spaces where id = public.storage_space_id(name) and public_demo
  ))
);

drop policy if exists "love_photos_delete" on storage.objects;
create policy "love_photos_delete"
on storage.objects for delete
to anon, authenticated
using (
  bucket_id = 'love-space-photos'
  and (public.is_space_member(public.storage_space_id(name)) or exists (
    select 1 from public.spaces where id = public.storage_space_id(name) and public_demo
  ))
);
