-- Store content authorship separately from Supabase membership permissions.
alter table public.timeline_entries
  add column if not exists created_by_role text
    check (created_by_role is null or created_by_role in ('l', 'w', 'both', 'unknown'));

alter table public.photos
  add column if not exists created_by_role text
    check (created_by_role is null or created_by_role in ('l', 'w', 'both', 'unknown'));

alter table public.plans
  add column if not exists created_by_role text
    check (created_by_role is null or created_by_role in ('l', 'w', 'both', 'unknown'));
