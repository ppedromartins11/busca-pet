begin;

-- Public API: only fields required to render public occurrence cards/details.
-- The view remains subject to the caller's grants and the existing RLS policy.
create view public.public_occurrences
with (security_invoker = true, security_barrier = true)
as
select occurrence.id,
  occurrence.type,
  occurrence.status,
  occurrence.visibility,
  occurrence.city,
  occurrence.region,
  occurrence.public_reference,
  occurrence.last_seen_at,
  occurrence.description,
  occurrence.reward_cents,
  occurrence.created_at
from public.occurrences as occurrence
where occurrence.visibility = 'public'::public.occurrence_visibility;

revoke all on public.public_occurrences from public, anon, authenticated;
grant select on public.public_occurrences to anon, authenticated;

-- A table-level SELECT grant overrides a column-level restriction, so remove
-- the broad grants and explicitly deny the sensitive identifiers as well.
revoke select on table public.occurrences from public, anon, authenticated;
revoke select (reporter_id, pet_id) on table public.occurrences
  from public, anon, authenticated;

grant select (id, type, status, visibility, city, region, public_reference,
  last_seen_at, description, reward_cents, created_at)
  on table public.occurrences to anon, authenticated;

create function buscapet_private.my_occurrences()
returns table(
  id uuid,
  pet_id uuid,
  type public.occurrence_type,
  status public.occurrence_status,
  visibility public.occurrence_visibility,
  city text,
  region text,
  public_reference text,
  last_seen_at timestamptz,
  description text,
  reward_cents integer,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not buscapet_private.is_active(v_actor) then
    raise exception 'active authenticated account required' using errcode = '42501';
  end if;

  return query
  select occurrence.id, occurrence.pet_id, occurrence.type,
    occurrence.status, occurrence.visibility, occurrence.city,
    occurrence.region, occurrence.public_reference, occurrence.last_seen_at,
    occurrence.description, occurrence.reward_cents, occurrence.created_at,
    occurrence.updated_at, occurrence.resolved_at
  from public.occurrences as occurrence
  where occurrence.reporter_id = v_actor
  order by occurrence.created_at desc, occurrence.id;
end;
$$;

create function buscapet_private.my_occurrence(p_occurrence uuid)
returns table(
  id uuid,
  pet_id uuid,
  type public.occurrence_type,
  status public.occurrence_status,
  visibility public.occurrence_visibility,
  city text,
  region text,
  public_reference text,
  last_seen_at timestamptz,
  description text,
  reward_cents integer,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not buscapet_private.is_active(v_actor) then
    raise exception 'active authenticated account required' using errcode = '42501';
  end if;
  if p_occurrence is null then
    raise exception 'occurrence is required' using errcode = '22023';
  end if;

  return query
  select occurrence.id, occurrence.pet_id, occurrence.type,
    occurrence.status, occurrence.visibility, occurrence.city,
    occurrence.region, occurrence.public_reference, occurrence.last_seen_at,
    occurrence.description, occurrence.reward_cents, occurrence.created_at,
    occurrence.updated_at, occurrence.resolved_at
  from public.occurrences as occurrence
  where occurrence.id = p_occurrence
    and occurrence.reporter_id = v_actor;
end;
$$;

-- The private helper returns a single ownership bit, never the owner ID.
create function buscapet_private.occurrence_is_owner(p_occurrence uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null
    and buscapet_private.is_active(auth.uid())
    and exists (
      select 1
      from public.occurrences as occurrence
      where occurrence.id = p_occurrence
        and occurrence.reporter_id = auth.uid()
    );
$$;

-- This public wrapper is intentionally SECURITY DEFINER only so it can call
-- the non-exposed private helper without granting anon access to that schema.
-- It exposes one boolean, and the helper returns true only for the caller's
-- own active account. No occurrence identifiers or owner attributes escape.
create function public.occurrence_is_owner(p_occurrence uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select buscapet_private.occurrence_is_owner(p_occurrence);
$$;

create function public.my_occurrences()
returns table(
  id uuid,
  pet_id uuid,
  type public.occurrence_type,
  status public.occurrence_status,
  visibility public.occurrence_visibility,
  city text,
  region text,
  public_reference text,
  last_seen_at timestamptz,
  description text,
  reward_cents integer,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.my_occurrences();
$$;

create function public.my_occurrence(p_occurrence uuid)
returns table(
  id uuid,
  pet_id uuid,
  type public.occurrence_type,
  status public.occurrence_status,
  visibility public.occurrence_visibility,
  city text,
  region text,
  public_reference text,
  last_seen_at timestamptz,
  description text,
  reward_cents integer,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.my_occurrence(p_occurrence);
$$;

revoke all on function buscapet_private.my_occurrences(),
  buscapet_private.my_occurrence(uuid),
  buscapet_private.occurrence_is_owner(uuid)
  from public, anon, authenticated;
grant execute on function buscapet_private.my_occurrences(),
  buscapet_private.my_occurrence(uuid) to authenticated;

revoke all on function public.my_occurrences(),
  public.my_occurrence(uuid),
  public.occurrence_is_owner(uuid)
  from public, anon, authenticated;
grant execute on function public.my_occurrences(),
  public.my_occurrence(uuid) to authenticated;
grant execute on function public.occurrence_is_owner(uuid)
  to anon, authenticated;

comment on view public.public_occurrences is
  'Public, explicit allowlist of occurrence fields; omits reporter_id and pet_id.';
comment on function public.my_occurrences() is
  'Returns only active caller-owned occurrences; never returns reporter_id.';
comment on function public.my_occurrence(uuid) is
  'Returns one occurrence only when owned by the active caller; never returns reporter_id.';
comment on function public.occurrence_is_owner(uuid) is
  'Returns only whether the active caller owns the requested occurrence; never returns owner identity.';

commit;
