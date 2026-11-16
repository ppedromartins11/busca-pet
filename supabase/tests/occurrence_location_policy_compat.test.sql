begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('97600000-0000-0000-0000-000000000001', 'location-owner@example.test'),
  ('97600000-0000-0000-0000-000000000002', 'location-third-party@example.test'),
  ('97600000-0000-0000-0000-000000000003', 'location-suspended@example.test');

insert into public.occurrences(id, reporter_id, type, status, visibility,
  city, region, last_seen_at, description) values
  ('97610000-0000-0000-0000-000000000001',
    '97600000-0000-0000-0000-000000000001', 'lost', 'active', 'public',
    'Cuiaba', 'Centro', now(), 'Synthetic public lost occurrence.'),
  ('97610000-0000-0000-0000-000000000002',
    '97600000-0000-0000-0000-000000000001', 'lost', 'active', 'private',
    'Cuiaba', 'Privada', now(), 'Synthetic private lost occurrence.'),
  ('97610000-0000-0000-0000-000000000003',
    '97600000-0000-0000-0000-000000000002', 'lost', 'active', 'public',
    'Cuiaba', 'Outro bairro', now(), 'Synthetic third-party lost occurrence.'),
  ('97610000-0000-0000-0000-000000000004',
    '97600000-0000-0000-0000-000000000001', 'found', 'active', 'public',
    'Cuiaba', 'Centro', now(), 'Synthetic found occurrence.'),
  ('97610000-0000-0000-0000-000000000005',
    '97600000-0000-0000-0000-000000000003', 'lost', 'active', 'private',
    'Cuiaba', 'Privada', now(), 'Synthetic suspended-owner occurrence.'),
  ('97610000-0000-0000-0000-000000000006',
    '97600000-0000-0000-0000-000000000001', 'lost', 'active', 'private',
    'Cuiaba', 'Privada', now(), 'Synthetic owner location insert target.');
update public.profiles set status = 'suspended'
where id = '97600000-0000-0000-0000-000000000003';

insert into public.occurrence_public_locations(occurrence_id, approx_location,
  radius_m, public_description, consented_at) values
  ('97610000-0000-0000-0000-000000000001',
    extensions.st_setsrid(extensions.st_makepoint(-56.10, -15.60), 4326)::extensions.geography,
    900, 'Approximate public area', now()),
  ('97610000-0000-0000-0000-000000000002',
    extensions.st_setsrid(extensions.st_makepoint(-56.11, -15.61), 4326)::extensions.geography,
    900, 'Approximate private area', now()),
  ('97610000-0000-0000-0000-000000000003',
    extensions.st_setsrid(extensions.st_makepoint(-56.12, -15.62), 4326)::extensions.geography,
    900, 'Third-party public area', now()),
  ('97610000-0000-0000-0000-000000000004',
    extensions.st_setsrid(extensions.st_makepoint(-56.14, -15.64), 4326)::extensions.geography,
    900, 'Existing found-type row', now()),
  ('97610000-0000-0000-0000-000000000005',
    extensions.st_setsrid(extensions.st_makepoint(-56.13, -15.63), 4326)::extensions.geography,
    900, 'Suspended-owner private area', now());

select ok((select relrowsecurity from pg_class
  where oid = 'public.occurrence_public_locations'::regclass),
  'occurrence public location RLS remains enabled');
select ok(not exists (
    select 1 from pg_policy policy
    where policy.polrelid = 'public.occurrence_public_locations'::regclass
      and (coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') || ' '
        || coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), ''))
        ilike '%reporter_id%'
  ), 'location policies no longer depend on direct reporter_id SELECT');
select ok((select pg_get_expr(polqual, polrelid) ilike '%occurrence_is_owner%'
    from pg_policy where polrelid = 'public.occurrence_public_locations'::regclass
      and polname = 'read own or public occurrence locations'),
  'authenticated owner read uses the safe ownership predicate');
select ok((select pg_get_expr(polwithcheck, polrelid) ilike '%occurrence_is_owner%'
    from pg_policy where polrelid = 'public.occurrence_public_locations'::regclass
      and polname = 'owner inserts occurrence location'),
  'owner insert uses the safe ownership predicate');
select ok((select pg_get_expr(polqual, polrelid) ilike '%occurrence_is_owner%'
      and pg_get_expr(polwithcheck, polrelid) ilike '%occurrence_is_owner%'
    from pg_policy where polrelid = 'public.occurrence_public_locations'::regclass
      and polname = 'owner edits occurrence location'),
  'owner update checks ownership in both USING and WITH CHECK');
select ok((select pg_get_expr(polqual, polrelid) ilike '%occurrence_is_owner%'
    from pg_policy where polrelid = 'public.occurrence_public_locations'::regclass
      and polname = 'owner removes occurrence location'),
  'owner delete uses the safe ownership predicate');
select ok(not (select prosecdef from pg_proc
  where oid = 'public.get_occurrence_public_location(uuid)'::regprocedure),
  'public location reader remains SECURITY INVOKER');
select ok(not has_function_privilege('public',
    'public.get_occurrence_public_location(uuid)', 'EXECUTE')
  and has_function_privilege('anon',
    'public.get_occurrence_public_location(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated',
    'public.get_occurrence_public_location(uuid)', 'EXECUTE'),
  'public location reader remains callable only by application roles');
select ok(exists (select 1 from pg_constraint
  where conrelid = 'public.occurrence_public_locations'::regclass
    and conname = 'occurrence_location_is_approximate'),
  'approximate-coordinate constraint remains in place');

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select is((select count(*)::int from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000001'), 1,
  'anonymous caller reads an authorized public lost-animal location');
select is((select count(*)::int from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000002'), 0,
  'anonymous caller cannot read a private occurrence location');
select is((select count(*)::int from public.get_occurrence_public_location(
  '97610000-0000-0000-0000-000000000001')), 1,
  'anonymous public-location RPC returns an authorized public point');
select is((select count(*)::int from public.search_public_map_points(
  p_occurrence => '97610000-0000-0000-0000-000000000001')), 1,
  'anonymous map search retains the public location marker');
select is(public.occurrence_is_owner('97610000-0000-0000-0000-000000000001'), false,
  'anonymous ownership indicator is false');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '97600000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::int from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000001'), 1,
  'owner reads their public occurrence location');
select is((select count(*)::int from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000002'), 1,
  'owner reads their private location for management');
select is((select count(*)::int from public.get_occurrence_public_location(
  '97610000-0000-0000-0000-000000000002')), 1,
  'owner RPC returns the private location needed for editing');
select is(public.occurrence_is_owner('97610000-0000-0000-0000-000000000001'), true,
  'active owner predicate recognizes the current account');
select is(public.occurrence_is_owner('97610000-0000-0000-0000-000000000003'), false,
  'owner predicate does not recognize another account');
select lives_ok($$insert into public.occurrence_public_locations(occurrence_id,
  approx_location, radius_m, public_description, consented_at) values
  ('97610000-0000-0000-0000-000000000006',
   extensions.st_setsrid(extensions.st_makepoint(-56.14, -15.64), 4326)::extensions.geography,
   900, 'Owner inserted approximate location', now())$$,
  'active owner can insert their own lost-occurrence location');
select is((select count(*)::int from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000006'), 1,
  'owner insert persists exactly one location');
select lives_ok($$update public.occurrence_public_locations
  set public_description = 'Owner updated approximate location'
  where occurrence_id = '97610000-0000-0000-0000-000000000002'$$,
  'owner can update their own location');
select is((select public_description from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000002'),
  'Owner updated approximate location', 'owner update changes only their location');
select lives_ok($$delete from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000002'$$,
  'owner can delete their own location');
select is((select count(*)::int from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000002'), 0,
  'owner deletion removes their location');
select throws_ok($$insert into public.occurrence_public_locations(occurrence_id,
  approx_location, radius_m, public_description, consented_at) values
  ('97610000-0000-0000-0000-000000000004',
   extensions.st_setsrid(extensions.st_makepoint(-56.17, -15.67), 4326)::extensions.geography,
   900, 'Found-type point', now())$$,
  '42501', null, 'found-type occurrence cannot receive a new public location');
select lives_ok($$update public.occurrence_public_locations
  set public_description = 'Found-type update must not apply'
  where occurrence_id = '97610000-0000-0000-0000-000000000004'$$,
  'found-type occurrence cannot be edited through the lost-location policy');
select is((select public_description from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000004'),
  'Existing found-type row', 'found-type update leaves the seeded row unchanged');
select lives_ok($$delete from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000004'$$,
  'owner retains the original delete condition for an existing found-type row');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '97600000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::int from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000001'), 1,
  'third party reads a public occurrence location');
select is((select count(*)::int from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000002'), 0,
  'third party cannot read a private location');
select is((select count(*)::int from public.get_occurrence_public_location(
  '97610000-0000-0000-0000-000000000002')), 0,
  'location RPC returns no private location to a third party');
select throws_ok($$insert into public.occurrence_public_locations(occurrence_id,
  approx_location, radius_m, public_description, consented_at) values
  ('97610000-0000-0000-0000-000000000001',
   extensions.st_setsrid(extensions.st_makepoint(-56.15, -15.65), 4326)::extensions.geography,
   900, 'Unauthorized third-party point', now())$$,
  '42501', null, 'third party cannot insert a location for another owner');
select lives_ok($$update public.occurrence_public_locations
  set public_description = 'Unauthorized third-party update'
  where occurrence_id = '97610000-0000-0000-0000-000000000001'$$,
  'third-party update is safely filtered by RLS');
select is((select public_description from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000001'),
  'Approximate public area', 'third-party update leaves the owner row unchanged');
select lives_ok($$delete from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000001'$$,
  'third-party delete is safely filtered by RLS');
select is((select count(*)::int from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000001'), 1,
  'third-party delete leaves the owner row unchanged');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '97600000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.occurrence_is_owner('97610000-0000-0000-0000-000000000005'), false,
  'suspended owner receives no owner indicator');
select is((select count(*)::int from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000005'), 0,
  'suspended owner cannot read private location as an owner');
select throws_ok($$insert into public.occurrence_public_locations(occurrence_id,
  approx_location, radius_m, public_description, consented_at) values
  ('97610000-0000-0000-0000-000000000005',
   extensions.st_setsrid(extensions.st_makepoint(-56.16, -15.66), 4326)::extensions.geography,
   900, 'Suspended-owner point', now())$$,
  '42501', null, 'suspended owner cannot insert a public location');
select lives_ok($$update public.occurrence_public_locations
  set public_description = 'Suspended-owner update must not apply'
  where occurrence_id = '97610000-0000-0000-0000-000000000005'$$,
  'suspended-owner update is filtered by RLS');
select lives_ok($$delete from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000005'$$,
  'suspended-owner delete is filtered by RLS');
reset role;
select is((select public_description from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000005'),
  'Suspended-owner private area', 'suspended-owner update leaves data unchanged');
select is((select count(*)::int from public.occurrence_public_locations
  where occurrence_id = '97610000-0000-0000-0000-000000000005'), 1,
  'suspended-owner delete leaves data unchanged');

select * from finish();
rollback;
