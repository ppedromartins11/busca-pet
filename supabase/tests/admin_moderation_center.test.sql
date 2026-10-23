begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('96000000-0000-0000-0000-000000000001', 'center-owner@example.test'),
  ('96000000-0000-0000-0000-000000000002', 'center-reporter@example.test'),
  ('96000000-0000-0000-0000-000000000003', 'center-moderator@example.test'),
  ('96000000-0000-0000-0000-000000000004', 'center-suspended@example.test'),
  ('96000000-0000-0000-0000-000000000005', 'center-reporter-two@example.test'),
  ('96000000-0000-0000-0000-000000000006', 'center-admin@example.test');
update public.profiles set full_name = 'Conta de teste'
where id between '96000000-0000-0000-0000-000000000001'::uuid
  and '96000000-0000-0000-0000-000000000006'::uuid;
insert into public.user_roles(user_id, role) values
  ('96000000-0000-0000-0000-000000000003', 'moderador'),
  ('96000000-0000-0000-0000-000000000004', 'administrador'),
  ('96000000-0000-0000-0000-000000000006', 'administrador');
update public.profiles set status = 'suspended'
where id = '96000000-0000-0000-0000-000000000004';

insert into public.pets(id, owner_id, name, species)
values ('96100000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', 'Pet da Central', 'dog');
insert into public.occurrences(id, pet_id, reporter_id, type, status, visibility,
  city, region, public_reference, last_seen_at, description, created_at) values
  ('96200000-0000-0000-0000-000000000001', '96100000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', 'lost', 'active', 'public', 'Cuiabá', 'Centro', 'Praça', now(), 'Alerta público para a central de moderação.', '2026-10-21T12:00:00Z'),
  ('96200000-0000-0000-0000-000000000002', '96100000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', 'found', 'active', 'under_review', 'Cuiabá', 'Porto', null, now(), 'Ocorrência oculta para a central de moderação.', '2026-10-22T12:00:00Z'),
  ('96200000-0000-0000-0000-000000000003', null, '96000000-0000-0000-0000-000000000001', 'lost', 'active', 'private', 'Cuiabá', 'Privada', null, now(), 'Registro privado não deve aparecer na central.', '2026-10-23T12:00:00Z'),
  ('96200000-0000-0000-0000-000000000004', null, '96000000-0000-0000-0000-000000000003', 'lost', 'active', 'public', 'Cuiabá', 'Equipe', null, now(), 'Registro próprio da equipe não deve aparecer.', '2026-10-23T12:00:00Z');
insert into buscapet_private.occurrence_reports(id, occurrence_id, reporter_id, category, description, status, created_at, updated_at) values
  ('96300000-0000-0000-0000-000000000001', '96200000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000002', 'duplicate_occurrence', 'Possível ocorrência duplicada para análise.', 'open', '2026-10-22T10:00:00Z', '2026-10-22T10:00:00Z'),
  ('96300000-0000-0000-0000-000000000002', '96200000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000005', 'suspected_fraud', 'Possível fraude relatada para análise.', 'in_review', '2026-10-22T11:00:00Z', '2026-10-22T11:00:00Z'),
  ('96300000-0000-0000-0000-000000000003', '96200000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000003', 'other', 'Relato próprio da moderadora, ocultado da fila.', 'open', '2026-10-22T12:00:00Z', '2026-10-22T12:00:00Z');
insert into buscapet_private.occurrence_reports(
  id, occurrence_id, reporter_id, category, description, status,
  decision_by, decision_reason, decided_at, created_at, updated_at
) values (
  '96300000-0000-0000-0000-000000000004', '96200000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000002', 'other', 'Denúncia já resolvida para histórico.',
  'resolved', '96000000-0000-0000-0000-000000000003', 'Evidência revisada e caso resolvido.',
  now(), '2026-10-21T10:00:00Z', '2026-10-22T10:00:00Z'
);
insert into buscapet_private.occurrence_report_history(report_id, actor_id, action, from_status, to_status, reason)
values ('96300000-0000-0000-0000-000000000004', '96000000-0000-0000-0000-000000000003', 'resolved', 'in_review', 'resolved', 'Evidência revisada e caso resolvido.');
insert into buscapet_private.admin_audit(actor_id, occurrence_id, action)
values ('96000000-0000-0000-0000-000000000003', '96200000-0000-0000-0000-000000000002', 'occurrence_hidden');

select ok(not has_function_privilege('anon', 'public.admin_moderation_queue(text,text,text,text,date,date,integer,integer)', 'EXECUTE'), 'anon cannot execute the unified queue');
select ok(not has_function_privilege('anon', 'public.admin_moderation_metrics()', 'EXECUTE'), 'anon cannot execute unified moderation metrics');
select ok(not has_function_privilege('public', 'buscapet_private.admin_moderation_queue(text,text,text,text,date,date,integer,integer)', 'EXECUTE'), 'PUBLIC cannot execute the private unified queue');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'buscapet_private.admin_moderation_queue(text,text,text,text,date,date,integer,integer)'::regprocedure), 'private queue uses a fixed empty search path');
select ok(not (select prosecdef from pg_proc where oid = 'public.admin_moderation_queue(text,text,text,text,date,date,integer,integer)'::regprocedure), 'public wrapper is security invoker');

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok($$select * from public.admin_moderation_queue()$$, '42501', null, 'anonymous access is denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select * from public.admin_moderation_queue()$$, '42501', null, 'ordinary active user cannot access the central queue');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select * from public.admin_moderation_metrics()$$, '42501', null, 'suspended administrator cannot query central metrics');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select total_count from public.admin_moderation_queue() limit 1), 4::bigint, 'active administrator can access the unified queue and sees every eligible report');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select total_count from public.admin_moderation_queue() limit 1), 3::bigint, 'default queue combines only two eligible reports and one hidden occurrence');
select is((select count(*)::int from public.admin_moderation_queue('report', 'pending', null, 'priority', null, null, 1, 20)), 2, 'pending report filter includes open and in-review reports');
select is((select count(*)::int from public.admin_moderation_queue('occurrence', 'under_review', null, 'priority', null, null, 1, 20)), 1, 'occurrence filter returns moderation-hidden items only');
select is((select count(*)::int from public.admin_moderation_queue('report', 'open', null, 'priority', null, null, 1, 20)), 1, 'status filter selects open reports');
select is((select count(*)::int from public.admin_moderation_queue('report', 'resolved', null, 'priority', null, null, 1, 20)), 1, 'historical resolved reports remain searchable when filtered');
select is((select count(*)::int from public.admin_moderation_queue('all', 'all', 'Pet da Central', 'newest', null, null, 1, 20)), 4, 'permitted pet name search spans both queues and historical reports');
select is((select count(*)::int from public.admin_moderation_queue('report', 'all', '96300000-0000-0000-0000-000000000001', 'newest', null, null, 1, 20)), 1, 'queue search supports report protocol identifiers');
select is((select count(*)::int from public.admin_moderation_queue('all', 'all', 'center-reporter', 'newest', null, null, 1, 20)), 0, 'reporter email is not searchable or exposed');
select is((select total_count from public.admin_moderation_queue('all', 'all', null, 'oldest', null, null, 2, 1) limit 1), 4::bigint, 'pagination reports combined total before paging');
select isnt((select item_id from public.admin_moderation_queue('all', 'all', null, 'oldest', null, null, 1, 1) limit 1), (select item_id from public.admin_moderation_queue('all', 'all', null, 'oldest', null, null, 2, 1) limit 1), 'adjacent pages return different queue items');
select is((select total_count from public.admin_moderation_queue('all', 'all', null, 'oldest', '2026-10-22', '2026-10-23', 1, 20) limit 1), 3::bigint, 'date filters apply to the combined queue');
select is((select item_type from public.admin_moderation_queue() limit 1), 'report', 'priority order places items with more active reports first');
select is((select open_reports from public.admin_moderation_metrics()), 2::bigint, 'metrics count open reports including self-reports while queue excludes own reports');
select is((select in_review_reports from public.admin_moderation_metrics()), 1::bigint, 'metrics count reports in review');
select is((select hidden_occurrences from public.admin_moderation_metrics()), 1::bigint, 'metrics count hidden occurrences');
select is((select resolved_reports from public.admin_moderation_metrics()), 1::bigint, 'metrics count resolved reports');
select cmp_ok((select decisions_last_30_days from public.admin_moderation_metrics()), '>=', 2::bigint, 'recent decisions include report decisions and occurrence visibility audit');
select throws_ok($$select * from public.admin_moderation_queue('all', 'all', null, 'random', null, null, 1, 20)$$, '22023', null, 'invalid sort values are rejected');
select throws_ok($$select * from public.admin_moderation_queue('all', 'all', null, 'priority', null, null, 1, 100)$$, '22023', null, 'page size is bounded');
reset role;

select * from finish();
rollback;
