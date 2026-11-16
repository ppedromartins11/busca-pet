begin;

-- R4.4 is deliberately ordered after the last deployed migration and before
-- R4.1. The gate starts open; an operator must activate it separately.
create table buscapet_private.maintenance_state (
  singleton boolean primary key default true check (singleton),
  active boolean not null default false,
  generation bigint not null default 0 check (generation >= 0),
  reason text not null default 'installed',
  changed_at timestamptz not null default pg_catalog.now()
);
insert into buscapet_private.maintenance_state(singleton, active)
values (true, false);

create table buscapet_private.maintenance_transitions (
  generation bigint primary key,
  active boolean not null,
  reason text not null,
  operator_role text not null,
  changed_at timestamptz not null
);

alter table buscapet_private.maintenance_state enable row level security;
alter table buscapet_private.maintenance_transitions enable row level security;
revoke all on buscapet_private.maintenance_state,
  buscapet_private.maintenance_transitions from public, anon, authenticated, service_role;

-- A shared row lock is held until the writer commits. Activation needs an
-- UPDATE lock on the same row and therefore drains database writes that have
-- already entered the gate before it can commit.
create function buscapet_private.maintenance_writes_open()
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_active boolean;
begin
  select state.active into v_active
  from buscapet_private.maintenance_state state
  where state.singleton = true
  for share;
  if not found then
    raise exception 'BUSCAPET_MAINTENANCE_STATE_MISSING' using errcode = 'PT503';
  end if;
  return not v_active;
end;
$$;
revoke all on function buscapet_private.maintenance_writes_open()
  from public, anon, authenticated, service_role;
grant execute on function buscapet_private.maintenance_writes_open()
  to authenticated;

create function buscapet_private.maintenance_reject_write()
returns trigger
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not buscapet_private.maintenance_writes_open() then
    raise exception 'BUSCAPET_MAINTENANCE_ACTIVE' using errcode = 'PT503';
  end if;
  return null;
end;
$$;
revoke all on function buscapet_private.maintenance_reject_write()
  from public, anon, authenticated, service_role;

-- Explicit application-table inventory. Statement triggers catch even an
-- UPDATE/DELETE that matches no rows. No triggers are added to managed Auth or
-- Storage schemas.
do $$
declare target text;
begin
  foreach target in array array[
    'public.profiles',
    'public.user_roles',
    'public.partner_profiles',
    'public.pets',
    'public.occurrences',
    'public.occurrence_participants',
    'public.sightings',
    'public.occurrence_photos',
    'public.pet_photos',
    'public.occurrence_public_locations',
    'public.sighting_public_locations',
    'public.partner_public_locations',
    'buscapet_private.sighting_locations',
    'buscapet_private.guest_sighting_limits',
    'buscapet_private.guest_sighting_nonces',
    'buscapet_private.admin_audit',
    'buscapet_private.occurrence_reports',
    'buscapet_private.occurrence_report_history'
  ] loop
    if pg_catalog.to_regclass(target) is null then
      raise exception 'maintenance target missing: %', target;
    end if;
    execute pg_catalog.format(
      'create trigger buscapet_maintenance_write before insert or update or delete or truncate on %s for each statement execute function buscapet_private.maintenance_reject_write()',
      target
    );
  end loop;
end;
$$;

-- Storage's normal signed-in API requests use authenticated RLS. Restrictive
-- policies add to, rather than replace, the existing owner policies. Service
-- keys bypass RLS and require an ingress pause and object reconciliation.
create policy "buscapet maintenance blocks object insert"
on storage.objects as restrictive for insert to authenticated
with check (buscapet_private.maintenance_writes_open());
create policy "buscapet maintenance blocks object update"
on storage.objects as restrictive for update to authenticated
using (buscapet_private.maintenance_writes_open())
with check (buscapet_private.maintenance_writes_open());
create policy "buscapet maintenance blocks object delete"
on storage.objects as restrictive for delete to authenticated
using (buscapet_private.maintenance_writes_open());

-- Audit every ordinary state transition, including a direct operator UPDATE.
-- An invalid generation or unchanged state aborts the transition atomically.
create function buscapet_private.maintenance_audit_transition()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.generation <> old.generation + 1
     or new.active is not distinct from old.active
     or pg_catalog.char_length(pg_catalog.btrim(new.reason)) not between 10 and 500
  then
    raise exception 'invalid maintenance transition' using errcode = '22023';
  end if;
  insert into buscapet_private.maintenance_transitions(
    generation, active, reason, operator_role, changed_at
  ) values (
    new.generation, new.active, new.reason, session_user, new.changed_at
  );
  return new;
end;
$$;
revoke all on function buscapet_private.maintenance_audit_transition()
  from public, anon, authenticated, service_role;
create trigger maintenance_audit_transition
after update on buscapet_private.maintenance_state
for each row execute function buscapet_private.maintenance_audit_transition();

-- Only the database owner/operator may invoke this private, invoker-rights
-- routine. The expected generation prevents stale operators reopening writes.
create function buscapet_private.set_maintenance(
  p_active boolean, p_reason text, p_expected_generation bigint
)
returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  v_generation bigint;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_changed_at timestamptz := pg_catalog.clock_timestamp();
begin
  if p_active is null or p_expected_generation is null
     or pg_catalog.char_length(v_reason) not between 10 and 500 then
    raise exception 'invalid maintenance transition' using errcode = '22023';
  end if;

  update buscapet_private.maintenance_state state
  set active = p_active,
      generation = state.generation + 1,
      reason = v_reason,
      changed_at = v_changed_at
  where state.singleton = true
    and state.generation = p_expected_generation
    and state.active is distinct from p_active
  returning state.generation into v_generation;
  if not found then
    raise exception 'maintenance transition conflict' using errcode = '40001';
  end if;

  return v_generation;
end;
$$;
revoke all on function buscapet_private.set_maintenance(boolean, text, bigint)
  from public, anon, authenticated, service_role;

commit;
