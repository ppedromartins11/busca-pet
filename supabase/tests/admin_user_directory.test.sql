begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(24);

insert into auth.users(id, email) values
  ('91000000-0000-0000-0000-000000000001', 'directory-common@example.test'),
  ('91000000-0000-0000-0000-000000000002', 'directory-admin@example.test'),
  ('91000000-0000-0000-0000-000000000003', 'directory-suspended-admin@example.test'),
  ('91000000-0000-0000-0000-000000000004', 'directory-multi@example.test'),
  ('91000000-0000-0000-0000-000000000005', 'directory-literal@example.test'),
  ('91000000-0000-0000-0000-000000000006', 'directory-decoy@example.test');

update public.profiles set full_name = case id
  when '91000000-0000-0000-0000-000000000001'::uuid then 'Directory Common'
  when '91000000-0000-0000-0000-000000000002'::uuid then 'Directory Admin'
  when '91000000-0000-0000-0000-000000000003'::uuid then 'Directory Suspended Admin'
  when '91000000-0000-0000-0000-000000000004'::uuid then 'Directory Multi Role'
  when '91000000-0000-0000-0000-000000000005'::uuid then 'Directory 100%_literal'
  when '91000000-0000-0000-0000-000000000006'::uuid then 'Directory 100AAZliteral'
end
where id between '91000000-0000-0000-0000-000000000001'::uuid
  and '91000000-0000-0000-0000-000000000006'::uuid;

insert into public.user_roles(user_id, role) values
  ('91000000-0000-0000-0000-000000000002', 'administrador'),
  ('91000000-0000-0000-0000-000000000003', 'administrador'),
  ('91000000-0000-0000-0000-000000000004', 'colaborador');
update public.profiles set status = 'suspended'
where id = '91000000-0000-0000-0000-000000000003';

select ok((select prosecdef from pg_proc where oid =
  'buscapet_private.admin_list_users(text,text,text,text,integer,integer)'::regprocedure),
  'directory list reads privileged sources only inside a private security definer function');
select ok(not (select prosecdef from pg_proc where oid =
  'public.admin_list_users(text,text,text,text,integer,integer)'::regprocedure),
  'public directory list wrapper remains security invoker');
select ok(not has_function_privilege('anon',
  'public.admin_list_users(text,text,text,text,integer,integer)', 'EXECUTE'),
  'anonymous users cannot execute the directory list');
select ok(not has_function_privilege('anon', 'public.admin_get_user(uuid)', 'EXECUTE'),
  'anonymous users cannot execute directory details');
select ok(not has_table_privilege('authenticated', 'auth.users', 'SELECT'),
  'authenticated users do not receive direct auth.users access');

set local role anon;
select throws_ok($$select * from public.admin_list_users()$$, '42501', null,
  'anonymous role cannot call the directory list');
select throws_ok($$select * from public.admin_get_user('91000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'anonymous role cannot call directory details');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);

select is((select total_count from public.admin_list_users('Directory', null, null, 'name', 1, 20) limit 1),
  6::bigint, 'active administrator receives a filtered total from the server');
select is((select email from public.admin_list_users('directory-admin@example.test', null, null, 'newest', 1, 20)),
  'directory-admin@example.test', 'active administrator can search the permitted e-mail field');
select results_eq(
  $$select roles from public.admin_list_users('Directory Multi Role', null, null, 'name', 1, 20)$$,
  $$values (array['colaborador', 'tutor']::text[])$$,
  'all effective roles are returned, rather than only active_role');
select is((select count(*) from public.admin_list_users('Directory', 'active', null, 'name', 1, 20)),
  5::bigint, 'active status filter excludes suspended accounts');
select is((select count(*) from public.admin_list_users('Directory', 'suspended', null, 'name', 1, 20)),
  1::bigint, 'suspended status filter returns the suspended account');
select is((select count(*) from public.admin_list_users('Directory', null, 'colaborador', 'name', 1, 20)),
  1::bigint, 'role filter uses all assigned roles');
select is((select count(*) from public.admin_list_users('Directory', null, 'administrador', 'name', 1, 20)),
  2::bigint, 'role filter includes every assigned administrator role');
select is((select count(*) from public.admin_list_users('100%_', null, null, 'name', 1, 20)),
  1::bigint, 'search escapes literal percent and underscore characters');
select is((select total_count from public.admin_list_users('Directory', null, null, 'newest', 1, 1)),
  6::bigint, 'pagination keeps the total compatible with the filters');
select isnt(
  (select account_id from public.admin_list_users('Directory', null, null, 'newest', 1, 1)),
  (select account_id from public.admin_list_users('Directory', null, null, 'newest', 2, 1)),
  'deterministic ordering prevents duplicate first and second pages');
select throws_ok($$select * from public.admin_list_users(null, null, null, 'newest', 1, 51)$$,
  '22023', null, 'page size above 50 is rejected by the database');
select is((select email from public.admin_get_user('91000000-0000-0000-0000-000000000002')),
  'directory-admin@example.test', 'active administrator can view permitted account details');
select is((select active_role from public.admin_get_user('91000000-0000-0000-0000-000000000004')),
  'tutor', 'details expose the stored active role without reducing multiple roles');
select ok(not exists (
  select 1
  from jsonb_object_keys((
    select to_jsonb(details)
    from public.admin_get_user('91000000-0000-0000-0000-000000000002') details
  )) as returned_column(name)
  where name in ('encrypted_password', 'raw_user_meta_data', 'raw_app_meta_data', 'recovery_token', 'confirmation_token')
), 'directory details omit password, token, and metadata fields');
select is((select full_name from public.profiles where id = '91000000-0000-0000-0000-000000000002'),
  'Directory Admin', 'read-only directory functions do not modify account records');

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select throws_ok($$select * from public.admin_list_users()$$, '42501', null,
  'common account cannot list administrative users');
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);
select throws_ok($$select * from public.admin_get_user('91000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'suspended administrator cannot view administrative user details');
reset role;

select * from finish();
rollback;
