begin;

-- Administrative directory data is assembled in a private function because
-- e-mail addresses live in auth.users, which is never exposed to the client.
-- The checks are intentionally repeated in every privileged function: an
-- authenticated Postgres role alone must not become administrative access.
create or replace function buscapet_private.admin_list_users(
  p_query text default null,
  p_status text default null,
  p_role text default null,
  p_order text default 'newest',
  p_page integer default 1,
  p_page_size integer default 20
)
returns table(
  account_id uuid,
  display_name text,
  email text,
  roles text[],
  status text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_role_text text := lower(btrim(coalesce(p_role, '')));
  v_order text := lower(btrim(coalesce(p_order, 'newest')));
  v_role public.app_role;
  v_pattern text;
  v_offset integer;
begin
  if auth.uid() is null
     or not buscapet_private.has_role(auth.uid(), 'administrador'::public.app_role) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if char_length(v_query) > 120 then
    raise exception 'search query is too long' using errcode = '22023';
  end if;
  if v_status not in ('', 'all', 'active', 'suspended') then
    raise exception 'invalid account status filter' using errcode = '22023';
  end if;
  if v_role_text not in ('', 'all', 'tutor', 'colaborador', 'parceiro', 'moderador', 'administrador') then
    raise exception 'invalid role filter' using errcode = '22023';
  end if;
  if v_order not in ('newest', 'oldest', 'name') then
    raise exception 'invalid sort order' using errcode = '22023';
  end if;
  if p_page is null or p_page < 1 or p_page > 100000
     or p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'invalid pagination' using errcode = '22023';
  end if;

  if v_role_text not in ('', 'all') then
    v_role := v_role_text::public.app_role;
  end if;
  -- Quote wildcard and escape characters so the search remains literal.
  v_pattern := '%' || replace(replace(replace(lower(v_query), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  v_offset := (p_page - 1) * p_page_size;

  return query
  with filtered as (
    select
      p.id as account_id,
      p.full_name as display_name,
      u.email::text as email,
      coalesce(array_remove(array_agg(ur.role::text order by ur.role::text), null), array[]::text[]) as roles,
      p.status::text as status,
      p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_roles ur on ur.user_id = p.id
    where (v_status in ('', 'all') or p.status::text = v_status)
      and (v_role is null or exists (
        select 1 from public.user_roles role_filter
        where role_filter.user_id = p.id and role_filter.role = v_role
      ))
      and (v_query = ''
        or lower(p.full_name) like v_pattern escape chr(92)
        or lower(coalesce(u.email, '')) like v_pattern escape chr(92)
        or p.id::text = v_query)
    group by p.id, p.full_name, u.email, p.status, p.created_at
  ), numbered as (
    select filtered.*, count(*) over() as total_count
    from filtered
  )
  select
    numbered.account_id,
    numbered.display_name,
    numbered.email,
    numbered.roles,
    numbered.status,
    numbered.created_at,
    numbered.total_count
  from numbered
  order by
    case when v_order = 'newest' then numbered.created_at end desc nulls last,
    case when v_order = 'oldest' then numbered.created_at end asc nulls last,
    case when v_order = 'name' then lower(numbered.display_name) end asc nulls last,
    numbered.account_id asc
  limit p_page_size offset v_offset;
end;
$$;

create or replace function buscapet_private.admin_get_user(p_user uuid)
returns table(
  account_id uuid,
  display_name text,
  email text,
  roles text[],
  status text,
  active_role text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null
     or not buscapet_private.has_role(auth.uid(), 'administrador'::public.app_role) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    u.email::text,
    coalesce(array_remove(array_agg(ur.role::text order by ur.role::text), null), array[]::text[]),
    p.status::text,
    p.active_role::text,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_roles ur on ur.user_id = p.id
  where p.id = p_user
  group by p.id, p.full_name, u.email, p.status, p.active_role, p.created_at;
end;
$$;

create or replace function public.admin_list_users(
  p_query text default null,
  p_status text default null,
  p_role text default null,
  p_order text default 'newest',
  p_page integer default 1,
  p_page_size integer default 20
)
returns table(
  account_id uuid,
  display_name text,
  email text,
  roles text[],
  status text,
  created_at timestamptz,
  total_count bigint
)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_list_users(
    p_query, p_status, p_role, p_order, p_page, p_page_size
  );
$$;

create or replace function public.admin_get_user(p_user uuid)
returns table(
  account_id uuid,
  display_name text,
  email text,
  roles text[],
  status text,
  active_role text,
  created_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_get_user(p_user);
$$;

revoke all on function buscapet_private.admin_list_users(text, text, text, text, integer, integer),
  buscapet_private.admin_get_user(uuid) from public, anon, authenticated;
grant execute on function buscapet_private.admin_list_users(text, text, text, text, integer, integer),
  buscapet_private.admin_get_user(uuid) to authenticated;

revoke all on function public.admin_list_users(text, text, text, text, integer, integer),
  public.admin_get_user(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, text, text, text, integer, integer),
  public.admin_get_user(uuid) to authenticated;

commit;
