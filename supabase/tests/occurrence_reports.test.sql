begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('95000000-0000-0000-0000-000000000001', 'report-owner@example.test'),
  ('95000000-0000-0000-0000-000000000002', 'reporter-one@example.test'),
  ('95000000-0000-0000-0000-000000000003', 'reporter-two@example.test'),
  ('95000000-0000-0000-0000-000000000004', 'report-moderator@example.test'),
  ('95000000-0000-0000-0000-000000000005', 'reporter-suspended@example.test');
update public.profiles set full_name = case id
  when '95000000-0000-0000-0000-000000000001'::uuid then 'Pessoa Responsável'
  when '95000000-0000-0000-0000-000000000002'::uuid then 'Denunciante Um'
  when '95000000-0000-0000-0000-000000000003'::uuid then 'Denunciante Dois'
  when '95000000-0000-0000-0000-000000000004'::uuid then 'Moderadora de Denúncias'
  when '95000000-0000-0000-0000-000000000005'::uuid then 'Conta Suspensa'
end where id between '95000000-0000-0000-0000-000000000001'::uuid
  and '95000000-0000-0000-0000-000000000005'::uuid;
insert into public.user_roles(user_id, role)
values ('95000000-0000-0000-0000-000000000004', 'moderador'),
  ('95000000-0000-0000-0000-000000000005', 'moderador');
update public.profiles set status = 'suspended'
where id = '95000000-0000-0000-0000-000000000005';

insert into public.pets(id, owner_id, name, species)
values ('95100000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001', 'Luna', 'dog');
insert into public.occurrences(id, pet_id, reporter_id, type, status, visibility,
  city, region, last_seen_at, description) values
  ('95200000-0000-0000-0000-000000000001', '95100000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001', 'lost', 'active', 'public', 'Cuiabá', 'Centro', now(), 'Descrição pública para testes de denúncia.'),
  ('95200000-0000-0000-0000-000000000002', null, '95000000-0000-0000-0000-000000000001', 'found', 'active', 'private', 'Cuiabá', 'Privada', now(), 'Ocorrência privada para teste de segurança.'),
  ('95200000-0000-0000-0000-000000000003', null, '95000000-0000-0000-0000-000000000002', 'lost', 'active', 'public', 'Cuiabá', 'Própria', now(), 'Ocorrência própria para teste de segurança.'),
  ('95200000-0000-0000-0000-000000000004', null, '95000000-0000-0000-0000-000000000001', 'lost', 'active', 'public', 'Cuiabá', 'Região 4', now(), 'Ocorrência quatro de teste.'),
  ('95200000-0000-0000-0000-000000000005', null, '95000000-0000-0000-0000-000000000001', 'lost', 'active', 'public', 'Cuiabá', 'Região 5', now(), 'Ocorrência cinco de teste.'),
  ('95200000-0000-0000-0000-000000000006', null, '95000000-0000-0000-0000-000000000001', 'lost', 'active', 'public', 'Cuiabá', 'Região 6', now(), 'Ocorrência seis de teste.'),
  ('95200000-0000-0000-0000-000000000007', null, '95000000-0000-0000-0000-000000000001', 'lost', 'active', 'public', 'Cuiabá', 'Região 7', now(), 'Ocorrência sete de teste.'),
  ('95200000-0000-0000-0000-000000000008', null, '95000000-0000-0000-0000-000000000001', 'lost', 'active', 'public', 'Cuiabá', 'Região 8', now(), 'Ocorrência oito de teste.');

select ok((select relrowsecurity from pg_class where oid = 'buscapet_private.occurrence_reports'::regclass),
  'report records have RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'buscapet_private.occurrence_report_history'::regclass),
  'report history has RLS enabled');
select ok(not has_table_privilege('anon', 'buscapet_private.occurrence_reports', 'SELECT'),
  'anonymous users cannot read reports directly');
select ok(not has_table_privilege('authenticated', 'buscapet_private.occurrence_reports', 'SELECT'),
  'authenticated users cannot read reports directly');
select ok(not has_table_privilege('authenticated', 'buscapet_private.occurrence_report_history', 'SELECT'),
  'authenticated users cannot read report history directly');
select ok(not has_function_privilege('anon', 'public.report_occurrence(uuid,text,text)', 'EXECUTE'),
  'anonymous users cannot execute report submission');
select ok(not has_function_privilege('anon', 'public.admin_list_occurrence_reports(text,text,text,date,date,text,integer,integer)', 'EXECUTE'),
  'anonymous users cannot execute the administrative queue');
select ok(not has_function_privilege('public', 'buscapet_private.submit_occurrence_report(uuid,text,text)', 'EXECUTE'),
  'PUBLIC cannot execute the private submission function');
select ok(not has_function_privilege('anon', 'buscapet_private.admin_transition_occurrence_report(uuid,text,text)', 'EXECUTE'),
  'anonymous users cannot execute private administrative transitions');
select ok((select prosecdef from pg_proc where oid = 'buscapet_private.admin_transition_occurrence_report(uuid,text,text)'::regprocedure),
  'administrative transition is guarded in a private security-definer function');
select ok(not (select prosecdef from pg_proc where oid = 'public.admin_transition_occurrence_report(uuid,text,text)'::regprocedure),
  'public administrative wrapper remains security invoker');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'buscapet_private.admin_transition_occurrence_report(uuid,text,text)'::regprocedure),
  'privileged report transition pins an empty search path');
select ok(exists (select 1 from pg_indexes where schemaname = 'buscapet_private'
  and indexname = 'occurrence_reports_one_active_per_reporter_idx'),
  'active duplicate reports have a database unique constraint');

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok($$select * from public.report_occurrence('95200000-0000-0000-0000-000000000001', 'other', 'Relato suficientemente descritivo.')$$,
  '42501', null, 'anonymous users cannot submit a report');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select * from public.report_occurrence('95200000-0000-0000-0000-000000000001', 'invalid', 'Relato suficientemente descritivo.')$$,
  '22023', null, 'unsupported report categories are rejected');
select throws_ok($$select * from public.report_occurrence('95200000-0000-0000-0000-000000000001', 'other', 'curto')$$,
  '22023', null, 'short report descriptions are rejected');
select is((select report_status from public.report_occurrence('95200000-0000-0000-0000-000000000001',
  'duplicate_occurrence', 'Possível alerta duplicado para análise.')), 'open',
  'active account submits an occurrence report');
select set_config('test.report_id', (select report_id::text from public.get_my_active_occurrence_report('95200000-0000-0000-0000-000000000001')), true);
select is((select already_active from public.report_occurrence('95200000-0000-0000-0000-000000000001',
  'other', 'Envio repetido que deve reutilizar o protocolo.')), true,
  'repeated submissions return the existing active report instead of duplicating it');
select is((select report_id::text from public.get_my_active_occurrence_report('95200000-0000-0000-0000-000000000001')),
  current_setting('test.report_id'), 'a user can identify their own active report');
select is((select count(*)::int from public.get_my_active_occurrence_report('95200000-0000-0000-0000-000000000001')),
  1, 'a user receives at most one active report for the same occurrence');
select throws_ok($$select * from buscapet_private.occurrence_reports$$,
  '42501', null, 'reporter cannot bypass the API to inspect report rows');
select throws_ok($$select * from public.admin_list_occurrence_reports()$$,
  '42501', null, 'ordinary user cannot access the administrative queue');
select throws_ok(format('select * from public.admin_get_occurrence_report(%L::uuid)', current_setting('test.report_id')),
  '42501', null, 'ordinary user cannot access report details');
select is((select count(*)::int from public.get_my_active_occurrence_report('95200000-0000-0000-0000-000000000001')),
  1, 'the reporter can read only their own report status');
select is((select count(*)::int from public.get_my_active_occurrence_report('95200000-0000-0000-0000-000000000004')),
  0, 'report status lookup does not reveal another user''s report');
select throws_ok($$select * from public.report_occurrence('95200000-0000-0000-0000-000000000002', 'other', 'Ocorrência privada não pode ser denunciada.')$$,
  'P0002', null, 'private occurrences cannot be reported');
select throws_ok($$select * from public.report_occurrence('95200000-0000-0000-0000-000000000003', 'other', 'Responsável não deve denunciar o próprio alerta.')$$,
  'P0002', null, 'users cannot report their own occurrence');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select * from public.report_occurrence('95200000-0000-0000-0000-000000000001', 'other', 'Conta suspensa tenta enviar denúncia.')$$,
  '42501', null, 'suspended account cannot submit reports');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select * from public.report_occurrence('95200000-0000-0000-0000-000000000004', 'other', 'Denúncia adicional quatro para rate limit.');
select * from public.report_occurrence('95200000-0000-0000-0000-000000000005', 'other', 'Denúncia adicional cinco para rate limit.');
select * from public.report_occurrence('95200000-0000-0000-0000-000000000006', 'other', 'Denúncia adicional seis para rate limit.');
select * from public.report_occurrence('95200000-0000-0000-0000-000000000007', 'other', 'Denúncia adicional sete para rate limit.');
select throws_ok($$select * from public.report_occurrence('95200000-0000-0000-0000-000000000008', 'other', 'Sexta denúncia deve exceder o limite diário.')$$,
  'P0001', null, 'reporter is rate-limited after five submissions in 24 hours');
reset role;

-- A different reporter creates another report, which the moderator can process.
set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select * from public.report_occurrence('95200000-0000-0000-0000-000000000001', 'suspected_fraud',
  'Suspeita de fraude em outra denúncia de teste.');
select set_config('test.second_report_id', (select report_id::text from public.get_my_active_occurrence_report('95200000-0000-0000-0000-000000000001')), true);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select * from public.report_occurrence('95200000-0000-0000-0000-000000000001', 'other',
  'Denúncia enviada pela própria moderadora para teste de conflito.');
select set_config('test.moderator_report_id', (select report_id::text from public.get_my_active_occurrence_report('95200000-0000-0000-0000-000000000001')), true);
select is((select count(*)::int from public.admin_occurrence_report_counts()), 1,
  'moderator can read aggregate report counts');
select is((select open_count from public.admin_occurrence_report_counts()), 7::bigint,
  'aggregate counts include open reports without exposing reporter identity');
select ok((select report_id::text = current_setting('test.report_id')
  from public.admin_list_occurrence_reports('Luna', 'open', 'duplicate_occurrence', null, null, 'newest', 1, 10)),
  'moderator queue supports search and category/status filters');
select is((select total_count from public.admin_list_occurrence_reports(
  null, null, null, null, null, 'oldest', 1, 1)), 6::bigint,
  'moderator queue paginates and reports total matches');
select is((select count(*)::int from public.admin_list_occurrence_reports(
  current_setting('test.report_id'), null, null, null, null, 'newest', 1, 20)), 1,
  'moderator queue can search by report identifier');
select is((select count(*)::int from public.admin_list_occurrence_reports(
  '95000000-0000-0000-0000-000000000002', null, null, null, null, 'newest', 1, 20)), 0,
  'moderator queue search does not expose the reporter identifier');
select is((select pet_name from public.admin_get_occurrence_report(current_setting('test.report_id')::uuid)),
  'Luna', 'moderator can open safe related occurrence details');
select throws_ok(format('select * from public.admin_transition_occurrence_report(%L::uuid, ''resolved'', ''Justificativa suficiente.'' )', current_setting('test.report_id')),
  '22023', null, 'report cannot be resolved before analysis starts');
select is((select report_status from public.admin_transition_occurrence_report(
  current_setting('test.report_id')::uuid, 'in_review', null)), 'in_review',
  'moderator can begin analysis and the transition is recorded');
select throws_ok(format('select * from public.admin_transition_occurrence_report(%L::uuid, ''resolved'', ''curto'')', current_setting('test.report_id')),
  '22023', null, 'resolution requires a substantive justification');
select is((select report_status from public.admin_transition_occurrence_report(
  current_setting('test.report_id')::uuid, 'resolved', 'Conteúdo revisado e ocorrência confirmada.')), 'resolved',
  'moderator can resolve a report with justification');
select is((select status from public.occurrences where id = '95200000-0000-0000-0000-000000000001'),
  'active', 'report resolution does not alter occurrence status');
select is((select visibility from public.occurrences where id = '95200000-0000-0000-0000-000000000001'),
  'public', 'report resolution does not automatically hide the occurrence');
select results_eq($$select action, from_status, to_status from public.admin_list_occurrence_report_history(
  current_setting('test.report_id')::uuid, 1, 20)
  order by case to_status when 'resolved' then 1 when 'in_review' then 2 else 3 end$$,
  $$values ('resolved'::text, 'in_review'::text, 'resolved'::text),
    ('review_started'::text, 'open'::text, 'in_review'::text),
    ('submitted'::text, null::text, 'open'::text)$$,
  'history records submit, triage, and resolution in order');
select is((select actor_name from public.admin_list_occurrence_report_history(
  current_setting('test.report_id')::uuid, 3, 1)), 'Identidade protegida',
  'history does not reveal the reporting user identity');
select is((select reason from public.admin_list_occurrence_report_history(
  current_setting('test.report_id')::uuid, 1, 1)), 'Conteúdo revisado e ocorrência confirmada.',
  'decision history includes the mandatory justification');
select throws_ok(format('select * from public.admin_transition_occurrence_report(%L::uuid, ''dismissed'', ''Outra decisão inválida.'')', current_setting('test.report_id')),
  'PT409', null, 'resolved reports cannot be transitioned again without retry semantics');
select throws_ok(format('select * from public.admin_transition_occurrence_report(%L::uuid, ''in_review'', null)', current_setting('test.moderator_report_id')),
  'P0002', null, 'moderator cannot triage their own submitted report');
reset role;

select * from finish();
rollback;
