-- Preserve original media while keeping lightweight display assets for the wall.
alter table public.photos
  add column if not exists thumbnail_storage_path text,
  add column if not exists original_storage_path text,
  add column if not exists motion_storage_path text,
  add column if not exists media_kind text not null default 'image' check (media_kind in ('image', 'live')),
  add column if not exists preview_available boolean not null default true,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists original_mime text,
  add column if not exists motion_mime text,
  add column if not exists original_bytes bigint;

update public.photos
set thumbnail_storage_path = storage_path
where thumbnail_storage_path is null;

create index if not exists photos_space_month_idx on public.photos(space_id, date desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('love-space-photos', 'love-space-photos', false, 20971520, array['image/*', 'video/*'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
