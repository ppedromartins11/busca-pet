begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(17);

create temporary table metric_baseline as
select
  (select count(*) from public.profiles)::bigint as total_accounts,
  (select count(*) from public.profiles where status = 'active')::bigint as active_accounts,
  (select count(*) from public.profiles where status = 'suspended')::bigint as suspended_accounts,
  (select count(*) from public.pets)::bigint as total_pets,
  (select count(*) from public.occurrences)::bigint as total_occurrences,
  (select count(*) from public.occurrences where status = 'active')::bigint as active_occurrences,
  (select count(*) from public.occurrences where type = 'lost')::bigint as lost_occurrences,
  (select count(*) from public.occurrences where type = 'found')::bigint as found_occurrences,
  (select count(*) from public.occurrences where status in ('located', 'reunited', 'closed'))::bigint as resolved_occurrences,
  (select count(*) from public.occurrences where status = 'reunited')::bigint as reunited_occurrences,
  (select count(*) from public.sightings)::bigint as total_sightings,
  (select count(*) from public.sightings where status = 'pending')::bigint as pending_sightings;
grant select on table metric_baseline to authenticated;

insert into auth.users(id, email) values
  ('81000000-0000-0000-0000-000000000001', 'dashboard-common@example.test'),
  ('81000000-0000-0000-0000-000000000002', 'dashboard-admin@example.test'),
  ('81000000-0000-0000-0000-000000000003', 'dashboard-suspended-admin@example.test');
insert into public.user_roles(user_id, role) values
  ('81000000-0000-0000-0000-000000000002', 'administrador'),
  ('81000000-0000-0000-0000-000000000003', 'administrador');
update public.profiles set status = 'suspended' where id = '81000000-0000-0000-0000-000000000003';
insert into public.pets(id, owner_id, name, species) values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Lua', 'cat'),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', 'Nina', 'dog');
insert into public.occurrences(id, reporter_id, pet_id, type, status, city, region, last_seen_at, description) values
  ('83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'lost', 'active', 'Cuiaba', 'Centro', now() - interval '1 day', 'Ocorrência ativa para os indicadores do painel.'),
  ('83000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', null, 'found', 'located', 'Cuiaba', 'Centro', now() - interval '2 days', 'Ocorrência localizada para os indicadores do painel.'),
  ('83000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', 'lost', 'reunited', 'Cuiaba', 'Centro', now() - interval '3 days', 'Ocorrência reunificada para os indicadores do painel.'),
  ('83000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000002', null, 'found', 'closed', 'Cuiaba', 'Centro', now() - interval '4 days', 'Ocorrência encerrada para os indicadores do painel.');
insert into public.sightings(id, occurrence_id, reporter_id, observed_at, area_description, description, status) values
  ('84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', now() - interval '2 hours', 'Centro', 'Avistamento pendente para indicador.', 'pending'),
  ('84000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', now() - interval '3 hours', 'Centro', 'Avistamento revisado para indicador.', 'reviewed'),
  ('84000000-0000-0000-0000-000000000003', '83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', now() - interval '4 hours', 'Centro', 'Avistamento rejeitado para indicador.', 'rejected');

select ok((select prosecdef from pg_proc where oid = 'buscapet_private.admin_dashboard_metrics()'::regprocedure),
  'metric aggregation runs in the private security definer function');
select ok(not has_function_privilege('anon', 'public.admin_dashboard_metrics()', 'EXECUTE'),
  'anonymous users cannot execute dashboard metrics');

set local role anon;
select throws_ok($$select * from public.admin_dashboard_metrics()$$, '42501', null, 'anonymous role cannot call dashboard metrics');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select is((select total_accounts from public.admin_dashboard_metrics()), (select total_accounts + 3 from metric_baseline), 'admin receives total accounts only');
select is((select active_accounts from public.admin_dashboard_metrics()), (select active_accounts + 2 from metric_baseline), 'admin receives active account count');
select is((select suspended_accounts from public.admin_dashboard_metrics()), (select suspended_accounts + 1 from metric_baseline), 'admin receives suspended account count');
select is((select total_pets from public.admin_dashboard_metrics()), (select total_pets + 2 from metric_baseline), 'admin receives total pet count');
select is((select total_occurrences from public.admin_dashboard_metrics()), (select total_occurrences + 4 from metric_baseline), 'admin receives total occurrence count');
select is((select active_occurrences from public.admin_dashboard_metrics()), (select active_occurrences + 1 from metric_baseline), 'admin receives active occurrence count');
select is((select lost_occurrences from public.admin_dashboard_metrics()), (select lost_occurrences + 2 from metric_baseline), 'admin receives lost occurrence count');
select is((select found_occurrences from public.admin_dashboard_metrics()), (select found_occurrences + 2 from metric_baseline), 'admin receives found occurrence count');
select is((select resolved_occurrences from public.admin_dashboard_metrics()), (select resolved_occurrences + 3 from metric_baseline), 'admin receives resolved occurrence count');
select is((select reunited_occurrences from public.admin_dashboard_metrics()), (select reunited_occurrences + 1 from metric_baseline), 'admin receives reunited occurrence count');
select is((select total_sightings from public.admin_dashboard_metrics()), (select total_sightings + 3 from metric_baseline), 'admin receives total sighting count');
select is((select pending_sightings from public.admin_dashboard_metrics()), (select pending_sightings + 1 from metric_baseline), 'admin receives pending sighting count');

select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select throws_ok($$select * from public.admin_dashboard_metrics()$$, '42501', null, 'common account cannot execute dashboard metrics');
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select throws_ok($$select * from public.admin_dashboard_metrics()$$, '42501', null, 'suspended administrator cannot execute dashboard metrics');
reset role;

select * from finish();
rollback;
