begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

select ok(not has_function_privilege('anon',
  'public.guest_ingress_writes_open()', 'EXECUTE'),
  'anonymous callers cannot query the guest write gate');
select ok(not has_function_privilege('authenticated',
  'public.guest_ingress_writes_open()', 'EXECUTE'),
  'signed-in clients cannot query the guest write gate');
select ok(has_function_privilege('service_role',
  'public.guest_ingress_writes_open()', 'EXECUTE'),
  'server-side service role can query the gate');
select ok(not has_table_privilege('service_role',
  'buscapet_private.maintenance_state', 'SELECT'),
  'service role cannot read private state or reason directly');

set local role service_role;
select is(public.guest_ingress_writes_open(), true,
  'server ingress sees initial open state');
reset role;
select buscapet_private.set_maintenance(true,
  'R4.5 isolated guest preflight verification',
  (select generation from buscapet_private.maintenance_state));
set local role service_role;
select is(public.guest_ingress_writes_open(), false,
  'server ingress sees closed gate');
reset role;
set local role anon;
select throws_ok($$select public.guest_ingress_writes_open() from pg_catalog.pg_roles
  where rolname = 'anon'$$, '42501', 'permission denied for function guest_ingress_writes_open',
  'SQL direct call still requires function grant');
reset role;
select buscapet_private.set_maintenance(false,
  'R4.5 isolated guest preflight reopening',
  (select generation from buscapet_private.maintenance_state));
set local role service_role;
select is(public.guest_ingress_writes_open(), true,
  'server ingress sees reopened gate');
reset role;
select is((select count(*)::integer from buscapet_private.maintenance_transitions),
  2, 'both R4.5 test transitions were audited');

select * from finish();
rollback;
