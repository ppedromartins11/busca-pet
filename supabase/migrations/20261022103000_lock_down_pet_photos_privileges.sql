begin;

-- Supabase local/cloud defaults can grant new public tables to API roles.
-- pet_photos is private: remove every inherited table privilege first, then
-- restore only the operations required by its authenticated owner policies.
revoke all on table public.pet_photos from public, anon, authenticated;

grant select, insert, delete on table public.pet_photos to authenticated;
grant update (is_cover) on table public.pet_photos to authenticated;

commit;
