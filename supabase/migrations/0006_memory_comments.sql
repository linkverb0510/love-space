-- Memory comments: partner reactions appended under a memory.
alter table public.timeline_entries
  add column if not exists comments jsonb not null default '[]'::jsonb;
