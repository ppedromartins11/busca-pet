begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(7);

select ok(to_regclass('public.pet_photos') is not null, 'pet photos table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.pet_photos'::regclass),
  'pet photos has RLS enabled');
select ok(not has_table_privilege('anon', 'public.pet_photos', 'SELECT'),
  'anonymous users cannot read private pet photos');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pet_photos'
  and policyname = 'owners attach pet photos'), 'pet photo ownership policy exists');

insert into auth.users(id, email) values
  ('90000000-0000-0000-0000-000000000001', 'pet-photo-owner@example.test');
insert into public.pets(id, owner_id, name, species) values
  ('90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', 'Lua', 'cat');
insert into public.occurrences(id, reporter_id, type, city, region, last_seen_at, description) values
  ('90000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001',
   'lost', 'Cuiabá', 'Centro', now() - interval '1 day', 'Ocorrência usada somente no teste de data.');
insert into public.pet_photos(pet_id, uploaded_by, storage_path, mime_type, byte_size)
select '90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001/' || lpad(g::text, 8, '0') || '-0000-0000-0000-000000000000.jpg',
  'image/jpeg', 100
from generate_series(1, 5) g;
select is((select count(*)::int from public.pet_photos where pet_id = '90000000-0000-0000-0000-000000000002'), 5,
  'five pet photos are allowed');
select throws_ok($$insert into public.pet_photos(pet_id, uploaded_by, storage_path, mime_type, byte_size) values
  ('90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001',
   '90000000-0000-0000-0000-000000000001/00000006-0000-0000-0000-000000000000.jpg', 'image/jpeg', 100)$$,
  '23514', null, 'sixth pet photo is rejected');
select throws_ok($$insert into public.sightings(occurrence_id, observed_at, area_description, description)
  values ('90000000-0000-0000-0000-000000000003', now() + interval '1 hour', 'Centro', 'Avistamento futuro')$$,
  '23514', null, 'future sighting is rejected by database constraint');

select * from finish();
rollback;
