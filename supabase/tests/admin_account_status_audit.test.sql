begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(33);

insert into auth.users(id, email) values
  ('92000000-0000-0000-0000-000000000001', 'status-admin-one@example.test'),
  ('92000000-0000-0000-0000-000000000002', 'status-admin-two@example.test'),
  ('92000000-0000-0000-0000-000000000003', 'status-target@example.test'),
  ('92000000-0000-0000-0000-000000000004', 'status-common@example.test'),
  ('92000000-0000-0000-0000-000000000005', 'status-suspended-admin@example.test');
insert into public.user_roles(user_id, role) values
  ('92000000-0000-0000-0000-000000000001', 'administrador'),
  ('92000000-0000-0000-0000-000000000002', 'administrador'),
  ('92000000-0000-0000-0000-000000000005', 'administrador');
update public.profiles set full_name = case id
  when '92000000-0000-0000-0000-000000000001'::uuid then 'Admin Um'
  when '92000000-0000-0000-0000-000000000002'::uuid then 'Admin Dois'
  when '92000000-0000-0000-0000-000000000003'::uuid then 'Conta Alvo'
  when '92000000-0000-0000-0000-000000000004'::uuid then 'Conta Comum'
  when '92000000-0000-0000-0000-000000000005'::uuid then 'Admin Suspenso'
end
where id between '92000000-0000-0000-0000-000000000001'::uuid
  and '92000000-0000-0000-0000-000000000005'::uuid;
update public.profiles set status = 'suspended'
where id in (
  '92000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000005'
);
insert into public.pets(id, owner_id, name, species) values
  ('92100000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000003', 'Vínculo preservado', 'dog');

select ok((select relrowsecurity from pg_class where oid = 'buscapet_private.admin_audit'::regclass),
  'administrative audit has RLS enabled');
select ok(not has_table_privilege('authenticated', 'buscapet_private.admin_audit', 'SELECT'),
  'authenticated users have no direct read privilege on administrative audit');
select ok(not has_function_privilege('authenticated',
  'public.set_account_status(uuid, public.account_status)', 'EXECUTE'),
  'legacy status endpoint is no longer callable by authenticated users');
select ok(not has_function_privilege('anon',
  'public.admin_change_account_status(uuid, public.account_status, text)', 'EXECUTE'),
  'anonymous users cannot execute account status changes');
select ok(not has_function_privilege('anon',
  'public.admin_list_account_status_audit(uuid, integer, integer)', 'EXECUTE'),
  'anonymous users cannot execute account audit history');
select ok((select prosecdef from pg_proc where oid =
  'buscapet_private.admin_change_account_status(uuid, public.account_status, text)'::regprocedure),
  'status transition runs only in a private security definer function');
select ok(not (select prosecdef from pg_proc where oid =
  'public.admin_change_account_status(uuid, public.account_status, text)'::regprocedure),
  'public status transition wrapper remains security invoker');

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000004', true);
select throws_ok($$select * from buscapet_private.admin_audit$$,
  '42501', null, 'authenticated users cannot bypass the protected audit RPC with a table read');
reset role;

set local role anon;
select throws_ok($$select * from public.admin_change_account_status(
  '92000000-0000-0000-0000-000000000003', 'suspended', 'Motivo de teste suficientemente detalhado')$$,
  '42501', null, 'anonymous users cannot suspend an account');
select throws_ok($$select * from public.admin_list_account_status_audit(
  '92000000-0000-0000-0000-000000000003')$$,
  '42501', null, 'anonymous users cannot read account status history');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
select throws_ok($$select * from public.admin_change_account_status(
  '92000000-0000-0000-0000-000000000003', 'suspended', 'curto')$$,
  '22023', null, 'suspension reason shorter than ten characters is rejected');
select is((select status from public.admin_get_user('92000000-0000-0000-0000-000000000003')),
  'active', 'invalid suspension leaves target status unchanged');
select is((select count(*)::int from public.admin_list_account_status_audit(
  '92000000-0000-0000-0000-000000000003', 1, 20)), 0,
  'invalid suspension creates no partial audit record');
select throws_ok($$select * from public.admin_change_account_status(
  '92000000-0000-0000-0000-000000000001', 'suspended', 'Motivo de teste suficientemente detalhado')$$,
  '42501', null, 'administrator cannot suspend their own account');
select is((select count(*)::int from public.profiles administrator_profile
  join public.user_roles administrator_role
    on administrator_role.user_id = administrator_profile.id
   and administrator_role.role = 'administrador'
  where administrator_profile.id in (
    '92000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000005'
  ) and administrator_profile.status = 'active'), 1,
  'the sole active administrator remains active after a self-suspension attempt');
select is((select status::text from public.profiles where id = '92000000-0000-0000-0000-000000000001'),
  'active', 'self-suspension denial leaves administrator active');
select is((select action from public.admin_change_account_status(
  '92000000-0000-0000-0000-000000000003', 'suspended', 'Violação das regras de uso confirmada.')),
  'account_suspended', 'active administrator can suspend a common account');
reset role;

select is((select status::text from public.profiles where id = '92000000-0000-0000-0000-000000000003'),
  'suspended', 'suspension updates the target profile status');
select results_eq(
  $$select actor_id, action, reason from buscapet_private.admin_audit
    where target_id = '92000000-0000-0000-0000-000000000003' order by id$$,
  $$values ('92000000-0000-0000-0000-000000000001'::uuid, 'account_suspended'::text,
    'Violação das regras de uso confirmada.'::text)$$,
  'suspension audit records actor, action, and mandatory reason');
select is((select count(*)::int from public.pets where owner_id = '92000000-0000-0000-0000-000000000003'), 1,
  'suspension preserves pets and their account link');

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000003', true);
select is((select count(*)::int from public.pets), 0,
  'suspended account cannot read its previously owned protected pet');
select throws_ok($$insert into public.pets(owner_id, name, species)
  values ('92000000-0000-0000-0000-000000000003', 'Ação bloqueada', 'cat')$$,
  '42501', null, 'suspended account cannot create protected records with its existing session');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
select is((select action from public.admin_change_account_status(
  '92000000-0000-0000-0000-000000000003', 'active', null)),
  'account_reactivated', 'active administrator can reactivate a suspended account');
reset role;

select is((select status::text from public.profiles where id = '92000000-0000-0000-0000-000000000003'),
  'active', 'reactivation updates the target profile status');
select is((select count(*)::int from buscapet_private.admin_audit
  where target_id = '92000000-0000-0000-0000-000000000003'), 2,
  'reactivation creates exactly one additional audit record');

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
select results_eq(
  $$select action, reason from public.admin_list_account_status_audit(
    '92000000-0000-0000-0000-000000000003', 1, 20) order by created_at, action$$,
  $$values ('account_reactivated'::text, null::text),
    ('account_suspended'::text, 'Violação das regras de uso confirmada.'::text)$$,
  'authorized administrator receives only the status history fields');
select throws_ok($$select * from public.admin_change_account_status(
  '92000000-0000-0000-0000-000000000003', 'active', null)$$,
  '22023', null, 'duplicate status transition is rejected');
reset role;

select is((select count(*)::int from buscapet_private.admin_audit
  where target_id = '92000000-0000-0000-0000-000000000003'), 2,
  'duplicate transition does not create an audit record');

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000004', true);
select throws_ok($$select * from public.admin_change_account_status(
  '92000000-0000-0000-0000-000000000003', 'suspended', 'Motivo de teste suficientemente detalhado')$$,
  '42501', null, 'common account cannot change account status');
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000005', true);
select throws_ok($$select * from public.admin_change_account_status(
  '92000000-0000-0000-0000-000000000003', 'suspended', 'Motivo de teste suficientemente detalhado')$$,
  '42501', null, 'suspended administrator cannot change account status');
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);
select throws_ok($$select * from public.admin_list_account_status_audit(
  '92000000-0000-0000-0000-000000000003', 1, 51)$$,
  '22023', null, 'audit history page size above fifty is rejected');
reset role;

select ok(position('the last active administrator cannot be suspended' in pg_get_functiondef(
  'buscapet_private.admin_change_account_status(uuid, public.account_status, text)'::regprocedure)) > 0,
  'function contains the last-active-administrator invariant');
select ok(position('pg_advisory_xact_lock' in pg_get_functiondef(
  'buscapet_private.admin_change_account_status(uuid, public.account_status, text)'::regprocedure)) > 0,
  'function serializes concurrent account status transitions');

select * from finish();
rollback;
