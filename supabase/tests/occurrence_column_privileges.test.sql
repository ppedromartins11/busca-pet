begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);

insert into auth.users(id, email) values
  ('97000000-0000-0000-0000-000000000001', 'read-owner@example.test'),
  ('97000000-0000-0000-0000-000000000002', 'read-other@example.test');
insert into public.pets(id, owner_id, name, species) values
  ('97100000-0000-0000-0000-000000000001',
   '97000000-0000-0000-0000-000000000001', 'Read Contract Pet', 'dog');
insert into public.occurrences(id, pet_id, reporter_id, type, city, region,
  last_seen_at, description, visibility) values
  ('97200000-0000-0000-0000-000000000001',
   '97100000-0000-0000-0000-000000000001',
   '97000000-0000-0000-0000-000000000001', 'lost', 'Cuiaba', 'Centro',
   now(), 'Synthetic public occurrence for column privilege tests.', 'public');

select ok(not has_table_privilege('anon', 'public.occurrences', 'SELECT'),
  'anon has no broad SELECT privilege on occurrences');
select ok(not has_column_privilege('anon', 'public.occurrences', 'reporter_id', 'SELECT'),
  'anon cannot select occurrence reporter_id');
select ok(not has_column_privilege('authenticated', 'public.occurrences', 'reporter_id', 'SELECT'),
  'authenticated cannot select occurrence reporter_id');

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok($$select reporter_id from public.occurrences
  where id = '97200000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anonymous direct projection of reporter_id is denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select reporter_id from public.occurrences
  where id = '97200000-0000-0000-0000-000000000001'$$,
  '42501', null, 'another authenticated user cannot project reporter_id');
reset role;

select * from finish();
rollback;
