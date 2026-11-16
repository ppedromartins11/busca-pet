begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(47);

select is((select count(*)::integer from pg_catalog.pg_trigger
  where tgname = 'buscapet_maintenance_write' and not tgisinternal), 18,
  'all 18 application tables have statement write gates');
select is((select count(*)::integer from pg_catalog.pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'buscapet maintenance%' and permissive = 'RESTRICTIVE'),
  3, 'Storage has restrictive insert, update, and delete policies');
select ok(not has_function_privilege('anon',
  'buscapet_private.set_maintenance(boolean,text,bigint)', 'EXECUTE'),
  'anonymous clients cannot change maintenance');
select ok(not has_function_privilege('authenticated',
  'buscapet_private.set_maintenance(boolean,text,bigint)', 'EXECUTE'),
  'authenticated clients cannot change maintenance');
select ok(not has_function_privilege('service_role',
  'buscapet_private.set_maintenance(boolean,text,bigint)', 'EXECUTE'),
  'service role cannot change maintenance through the routine');
select ok(not has_table_privilege('authenticated',
  'buscapet_private.maintenance_state', 'SELECT'),
  'maintenance state is private');

insert into auth.users(id, email) values
  ('a4000000-0000-0000-0000-000000000001', 'r44-tutor@example.test'),
  ('a4000000-0000-0000-0000-000000000002', 'r44-other@example.test'),
  ('a4000000-0000-0000-0000-000000000003', 'r44-moderator@example.test'),
  ('a4000000-0000-0000-0000-000000000004', 'r44-admin@example.test');
insert into public.user_roles(user_id, role) values
  ('a4000000-0000-0000-0000-000000000003', 'moderador'),
  ('a4000000-0000-0000-0000-000000000004', 'administrador'),
  ('a4000000-0000-0000-0000-000000000002', 'colaborador');
insert into public.pets(id, owner_id, name, species) values (
  'a4100000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001', 'Luna', 'dog');
insert into public.occurrences(id, pet_id, reporter_id, type, city, region,
  last_seen_at, description) values (
  'a4200000-0000-0000-0000-000000000001',
  'a4100000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001', 'lost', 'Cuiaba', 'Centro',
  pg_catalog.now() - interval '1 hour', 'Animal perdido no centro');

create temporary table r44_baseline as
select state.generation,
  (select count(*)::bigint from buscapet_private.maintenance_transitions) as audits
from buscapet_private.maintenance_state state;

select is(buscapet_private.set_maintenance(true,
  'R4.4 isolated gate verification',
  (select generation from r44_baseline)),
  (select generation + 1 from r44_baseline),
  'operator activates gate with expected generation');
select is((select count(*)::integer from buscapet_private.maintenance_transitions),
  (select (audits + 1)::integer from r44_baseline), 'activation is audited');
select throws_ok($$select buscapet_private.set_maintenance(false,
  'Stale operator must fail', (select generation from r44_baseline))$$,
  '40001', null,
  'stale generation cannot reopen writes');
select throws_ok(
  pg_catalog.format('delete from %I.%I where false', namespace.nspname, relation.relname),
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE',
  'privileged direct DML is blocked on ' || namespace.nspname || '.' || relation.relname
)
from pg_catalog.pg_trigger trigger_record
join pg_catalog.pg_class relation on relation.oid = trigger_record.tgrelid
join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
where trigger_record.tgname = 'buscapet_maintenance_write'
  and not trigger_record.tgisinternal
order by namespace.nspname, relation.relname;
select throws_ok($$truncate table buscapet_private.guest_sighting_nonces$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE',
  'privileged truncate is blocked without touching Auth or Storage schemas');

set local role authenticated;
select set_config('request.jwt.claim.sub',
  'a4000000-0000-0000-0000-000000000001', true);
select throws_ok($$insert into public.pets(owner_id,name,species)
  values ('a4000000-0000-0000-0000-000000000001','Novo','dog')$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE', 'tutor pet insert is blocked');
select throws_ok($$update public.occurrences set city='Nova cidade'
  where id='a4200000-0000-0000-0000-000000000001'$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE', 'tutor occurrence update is blocked');
select throws_ok($$delete from public.pets where id='a4100000-0000-0000-0000-000000000001'$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE', 'tutor delete is blocked');
select throws_ok($$insert into public.occurrence_public_locations(occurrence_id,
  approx_location,radius_m,consented_at) values (
  'a4200000-0000-0000-0000-000000000001',
  extensions.st_setsrid(extensions.st_makepoint(-56.1,-15.6),4326)::extensions.geography,
  1000,pg_catalog.now())$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE', 'public location write is blocked');
select throws_ok($$select public.set_occurrence_status(
  'a4200000-0000-0000-0000-000000000001','located')$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE', 'definer status RPC cannot bypass gate');
select is((select count(*)::integer from public.public_occurrences where
  id='a4200000-0000-0000-0000-000000000001'), 1,
  'authorized public projection remains readable');

select set_config('request.jwt.claim.sub',
  'a4000000-0000-0000-0000-000000000002', true);
select throws_ok($$insert into public.occurrence_participants(occurrence_id,user_id)
  values ('a4200000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000002')$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE', 'collaborator participation is blocked');
select throws_ok($$select public.report_occurrence(
  'a4200000-0000-0000-0000-000000000001',
  'other','Relato valido para homologacao')$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE', 'private report RPC is blocked');
select is((select count(*)::integer from public.pets), 0,
  'another user still cannot read the tutor pet');

select set_config('request.jwt.claim.sub',
  'a4000000-0000-0000-0000-000000000003', true);
select throws_ok($$select public.admin_moderate_occurrence(
  'a4200000-0000-0000-0000-000000000001','hide',
  'Homologacao da manutencao')$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE', 'moderation cannot bypass gate');

select set_config('request.jwt.claim.sub',
  'a4000000-0000-0000-0000-000000000004', true);
select throws_ok($$select public.admin_change_account_status(
  'a4000000-0000-0000-0000-000000000001','suspended',
  'Homologacao da manutencao')$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE', 'admin account action is blocked');

reset role;
set local role service_role;
select throws_ok($$select public.ingest_guest_sighting(
  repeat('a',64),'a4300000-0000-0000-0000-000000000001',
  'a4200000-0000-0000-0000-000000000001',pg_catalog.now(),
  'Centro','Avistamento de convidado')$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE',
  'service role guest ingress is blocked by table trigger');
select throws_ok($$insert into buscapet_private.guest_sighting_nonces(nonce)
  values ('a4300000-0000-0000-0000-000000000002')$$,
  'PT503', 'BUSCAPET_MAINTENANCE_ACTIVE',
  'service role direct private write is blocked');

reset role;
select is(buscapet_private.set_maintenance(false,
  'R4.4 isolated gate release verification',
  (select generation + 1 from r44_baseline)),
  (select generation + 2 from r44_baseline),
  'operator reopens gate with current generation');
select is((select count(*)::integer from buscapet_private.maintenance_transitions),
  (select (audits + 2)::integer from r44_baseline), 'deactivation is audited');
select throws_ok($$update buscapet_private.maintenance_state
  set active = true, reason = 'Invalid direct transition'
  where singleton = true$$, '22023', 'invalid maintenance transition',
  'direct operator change without generation increment is rejected');
update buscapet_private.maintenance_state
set active = true, generation = generation + 1,
  reason = 'Audited direct operator transition', changed_at = pg_catalog.now()
where singleton = true;
select is((select count(*)::integer from buscapet_private.maintenance_transitions),
  (select (audits + 3)::integer from r44_baseline),
  'direct operator activation is audited');
update buscapet_private.maintenance_state
set active = false, generation = generation + 1,
  reason = 'Audited direct operator release', changed_at = pg_catalog.now()
where singleton = true;
select is((select count(*)::integer from buscapet_private.maintenance_transitions),
  (select (audits + 4)::integer from r44_baseline),
  'direct operator release is audited');
set local role authenticated;
select set_config('request.jwt.claim.sub',
  'a4000000-0000-0000-0000-000000000001', true);
select lives_ok($$insert into public.pets(owner_id,name,species)
  values ('a4000000-0000-0000-0000-000000000001','Nova','dog')$$,
  'normal tutor write resumes after reopening');

select * from finish();
rollback;
