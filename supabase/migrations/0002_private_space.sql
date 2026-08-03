-- Private shared-space hardening.
-- Run this migration only after backing up the current public-demo rows.

alter table public.spaces
  add column if not exists version integer not null default 1;

alter table public.spaces
  add column if not exists updated_at timestamptz not null default now();

alter table public.timeline_entries
  add column if not exists version integer not null default 1;

alter table public.timeline_entries
  add column if not exists updated_at timestamptz not null default now();

alter table public.plans
  add column if not exists version integer not null default 1;

alter table public.plans
  add column if not exists updated_at timestamptz not null default now();

alter table public.photos
  add column if not exists version integer not null default 1;

alter table public.photos
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists spaces_touch_updated_at on public.spaces;
create trigger spaces_touch_updated_at
before update on public.spaces
for each row execute function public.touch_updated_at();

drop trigger if exists timeline_entries_touch_updated_at on public.timeline_entries;
create trigger timeline_entries_touch_updated_at
before update on public.timeline_entries
for each row execute function public.touch_updated_at();

drop trigger if exists plans_touch_updated_at on public.plans;
create trigger plans_touch_updated_at
before update on public.plans
for each row execute function public.touch_updated_at();

drop trigger if exists photos_touch_updated_at on public.photos;
create trigger photos_touch_updated_at
before update on public.photos
for each row execute function public.touch_updated_at();

-- The photo row is the only source of truth for timeline associations.
update public.photos as photo
set timeline_entry_id = timeline.id
from public.timeline_entries as timeline
where photo.timeline_entry_id is null
  and photo.id = any(timeline.photo_ids);

alter table public.timeline_entries
  drop column if exists photo_ids;

-- The public preview is now served from local empty data and must not be a
-- writable or readable Supabase space.
update public.spaces
set public_demo = false
where slug = 'public-demo';

update public.spaces
set timezone = 'Asia/Hong_Kong';

insert into public.spaces (slug, name, public_demo)
values ('private-space', 'our little space', false)
on conflict (slug) do update set public_demo = false;

revoke all on table
  public.spaces,
  public.space_members,
  public.timeline_entries,
  public.plans,
  public.photos
from anon;

grant select, update, delete on public.spaces to authenticated;
grant select on public.space_members to authenticated;
grant select, insert, update, delete on public.timeline_entries, public.plans, public.photos to authenticated;

drop policy if exists "spaces_select_members_or_demo" on public.spaces;
drop policy if exists "spaces_insert_demo" on public.spaces;
drop policy if exists "spaces_update_demo" on public.spaces;
drop policy if exists "spaces_update_members" on public.spaces;
create policy "spaces_select_members"
on public.spaces for select
to authenticated
using (public.is_space_member(id));

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
create policy "timeline_members"
on public.timeline_entries for all
to authenticated
using (public.is_space_member(space_id))
with check (public.is_space_member(space_id));

drop policy if exists "plans_members_or_demo" on public.plans;
create policy "plans_members"
on public.plans for all
to authenticated
using (public.is_space_member(space_id))
with check (public.is_space_member(space_id));

drop policy if exists "photos_members_or_demo" on public.photos;
create policy "photos_members"
on public.photos for all
to authenticated
using (public.is_space_member(space_id))
with check (public.is_space_member(space_id));

revoke all on table storage.objects from anon;

drop policy if exists "love_photos_select" on storage.objects;
drop policy if exists "love_photos_insert" on storage.objects;
drop policy if exists "love_photos_update" on storage.objects;
drop policy if exists "love_photos_delete" on storage.objects;

create policy "love_photos_select_members"
on storage.objects for select
to authenticated
using (
  bucket_id = 'love-space-photos'
  and public.is_space_member(public.storage_space_id(name))
);

create policy "love_photos_insert_members"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'love-space-photos'
  and public.is_space_member(public.storage_space_id(name))
);

create policy "love_photos_update_members"
on storage.objects for update
to authenticated
using (
  bucket_id = 'love-space-photos'
  and public.is_space_member(public.storage_space_id(name))
)
with check (
  bucket_id = 'love-space-photos'
  and public.is_space_member(public.storage_space_id(name))
);

create policy "love_photos_delete_members"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'love-space-photos'
  and public.is_space_member(public.storage_space_id(name))
);
