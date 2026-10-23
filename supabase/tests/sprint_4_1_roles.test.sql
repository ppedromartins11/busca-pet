begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(7);

insert into auth.users(id, email) values
  ('71000000-0000-0000-0000-000000000001', 'common-a@example.test'),
  ('71000000-0000-0000-0000-000000000002', 'common-b@example.test'),
  ('71000000-0000-0000-0000-000000000003', 'admin@example.test'),
  ('71000000-0000-0000-0000-000000000004', 'staff-target@example.test');
insert into public.user_roles(user_id, role) values
  ('71000000-0000-0000-0000-000000000003', 'administrador');
insert into public.pets(id, owner_id, name, species) values
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'Luna', 'dog');
insert into public.occurrences(id, reporter_id, type, city, region, last_seen_at, description)
values ('73000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001', 'lost', 'Cuiaba', 'Centro', now() - interval '1 hour', 'Alerta público para teste de avistamento');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select lives_ok($$insert into public.occurrences(reporter_id, type, city, region, last_seen_at, description)
  values ('71000000-0000-0000-0000-000000000001', 'found', 'Cuiaba', 'Centro', now(), 'Conta comum publica animal encontrado')$$,
  'common account publishes found occurrence without collaborator role');
select throws_ok($$insert into public.user_roles(user_id, role) values
  ('71000000-0000-0000-0000-000000000001', 'administrador')$$,
  '42501', null, 'common account cannot self grant administrator');
select throws_ok($$update public.profiles set active_role = 'administrador'
  where id = '71000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'active_role cannot grant administrative privilege');

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select lives_ok($$insert into public.sightings(occurrence_id, reporter_id, observed_at, area_description, description)
  values ('73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', now(), 'Centro', 'Conta comum registra avistamento de outra pessoa')$$,
  'common account records sighting for another public occurrence');
select is((select count(*)::int from public.pets where id = '72000000-0000-0000-0000-000000000001'), 0,
  'other common account cannot read private pet');

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
select lives_ok($$select public.grant_staff_role(
  '71000000-0000-0000-0000-000000000004', 'administrador')$$,
  'legitimately granted administrator can grant staff role in isolated database');
reset role;
select ok(exists (select 1 from public.user_roles where user_id = '71000000-0000-0000-0000-000000000004'
  and role = 'administrador'), 'staff role is represented only in user_roles');

select * from finish();
rollback;
