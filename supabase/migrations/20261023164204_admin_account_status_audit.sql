begin;

-- Status changes are administrative events.  The audit table stays in the
-- private schema, receives no client table privileges, and is only exposed
-- through the constrained read RPC below.
alter table buscapet_private.admin_audit
  add column if not exists reason text;
alter table buscapet_private.admin_audit enable row level security;
revoke all on table buscapet_private.admin_audit from public, anon, authenticated;
create index if not exists admin_audit_target_created_at_idx
  on buscapet_private.admin_audit (target_id, created_at desc, id desc);

-- The earlier generic endpoint allowed a status change without a mandatory
-- suspension reason and without protection for the last active administrator.
-- Retain it only as an inert compatibility object: clients can no longer call
-- either its public wrapper or private implementation.
revoke all on function public.set_account_status(uuid, public.account_status)
  from public, anon, authenticated;
revoke all on function buscapet_private.set_account_status(uuid, public.account_status)
  from public, anon, authenticated;

create or replace function buscapet_private.admin_change_account_status(
  p_user uuid,
  p_status public.account_status,
  p_reason text default null
)
returns table(
  target_id uuid,
  account_status text,
  action text,
  changed_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_current_status public.account_status;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_action text;
  v_changed_at timestamptz;
begin
  -- Serialize every status transition.  In addition to the target row lock,
  -- this protects the active-administrator count against simultaneous changes
  -- to different accounts.
  perform pg_catalog.pg_advisory_xact_lock(880042211);

  if v_actor is null
     or not buscapet_private.has_role(v_actor, 'administrador'::public.app_role) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_user is null or p_status is null then
    raise exception 'account and status are required' using errcode = '22023';
  end if;
  if p_user = v_actor then
    raise exception 'an administrator cannot change their own account status' using errcode = '42501';
  end if;

  select p.status into v_current_status
  from public.profiles p
  where p.id = p_user
  for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if v_current_status = p_status then
    raise exception 'account already has the requested status' using errcode = '22023';
  end if;

  if p_status = 'suspended'::public.account_status then
    if v_reason is null or char_length(v_reason) not between 10 and 500 then
      raise exception 'suspension reason must contain between 10 and 500 characters'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.user_roles target_role
      where target_role.user_id = p_user
        and target_role.role = 'administrador'::public.app_role
    ) and (
      select count(*)
      from public.profiles administrator_profile
      join public.user_roles administrator_role
        on administrator_role.user_id = administrator_profile.id
       and administrator_role.role = 'administrador'::public.app_role
      where administrator_profile.status = 'active'::public.account_status
    ) <= 1 then
      raise exception 'the last active administrator cannot be suspended' using errcode = '42501';
    end if;
    v_action := 'account_suspended';
  elsif p_status = 'active'::public.account_status then
    if v_reason is not null and char_length(v_reason) > 500 then
      raise exception 'reason must contain at most 500 characters' using errcode = '22023';
    end if;
    v_action := 'account_reactivated';
  else
    raise exception 'unsupported account status' using errcode = '22023';
  end if;

  update public.profiles
  set status = p_status
  where id = p_user;

  insert into buscapet_private.admin_audit(actor_id, target_id, action, reason)
  values (v_actor, p_user, v_action, v_reason)
  returning created_at into v_changed_at;

  return query
  select p_user, p_status::text, v_action, v_changed_at;
end;
$$;

create or replace function buscapet_private.admin_list_account_status_audit(
  p_user uuid,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table(
  actor_name text,
  action text,
  reason text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_offset integer;
begin
  if auth.uid() is null
     or not buscapet_private.has_role(auth.uid(), 'administrador'::public.app_role) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_user is null or p_page is null or p_page < 1 or p_page > 100000
     or p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'invalid audit pagination' using errcode = '22023';
  end if;
  v_offset := (p_page - 1) * p_page_size;

  return query
  with history as (
    select
      audit.id,
      coalesce(actor.full_name, 'Administrador indisponível') as actor_name,
      audit.action,
      audit.reason,
      audit.created_at
    from buscapet_private.admin_audit audit
    left join public.profiles actor on actor.id = audit.actor_id
    where audit.target_id = p_user
      and audit.action in ('account_suspended', 'account_reactivated')
  ), numbered as (
    select history.*, count(*) over() as total_count
    from history
  )
  select numbered.actor_name, numbered.action, numbered.reason,
    numbered.created_at, numbered.total_count
  from numbered
  order by numbered.created_at desc, numbered.id desc
  limit p_page_size offset v_offset;
end;
$$;

create or replace function public.admin_change_account_status(
  p_user uuid,
  p_status public.account_status,
  p_reason text default null
)
returns table(
  target_id uuid,
  account_status text,
  action text,
  changed_at timestamptz
)
language sql security invoker set search_path = '' as $$
  select * from buscapet_private.admin_change_account_status(p_user, p_status, p_reason);
$$;

create or replace function public.admin_list_account_status_audit(
  p_user uuid,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table(
  actor_name text,
  action text,
  reason text,
  created_at timestamptz,
  total_count bigint
)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_list_account_status_audit(p_user, p_page, p_page_size);
$$;

revoke all on function buscapet_private.admin_change_account_status(uuid, public.account_status, text),
  buscapet_private.admin_list_account_status_audit(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function buscapet_private.admin_change_account_status(uuid, public.account_status, text),
  buscapet_private.admin_list_account_status_audit(uuid, integer, integer)
  to authenticated;

revoke all on function public.admin_change_account_status(uuid, public.account_status, text),
  public.admin_list_account_status_audit(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_change_account_status(uuid, public.account_status, text),
  public.admin_list_account_status_audit(uuid, integer, integer)
  to authenticated;

commit;
