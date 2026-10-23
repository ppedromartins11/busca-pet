begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);

select ok(to_regclass('public.pet_photos') is not null, 'pet photos table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.pet_photos'::regclass),
  'pet photos has RLS enabled');
select ok(not has_table_privilege('anon', 'public.pet_photos', 'SELECT'),
  'anonymous users cannot read private pet photos');
select ok(not exists (
  select 1
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
  where c.oid = 'public.pet_photos'::regclass
    and acl.grantee = 0
    and acl.privilege_type = 'SELECT'
), 'PUBLIC does not grant select on private pet photos');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pet_photos'
  and policyname = 'owners read pet photos'), 'pet photo read policy exists');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pet_photos'
  and policyname = 'owners attach pet photos'), 'pet photo ownership policy exists');

insert into auth.users(id, email) values
  ('90000000-0000-0000-0000-000000000001', 'pet-photo-owner@example.test'),
  ('90000000-0000-0000-0000-000000000004', 'pet-photo-other@example.test');
insert into public.pets(id, owner_id, name, species) values
  ('90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', 'Lua', 'cat'),
  ('90000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000004', 'Nina', 'dog');
insert into public.occurrences(id, reporter_id, type, city, region, last_seen_at, description) values
  ('90000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001',
   'lost', 'Cuiabá', 'Centro', now() - interval '1 day', 'Ocorrência usada somente no teste de data.');
insert into public.pet_photos(pet_id, uploaded_by, storage_path, mime_type, byte_size)
select '90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001/' || lpad(g::text, 8, '0') || '-0000-0000-0000-000000000000.jpg',
  'image/jpeg', 100
from generate_series(1, 5) g;
insert into public.pet_photos(pet_id, uploaded_by, storage_path, mime_type, byte_size)
values ('90000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000004',
  '90000000-0000-0000-0000-000000000004/00000000-0000-0000-0000-000000000006.jpg', 'image/jpeg', 100);
select is((select count(*)::int from public.pet_photos where pet_id = '90000000-0000-0000-0000-000000000002'), 5,
  'five pet photos are allowed');

set local role anon;
select throws_ok($$select id from public.pet_photos where pet_id = '90000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'anonymous role cannot execute a pet photo read');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.pet_photos), 5,
  'authenticated owner reads only photos of own pet');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.pet_photos), 1,
  'another authenticated owner reads only own pet photo');
reset role;

select throws_ok($$insert into public.pet_photos(pet_id, uploaded_by, storage_path, mime_type, byte_size) values
  ('90000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001',
   '90000000-0000-0000-0000-000000000001/00000006-0000-0000-0000-000000000000.jpg', 'image/jpeg', 100)$$,
  '23514', null, 'sixth pet photo is rejected');
select throws_ok($$insert into public.sightings(occurrence_id, observed_at, area_description, description)
  values ('90000000-0000-0000-0000-000000000003', now() + interval '1 hour', 'Centro', 'Avistamento futuro')$$,
  '23514', null, 'future sighting is rejected by database constraint');

select * from finish();
rollback;
