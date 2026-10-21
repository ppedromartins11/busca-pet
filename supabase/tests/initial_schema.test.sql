begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(35);

insert into auth.users(id, email) values
  ('10000000-0000-0000-0000-000000000001', 'tutor1@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'tutor2@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'moderator@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'admin@example.test');
insert into public.user_roles(user_id, role) values
  ('10000000-0000-0000-0000-000000000003', 'moderador'),
  ('10000000-0000-0000-0000-000000000004', 'administrador');
insert into public.pets(id, owner_id, name, species) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Luna', 'dog'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Nina', 'cat');
insert into public.occurrences(id, pet_id, reporter_id, type, city, region, last_seen_at, description)
values ('30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  'lost', 'Cuiaba', 'Centro', now() - interval '1 day', 'Animal perdido no centro');
insert into public.occurrences(id, pet_id, reporter_id, type, city, region, last_seen_at,
  description, visibility)
values ('30000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  'lost', 'Cuiaba', 'Centro', now() - interval '1 day', 'Animal perdido no bairro', 'private');
insert into public.sightings(id, occurrence_id, reporter_id, observed_at,
  area_description, description) values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', now(), 'Centro', 'Animal visto no centro');
insert into buscapet_private.sighting_locations(sighting_id, exact_location) values (
  '40000000-0000-0000-0000-000000000001',
  extensions.st_setsrid(extensions.st_makepoint(-56.1, -15.6), 4326)::extensions.geography);

select ok(has_table_privilege('anon', 'public.occurrences', 'SELECT'), 'public feed grant');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'active_role', 'UPDATE'), 'no direct role switch');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'status', 'UPDATE'), 'no direct suspension edit');
select ok(not has_column_privilege('authenticated', 'public.partner_profiles', 'status', 'UPDATE'), 'no direct partner approval');
select ok(not has_table_privilege('anon', 'public.sightings', 'SELECT'), 'anonymous sightings are private');
select ok(not has_function_privilege('anon',
  'public.ingest_guest_sighting(text,uuid,uuid,timestamptz,text,text,double precision,double precision)',
  'EXECUTE'), 'guest ingestion is server-only');
select ok(not has_function_privilege('authenticated',
  'public.ingest_guest_sighting(text,uuid,uuid,timestamptz,text,text,double precision,double precision)',
  'EXECUTE'), 'authenticated client cannot bypass challenge');
select ok(not has_table_privilege('anon', 'buscapet_private.sighting_locations', 'SELECT'), 'exact location is private');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok($$insert into public.user_roles(user_id, role) values
  ('10000000-0000-0000-0000-000000000001', 'administrador')$$,
  '42501', null, 'cannot self assign administrator');
select throws_ok($$update public.profiles set status = 'active'
  where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'cannot edit suspension status');
select throws_ok($$select public.grant_staff_role(
  '10000000-0000-0000-0000-000000000002', 'administrador')$$,
  '42501', null, 'ordinary user cannot grant staff role');
select lives_ok($$insert into public.partner_profiles(user_id, organization_type,
  public_name, city, responsible_name) values
  ('10000000-0000-0000-0000-000000000001', 'ONG', 'Patinhas', 'Cuiaba', 'Tutora')$$,
  'partner can apply');
select throws_ok($$select public.approve_partner(
  '10000000-0000-0000-0000-000000000001', true)$$,
  '42501', null, 'partner cannot self approve');
select throws_ok($$update public.partner_profiles set status = 'approved'
  where user_id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'partner status column is protected');
select throws_ok($$select public.switch_active_role('administrador')$$,
  '42501', null, 'cannot activate ungranted role');
select throws_ok($$insert into public.occurrences(pet_id, reporter_id, type,
  city, region, last_seen_at, description) values
  ('20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001', 'lost', 'Cuiaba', 'Centro', now(),
  'Animal de outro tutor')$$,
  '23514', null, 'cannot associate other tutor pet');
select throws_ok($$insert into public.occurrence_photos(occurrence_id, uploaded_by,
  storage_path, mime_type, byte_size) values
  ('30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', 'missing.jpg', 'image/jpeg', 100)$$,
  '42501', null, 'metadata requires matching owned object');
select lives_ok($$insert into public.sightings(occurrence_id, reporter_id,
  observed_at, area_description, description) values
  ('30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', now(), 'Centro', 'Vi o animal') returning id$$,
  'tutor can register a sighting');
select lives_ok($$insert into public.occurrences(reporter_id, type, city, region,
  last_seen_at, description, visibility) values
  ('10000000-0000-0000-0000-000000000001', 'lost', 'Cuiaba', 'Centro', now(),
  'Ocorrencia privada com retorno', 'private') returning id$$,
  'private insert returning is visible to reporter');
select is((select count(*)::int from public.occurrences), 3, 'owner sees public and private');
select is((select count(*)::int from public.sightings), 2, 'reporter sees submitted sighting');
select lives_ok($$select * from public.sighting_coordinates(
  '40000000-0000-0000-0000-000000000001')$$,
  'sighting author may request coordinates');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.occurrences), 1, 'other tutor sees only public');
select is((select count(*)::int from public.sightings), 0, 'other tutor cannot read sighting');
select throws_ok($$select * from public.sighting_coordinates(
  '40000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'other tutor cannot request coordinates');
update public.pets set name = 'Tomado'
  where id = '20000000-0000-0000-0000-000000000001';
select is((select name from public.pets where id = '20000000-0000-0000-0000-000000000002'),
  'Nina', 'cross-tutor update has no effect');
select throws_ok($$insert into public.occurrence_photos(occurrence_id, uploaded_by,
  storage_path, mime_type, byte_size) values
  ('30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002', 'other.jpg', 'image/jpeg', 100)$$,
  '42501', null, 'cannot attach photo to private foreign occurrence');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select lives_ok($$select public.approve_partner(
  '10000000-0000-0000-0000-000000000001', true)$$,
  'moderator approves another partner');
select throws_ok($$select public.set_account_status(
  '10000000-0000-0000-0000-000000000004', 'suspended')$$,
  '42501', null, 'moderator cannot suspend administrator');

set local role service_role;
select lives_ok($$select public.ingest_guest_sighting(
  repeat('a', 64), '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', now(),
  'Centro', 'Relato anonimo', -15.6, -56.1)$$,
  'trusted endpoint can ingest anonymous sighting');
select lives_ok($$select public.ingest_guest_sighting(
  repeat('a', 64), ('50000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
  '30000000-0000-0000-0000-000000000001', now(),
  'Centro', 'Relato anonimo') from generate_series(2, 5) g$$,
  'four more submissions fit the atomic quota');
select throws_ok($$select public.ingest_guest_sighting(
  repeat('a', 64), '50000000-0000-0000-0000-000000000006',
  '30000000-0000-0000-0000-000000000001', now(),
  'Centro', 'Relato anonimo')$$,
  'P0001', null, 'sixth guest submission is blocked');
select throws_ok($$select public.ingest_guest_sighting(
  repeat('b', 64), '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', now(),
  'Centro', 'Relato anonimo')$$,
  'P0001', null, 'signed request nonce cannot be replayed');

set local role anon;
select is((select count(*)::int from public.occurrences), 1, 'anonymous public query excludes private');
select is((select count(*)::int from public.occurrence_photos), 0, 'no unlinked public photos');
select * from finish();
rollback;
