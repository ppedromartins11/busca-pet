begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('94000000-0000-0000-0000-000000000001', 'moderation-owner@example.test'),
  ('94000000-0000-0000-0000-000000000002', 'moderation-other@example.test'),
  ('94000000-0000-0000-0000-000000000003', 'moderation-staff@example.test'),
  ('94000000-0000-0000-0000-000000000004', 'moderation-admin@example.test'),
  ('94000000-0000-0000-0000-000000000005', 'moderation-suspended@example.test');
update public.profiles set full_name = case id
  when '94000000-0000-0000-0000-000000000001'::uuid then 'Pessoa Tutora'
  when '94000000-0000-0000-0000-000000000002'::uuid then 'Outra Pessoa'
  when '94000000-0000-0000-0000-000000000003'::uuid then 'Moderadora de Teste'
  when '94000000-0000-0000-0000-000000000004'::uuid then 'Administradora de Teste'
  when '94000000-0000-0000-0000-000000000005'::uuid then 'Moderador Suspenso'
end where id between '94000000-0000-0000-0000-000000000001'::uuid
  and '94000000-0000-0000-0000-000000000005'::uuid;
insert into public.user_roles(user_id, role) values
  ('94000000-0000-0000-0000-000000000003', 'moderador'),
  ('94000000-0000-0000-0000-000000000004', 'administrador'),
  ('94000000-0000-0000-0000-000000000005', 'moderador');
update public.profiles set status = 'suspended'
where id = '94000000-0000-0000-0000-000000000005';

insert into public.pets(id, owner_id, name, species, breed, coat_description, distinctive_features) values
  ('94100000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'Bolinha', 'dog', 'SRD', 'Caramelo', 'Coleira azul'),
  ('94100000-0000-0000-0000-000000000002', '94000000-0000-0000-0000-000000000002', 'Lua', 'cat', 'SRD', 'Cinza', 'Mancha branca');
insert into public.occurrences(id, pet_id, reporter_id, type, status, visibility, city, region,
  public_reference, last_seen_at, description, created_at, resolved_at) values
  ('94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'lost', 'active', 'public', 'Cuiabá', 'Centro', 'Praça central', now(), 'Cão desaparecido para teste de moderação.', '2026-10-10T12:00:00Z', null),
  ('94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000002', '94000000-0000-0000-0000-000000000002', 'found', 'reunited', 'under_review', 'Cuiabá', 'Porto', 'Parque público', now(), 'Gato encontrado para teste de moderação.', '2026-10-20T12:00:00Z', now()),
  ('94200000-0000-0000-0000-000000000003', null, '94000000-0000-0000-0000-000000000002', 'lost', 'active', 'public', 'Várzea Grande', 'Centro', null, now(), 'Alerta público adicional para paginação.', '2026-09-20T12:00:00Z', null),
  ('94200000-0000-0000-0000-000000000004', null, '94000000-0000-0000-0000-000000000002', 'lost', 'active', 'private', 'Cuiabá', 'Privada', null, now(), 'Este alerta privado não deve aparecer para a equipe.', '2026-10-21T12:00:00Z', null),
  ('94200000-0000-0000-0000-000000000005', null, '94000000-0000-0000-0000-000000000003', 'lost', 'active', 'public', 'Cuiabá', 'Equipe', null, now(), 'Publicação própria não pode ser moderada.', '2026-10-22T12:00:00Z', null);

insert into public.occurrence_photos(id, occurrence_id, uploaded_by, storage_path, mime_type, byte_size) values
  ('94300000-0000-0000-0000-000000000001', '94200000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001',
   '94000000-0000-0000-0000-000000000001/94300000-0000-0000-0000-000000000001.png', 'image/png', 128);
insert into storage.objects(bucket_id, name, owner_id, metadata) values
  ('pet-media', '94000000-0000-0000-0000-000000000001/94300000-0000-0000-0000-000000000001.png', null,
   '{"mimetype":"image/png","size":128}'::jsonb);
insert into buscapet_private.admin_audit(actor_id, occurrence_id, action) values
  ('94000000-0000-0000-0000-000000000004', '94200000-0000-0000-0000-000000000001', 'visibility:under_review');

select ok(not has_function_privilege('anon', 'public.admin_list_occurrences(text,text,text,text,date,date,integer,integer)', 'EXECUTE'),
  'anon cannot execute occurrence list');
select ok(not has_function_privilege('anon', 'public.admin_get_occurrence(uuid)', 'EXECUTE'),
  'anon cannot execute occurrence details');
select ok(not has_function_privilege('anon', 'public.admin_moderate_occurrence(uuid,text,text)', 'EXECUTE'),
  'anon cannot execute moderation decisions');
select ok(not has_function_privilege('anon', 'public.admin_list_occurrence_audit(uuid,integer,integer)', 'EXECUTE'),
  'anon cannot execute moderation history');
select ok(not has_function_privilege('authenticated', 'public.moderate_occurrence(uuid, public.occurrence_visibility)', 'EXECUTE'),
  'legacy moderation RPC without mandatory reason is revoked');
select ok((select prosecdef from pg_proc where oid =
  'buscapet_private.admin_moderate_occurrence(uuid,text,text)'::regprocedure),
  'only private moderation implementation runs as security definer');
select ok(not (select prosecdef from pg_proc where oid =
  'public.admin_moderate_occurrence(uuid,text,text)'::regprocedure),
  'public moderation endpoint remains security invoker');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid =
  'buscapet_private.admin_moderate_occurrence(uuid,text,text)'::regprocedure),
  'privileged moderation implementation pins an empty search path');
select ok(not has_table_privilege('authenticated', 'buscapet_private.admin_audit', 'SELECT'),
  'moderators cannot bypass RPC to read the audit table');

set local role anon;
select set_config('storage.operation', 'object.get_authenticated', true);
select throws_ok($$select * from public.admin_list_occurrences()$$, '42501', null,
  'anonymous role cannot list administrative occurrences');
select throws_ok($$select * from public.admin_get_occurrence('94200000-0000-0000-0000-000000000001')$$, '42501', null,
  'anonymous role cannot read administrative occurrence details');
select throws_ok($$select * from public.admin_moderate_occurrence('94200000-0000-0000-0000-000000000001', 'hide', 'Justificativa suficientemente longa')$$, '42501', null,
  'anonymous role cannot change occurrence visibility');
select is((select count(*)::int from public.occurrences), 3,
  'anonymous public feed still sees only public occurrences');
select is((select count(*)::int from storage.objects where bucket_id = 'pet-media'
  and name = '94000000-0000-0000-0000-000000000001/94300000-0000-0000-0000-000000000001.png'), 1,
  'anonymous visitor can still read a photo linked to a published occurrence');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000001', true);
select throws_ok($$select * from public.admin_list_occurrences()$$, '42501', null,
  'common user cannot list moderation queue');
select throws_ok($$select * from public.admin_get_occurrence('94200000-0000-0000-0000-000000000001')$$, '42501', null,
  'common user cannot use moderation details RPC');
select throws_ok($$select * from public.admin_moderate_occurrence('94200000-0000-0000-0000-000000000001', 'hide', 'Justificativa suficientemente longa')$$, '42501', null,
  'common user cannot hide an occurrence');
select is((select count(*)::int from public.occurrences where visibility = 'public'), 3,
  'public feed remains available under ordinary authenticated access');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000005', true);
select throws_ok($$select * from public.admin_list_occurrences()$$, '42501', null,
  'suspended moderator cannot access the queue');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000003', true);
select set_config('storage.operation', 'object.get_authenticated', true);
select is((select total_count from public.admin_list_occurrences(null, null, null, null, null, null, 1, 2) limit 1),
  3::bigint, 'active moderator receives only public and under-review occurrences, excluding own and private records');
select isnt((select occurrence_id from public.admin_list_occurrences(null, null, null, null, null, null, 1, 1)),
  (select occurrence_id from public.admin_list_occurrences(null, null, null, null, null, null, 2, 1)),
  'moderation queue pagination is deterministic');
select is((select count(*)::int from public.admin_list_occurrences('Bolinha', null, null, null, null, null, 1, 20)),
  1, 'search matches permitted animal name');
select is((select count(*)::int from public.admin_list_occurrences(null, 'found', null, null, null, null, 1, 20)),
  1, 'type filter returns matching occurrence');
select is((select count(*)::int from public.admin_list_occurrences(null, null, 'reunited', null, null, null, 1, 20)),
  1, 'status filter returns matching occurrence');
select is((select count(*)::int from public.admin_list_occurrences(null, null, null, 'under_review', null, null, 1, 20)),
  1, 'visibility filter returns only records under review');
select is((select count(*)::int from public.admin_list_occurrences(null, null, null, null, '2026-10-01', '2026-10-15', 1, 20)),
  1, 'inclusive creation date filters narrow the list');
select throws_ok($$select * from public.admin_list_occurrences(null, null, null, null, '2026-10-20', '2026-10-01', 1, 20)$$,
  '22023', null, 'reversed date range is rejected');
select throws_ok($$select * from public.admin_list_occurrences(null, null, null, null, null, null, 1, 51)$$,
  '22023', null, 'page size above fifty is rejected');
select is((select pet_name from public.admin_get_occurrence('94200000-0000-0000-0000-000000000001')),
  'Bolinha', 'moderator can read authorized animal and occurrence detail');
select is((select jsonb_array_length(photos) from public.admin_get_occurrence('94200000-0000-0000-0000-000000000001')),
  1, 'detail RPC returns only photos linked to the selected occurrence');
select ok(not exists (
  select 1 from jsonb_object_keys((select to_jsonb(details)
    from public.admin_get_occurrence('94200000-0000-0000-0000-000000000001') details)) as fields(name)
  where name in ('reporter_id', 'email', 'phone', 'exact_location', 'encrypted_password', 'raw_user_meta_data')
), 'detail response omits author identity, credentials, and exact coordinates');
select results_eq($$select action, reason from public.admin_list_occurrence_audit(
  '94200000-0000-0000-0000-000000000001', 1, 20)$$,
  $$values ('occurrence_hidden'::text, null::text)$$,
  'history maps earlier moderation decisions into the current display model');
select throws_ok($$select * from public.admin_get_occurrence('94200000-0000-0000-0000-000000000004')$$,
  'P0002', null, 'private occurrence is not available through moderator details');
select throws_ok($$select * from public.admin_moderate_occurrence('94200000-0000-0000-0000-000000000005', 'hide', 'Justificativa suficientemente longa')$$,
  'P0002', null, 'moderator cannot self-moderate own occurrence');
select throws_ok($$select * from public.admin_moderate_occurrence('94200000-0000-0000-0000-000000000001', 'hide', 'curta')$$,
  '22023', null, 'moderation reason shorter than ten characters is rejected');
select is((select visibility::text from public.occurrences where id = '94200000-0000-0000-0000-000000000001'),
  'public', 'invalid decision does not change visibility');
select is((select status::text from public.occurrences where id = '94200000-0000-0000-0000-000000000001'),
  'active', 'moderation does not alter disappearance status');
select is((select visibility from public.admin_moderate_occurrence('94200000-0000-0000-0000-000000000001', 'hide', 'Possível duplicidade confirmada.')),
  'under_review', 'active moderator can hide a public occurrence');
select is((select status::text from public.occurrences where id = '94200000-0000-0000-0000-000000000001'),
  'active', 'hide transition preserves occurrence status');
select is((select count(*)::int from storage.objects where bucket_id = 'pet-media'
  and name = '94000000-0000-0000-0000-000000000001/94300000-0000-0000-0000-000000000001.png'), 1,
  'active moderator can read a linked photo while reviewing the hidden occurrence');
select throws_ok($$select * from public.admin_moderate_occurrence('94200000-0000-0000-0000-000000000001', 'hide', 'Outra justificativa longa')$$,
  '22023', null, 'duplicate hide transition is rejected');
select results_eq($$select actor_name, action, reason from public.admin_list_occurrence_audit(
  '94200000-0000-0000-0000-000000000001', 1, 20)$$,
  $$values ('Moderadora de Teste'::text, 'occurrence_hidden'::text,
      'Possível duplicidade confirmada.'::text),
    ('Administradora de Teste'::text, 'occurrence_hidden'::text, null::text)$$,
  'moderator can read audit actor, decision, and mandatory reason through the bounded RPC');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000002', true);
select set_config('storage.operation', 'object.get_authenticated', true);
select is((select count(*)::int from storage.objects where bucket_id = 'pet-media'
  and name = '94000000-0000-0000-0000-000000000001/94300000-0000-0000-0000-000000000001.png'), 0,
  'ordinary user cannot read a hidden occurrence photo uploaded by another account');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000004', true);
select is((select visibility from public.admin_moderate_occurrence('94200000-0000-0000-0000-000000000001', 'restore', 'Revisão concluída, publicação pode voltar.')),
  'public', 'active administrator can restore visibility');
reset role;

select is((select status::text from public.occurrences where id = '94200000-0000-0000-0000-000000000001'),
  'active', 'restore transition preserves occurrence status');
select results_eq($$select action, reason from public.admin_list_occurrence_audit('94200000-0000-0000-0000-000000000001', 1, 20) order by action, reason nulls first$$,
  $$values ('occurrence_hidden'::text, null::text),
    ('occurrence_hidden'::text, 'Possível duplicidade confirmada.'::text),
    ('occurrence_restored'::text, 'Revisão concluída, publicação pode voltar.'::text)$$,
  'history presents the hide and restore decisions with reasons');
set local role anon;
select set_config('storage.operation', 'object.get_authenticated', true);
select is((select count(*)::int from storage.objects where bucket_id = 'pet-media'
  and name = '94000000-0000-0000-0000-000000000001/94300000-0000-0000-0000-000000000001.png'), 1,
  'public feed photo becomes readable again only after authorized restoration');
reset role;

select * from finish();
rollback;
