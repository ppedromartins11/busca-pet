begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
  ('97300000-0000-0000-0000-000000000001', 'contract-owner@example.test'),
  ('97300000-0000-0000-0000-000000000002', 'contract-other@example.test'),
  ('97300000-0000-0000-0000-000000000003', 'contract-moderator@example.test'),
  ('97300000-0000-0000-0000-000000000004', 'contract-suspended-owner@example.test'),
  ('97300000-0000-0000-0000-000000000005', 'contract-suspended-moderator@example.test');
insert into public.user_roles(user_id, role) values
  ('97300000-0000-0000-0000-000000000003', 'moderador'),
  ('97300000-0000-0000-0000-000000000005', 'moderador');
insert into public.pets(id, owner_id, name, species) values
  ('97400000-0000-0000-0000-000000000001',
   '97300000-0000-0000-0000-000000000001', 'Contract Pet', 'dog');
insert into public.occurrences(id, pet_id, reporter_id, type, status, visibility,
  city, region, public_reference, last_seen_at, description) values
  ('97500000-0000-0000-0000-000000000001',
   '97400000-0000-0000-0000-000000000001',
   '97300000-0000-0000-0000-000000000001', 'lost', 'active', 'public',
   'Cuiaba', 'Centro', 'Perto da praça', now(),
   'Synthetic public occurrence owned by account A.'),
  ('97500000-0000-0000-0000-000000000002',
   '97400000-0000-0000-0000-000000000001',
   '97300000-0000-0000-0000-000000000001', 'found', 'active', 'private',
   'Cuiaba', 'Private', null, now(),
   'Synthetic private occurrence owned by account A.'),
  ('97500000-0000-0000-0000-000000000003', null,
   '97300000-0000-0000-0000-000000000001', 'lost', 'active', 'under_review',
   'Cuiaba', 'Review', null, now(),
   'Synthetic occurrence under moderation review.'),
  ('97500000-0000-0000-0000-000000000004', null,
   '97300000-0000-0000-0000-000000000002', 'found', 'active', 'public',
   'Cuiaba', 'Other', null, now(),
   'Synthetic public occurrence owned by account B.'),
  ('97500000-0000-0000-0000-000000000005', null,
   '97300000-0000-0000-0000-000000000004', 'lost', 'active', 'private',
   'Cuiaba', 'Suspended', null, now(),
   'Synthetic private occurrence owned by a suspended account.');
update public.profiles set status = 'suspended'
where id in (
  '97300000-0000-0000-0000-000000000004',
  '97300000-0000-0000-0000-000000000005'
);

select ok((select relrowsecurity from pg_class where oid = 'public.occurrences'::regclass),
  'existing RLS remains enabled');
select ok(not has_table_privilege('anon', 'public.occurrences', 'SELECT'),
  'anon has no broad SELECT grant on the base table');
select ok(not has_table_privilege('authenticated', 'public.occurrences', 'SELECT'),
  'authenticated has no broad SELECT grant on the base table');
select ok(not has_column_privilege('anon', 'public.occurrences', 'reporter_id', 'SELECT'),
  'anon cannot select reporter_id');
select ok(not has_column_privilege('authenticated', 'public.occurrences', 'reporter_id', 'SELECT'),
  'authenticated cannot select reporter_id');
select ok(not has_column_privilege('anon', 'public.occurrences', 'pet_id', 'SELECT'),
  'anon cannot select pet_id');
select ok(not has_column_privilege('authenticated', 'public.occurrences', 'pet_id', 'SELECT'),
  'authenticated cannot select pet_id');
select ok(not has_column_privilege('anon', 'public.occurrences', 'updated_at', 'SELECT')
  and not has_column_privilege('authenticated', 'public.occurrences', 'updated_at', 'SELECT')
  and not has_column_privilege('anon', 'public.occurrences', 'resolved_at', 'SELECT')
  and not has_column_privilege('authenticated', 'public.occurrences', 'resolved_at', 'SELECT'),
  'timestamps reserved for owner management are not directly selectable');
select ok(has_column_privilege('anon', 'public.occurrences', 'id', 'SELECT'),
  'public safe projection retains only explicitly granted base columns');
select ok(has_table_privilege('anon', 'public.public_occurrences', 'SELECT'),
  'anonymous public projection is granted');
select ok((select reloptions @> array['security_invoker=true', 'security_barrier=true']
  from pg_class where oid = 'public.public_occurrences'::regclass),
  'public view invokes as caller and is a security barrier');
select ok(not exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'public_occurrences'
    and column_name in ('reporter_id', 'pet_id')),
  'public projection schema excludes both private identifiers');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'public_occurrences'), 11,
  'public view exposes only the reviewed explicit projection');
select ok((select prosecdef from pg_proc where oid =
  'buscapet_private.my_occurrences()'::regprocedure),
  'owner list is implemented in the private schema as a guarded definer function');
select ok((select prosecdef from pg_proc where oid =
  'buscapet_private.my_occurrence(uuid)'::regprocedure),
  'owner detail is implemented in the private schema as a guarded definer function');
select ok(not (select prosecdef from pg_proc where oid =
  'public.my_occurrences()'::regprocedure),
  'owner list public wrapper remains security invoker');
select ok(not (select prosecdef from pg_proc where oid =
  'public.my_occurrence(uuid)'::regprocedure),
  'owner detail public wrapper remains security invoker');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid =
  'buscapet_private.my_occurrences()'::regprocedure),
  'owner list pins an empty search_path');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid =
  'buscapet_private.my_occurrence(uuid)'::regprocedure),
  'owner detail pins an empty search_path');
select ok(not has_function_privilege('public',
  'public.my_occurrences()', 'EXECUTE'),
  'PUBLIC cannot execute the owner list wrapper');
select ok(not has_function_privilege('anon',
  'public.my_occurrences()', 'EXECUTE'),
  'anon cannot execute the owner list wrapper');
select ok(has_function_privilege('authenticated',
  'public.my_occurrences()', 'EXECUTE'),
  'authenticated can execute the owner list wrapper');
select ok(not has_function_privilege('anon',
  'buscapet_private.my_occurrences()', 'EXECUTE'),
  'anon cannot execute the private owner list');
select ok(not has_function_privilege('public',
  'buscapet_private.my_occurrences()', 'EXECUTE'),
  'PUBLIC cannot execute the private owner list');
select ok(not has_function_privilege('anon',
  'buscapet_private.occurrence_is_owner(uuid)', 'EXECUTE'),
  'anon cannot execute the private ownership helper');
select ok(not has_function_privilege('public',
  'buscapet_private.occurrence_is_owner(uuid)', 'EXECUTE'),
  'PUBLIC cannot execute the private ownership helper');
select ok(has_function_privilege('anon',
  'public.occurrence_is_owner(uuid)', 'EXECUTE'),
  'anon can call only the safe public ownership boolean');
select ok(not has_function_privilege('public',
  'public.occurrence_is_owner(uuid)', 'EXECUTE'),
  'PUBLIC has no default execution grant on the public ownership wrapper');
select ok(not (select prosecdef from pg_proc where oid =
  'public.my_occurrence(uuid)'::regprocedure),
  'owner data wrapper does not run with definer rights');
select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid = 'public.occurrence_is_owner(uuid)'::regprocedure),
  'ownership boolean wrapper is definer with an empty search_path');
select ok(not has_function_privilege('public',
  'buscapet_private.can_report_sighting(uuid,uuid)', 'EXECUTE'),
  'PUBLIC cannot execute the internal sighting authorization helper');
select ok(not has_function_privilege('anon',
  'buscapet_private.can_report_sighting(uuid,uuid)', 'EXECUTE'),
  'anon cannot execute the internal sighting authorization helper');
select ok(has_function_privilege('authenticated',
  'buscapet_private.can_report_sighting(uuid,uuid)', 'EXECUTE'),
  'authenticated policy role can invoke the internal sighting authorization helper');
select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid =
    'buscapet_private.can_report_sighting(uuid,uuid)'::regprocedure),
  'sighting authorization helper is a definer with an empty search_path');

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select is((select count(*)::int from public.public_occurrences), 2,
  'anonymous feed exposes only currently public occurrences');
select ok((select not (to_jsonb(occurrence) ?| array['reporter_id', 'pet_id'])
  from public.public_occurrences occurrence
  where occurrence.id = '97500000-0000-0000-0000-000000000001'),
  'anonymous response JSON contains neither private identifier');
select throws_ok($$select reporter_id from public.occurrences
  where id = '97500000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anonymous direct reporter projection is denied');
select throws_ok($$select pet_id from public.occurrences
  where id = '97500000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anonymous direct pet projection is denied');
select throws_ok($$select id from public.occurrences
  where reporter_id = '97300000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anonymous filters cannot probe reporter_id');
select is(public.occurrence_is_owner('97500000-0000-0000-0000-000000000001'), false,
  'anonymous ownership indicator is false');
select throws_ok($$select * from public.my_occurrences()$$,
  '42501', null, 'anonymous caller cannot use owner-only read contract');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '97300000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::int from public.public_occurrences), 2,
  'authenticated feed retains only public rows');
select ok((select not (to_jsonb(occurrence) ?| array['reporter_id', 'pet_id'])
  from public.public_occurrences occurrence
  where occurrence.id = '97500000-0000-0000-0000-000000000001'),
  'authenticated public response JSON contains neither private identifier');
select throws_ok($$select reporter_id from public.occurrences
  where id = '97500000-0000-0000-0000-000000000001'$$,
  '42501', null, 'user B cannot project the tutor ID from A public occurrence');
select throws_ok($$select pet_id from public.occurrences
  where id = '97500000-0000-0000-0000-000000000001'$$,
  '42501', null, 'user B cannot project the pet ID from A public occurrence');
select throws_ok($$select id from public.occurrences
  where reporter_id = '97300000-0000-0000-0000-000000000001'$$,
  '42501', null, 'user B cannot filter on another account reporter_id');
select is(public.occurrence_is_owner('97500000-0000-0000-0000-000000000001'), false,
  'ownership indicator is false for another account');
select is(public.occurrence_is_owner('97500000-0000-0000-0000-000000000004'), true,
  'ownership indicator is true only for the current owner');
select is((select count(*)::int from public.my_occurrences()), 1,
  'user B lists only their own occurrences');
select is((select count(*)::int from public.my_occurrence(
  '97500000-0000-0000-0000-000000000002')),
  0, 'user B cannot read account A private occurrence through owner RPC');
select throws_ok($$insert into public.occurrences(reporter_id, type, city,
  region, last_seen_at, description) values
  ('97300000-0000-0000-0000-000000000001', 'lost', 'Cuiaba', 'Centro', now(),
  'Attempt to insert a row owned by another account.')$$,
  '42501', null, 'user B cannot spoof reporter_id on insert');
select lives_ok($$insert into public.occurrences(reporter_id, type, city,
  region, last_seen_at, description) values
  (auth.uid(), 'lost', 'Cuiaba', 'Centro', now(),
  'User B can create an occurrence owned by their own account.') returning id$$,
  'active user can create an owned row with a limited returning projection');
select throws_ok($$insert into public.occurrences(reporter_id, type, city,
  region, last_seen_at, description) values
  (auth.uid(), 'lost', 'Cuiaba', 'Centro', now(),
  'Wildcard returning must fail with restricted columns.') returning *$$,
  '42501', null, 'insert returning wildcard cannot expose private identifiers');
select lives_ok($$update public.occurrences set description =
  'Owner B update succeeds with a safe returning projection.'
  where id = '97500000-0000-0000-0000-000000000004' returning id$$,
  'owner update remains available with returning only the public id');
select lives_ok($$update public.occurrences set description =
  'This unauthorized change must not be applied.'
  where id = '97500000-0000-0000-0000-000000000002' returning id$$,
  'cross-account update is filtered by existing RLS');
select lives_ok($$delete from public.occurrences
  where id = '97500000-0000-0000-0000-000000000002' returning id$$,
  'cross-account delete is filtered by existing RLS');
select throws_ok($$select * from public.admin_list_occurrences()$$,
  '42501', null, 'ordinary user cannot access moderator occurrence RPC');
select throws_ok($$select * from public.admin_list_occurrence_reports()$$,
  '42501', null, 'ordinary user cannot access moderator report RPC');
select is((select report_status from public.report_occurrence(
  '97500000-0000-0000-0000-000000000001',
  'other', 'User B submits a report about account A public occurrence.')),
  'open', 'common authenticated account can report another users public occurrence');
select set_config('test.report_id', (select report_id::text
  from public.get_my_active_occurrence_report(
    '97500000-0000-0000-0000-000000000001')), true);
select ok(not exists (select 1 from jsonb_object_keys((
  select to_jsonb(report) from public.report_occurrence(
    '97500000-0000-0000-0000-000000000001', 'other',
    'Repeated report should not return owner identifiers.') report
)) as field(name) where name in ('reporter_id', 'pet_id')),
  'report RPC response omits both private occurrence identifiers');
reset role;

select is((select description from public.occurrences
  where id = '97500000-0000-0000-0000-000000000002'),
  'Synthetic private occurrence owned by account A.',
  'cross-account update and delete did not change account A private row');

set local role authenticated;
select set_config('request.jwt.claim.sub', '97300000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::int from public.my_occurrences()), 3,
  'owner A can list public, private, and under-review records they own');
select is((select pet_id from public.my_occurrence('97500000-0000-0000-0000-000000000002')),
  '97400000-0000-0000-0000-000000000001'::uuid,
  'owner contract returns the linked pet ID needed to manage their own occurrence');
select ok(not exists (select 1 from jsonb_object_keys((
  select to_jsonb(occurrence) from public.my_occurrence(
    '97500000-0000-0000-0000-000000000002') occurrence
)) as field(name) where name in ('reporter_id', 'owner_id', 'email')),
  'owner RPC returns no reporter identity or unrelated account data');
select is(public.occurrence_is_owner('97500000-0000-0000-0000-000000000001'), true,
  'owner A receives true for their public occurrence');
select is(public.occurrence_is_owner('97500000-0000-0000-0000-000000000002'), true,
  'owner A receives true for their private occurrence');
select lives_ok($$update public.occurrences set description =
  'Owner A update succeeds under the original RLS policy.'
  where id = '97500000-0000-0000-0000-000000000002' returning id$$,
  'owner update remains protected and functional after SELECT is narrowed');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '97300000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select occurrence_id from public.admin_list_occurrences()
  where occurrence_id = '97500000-0000-0000-0000-000000000001'),
  '97500000-0000-0000-0000-000000000001'::uuid,
  'active moderator retains authorized occurrence list');
select ok(not exists (select 1 from jsonb_object_keys((
  select to_jsonb(item) from public.admin_get_occurrence(
    '97500000-0000-0000-0000-000000000001') item
)) as field(name) where name in ('reporter_id', 'pet_id')),
  'admin occurrence response omits reporter and pet identifiers');
select is((select report_status from public.admin_list_occurrence_reports()
  where occurrence_id = '97500000-0000-0000-0000-000000000001'),
  'open', 'active moderator retains authorized report list');
select ok(not exists (select 1 from jsonb_object_keys((
  select to_jsonb(item) from public.admin_get_occurrence_report(
    current_setting('test.report_id')::uuid)
    item
)) as field(name) where name in ('reporter_id', 'pet_id', 'owner_id', 'email')),
  'admin report detail omits report submitter and occurrence owner identifiers');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '97300000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select * from public.my_occurrences()$$,
  '42501', null, 'suspended owner cannot use private owner list');
select is(public.occurrence_is_owner('97500000-0000-0000-0000-000000000005'), false,
  'suspended owner receives no owner privilege indicator');
select is((select count(*)::int from public.public_occurrences), 3,
  'suspension does not change the existing public-feed visibility rule');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '97300000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select * from public.admin_list_occurrences()$$,
  '42501', null, 'suspended moderator cannot access occurrence moderation RPC');
select throws_ok($$select * from public.admin_list_occurrence_reports()$$,
  '42501', null, 'suspended moderator cannot access report moderation RPC');
select throws_ok($$select * from public.my_occurrences()$$,
  '42501', null, 'suspended moderator cannot access owner data');
reset role;

select * from finish();
rollback;
