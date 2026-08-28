-- Fix storage RLS space resolution: object paths are prefixed with the space
-- slug ("private-space"), but storage_space_id() used to cast the first path
-- segment straight to uuid, so every member upload was rejected by RLS.
-- Accept both a raw uuid prefix and a spaces.slug prefix.

create or replace function public.storage_space_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  first_folder text;
begin
  first_folder := (storage.foldername(object_name))[1];
  begin
    return first_folder::uuid;
  exception when invalid_text_representation then
    return (select id from public.spaces where slug = first_folder);
  end;
end;
$$;
