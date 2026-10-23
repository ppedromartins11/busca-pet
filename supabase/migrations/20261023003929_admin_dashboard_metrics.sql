begin;

-- The administrative dashboard consumes one aggregate row only. Individual
-- records remain protected by their existing RLS policies.
create function buscapet_private.admin_dashboard_metrics()
returns table(
  total_accounts bigint,
  active_accounts bigint,
  suspended_accounts bigint,
  total_pets bigint,
  total_occurrences bigint,
  active_occurrences bigint,
  lost_occurrences bigint,
  found_occurrences bigint,
  resolved_occurrences bigint,
  reunited_occurrences bigint,
  total_sightings bigint,
  pending_sightings bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not buscapet_private.has_role(auth.uid(), 'administrador'::public.app_role) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where status = 'active'),
    (select count(*) from public.profiles where status = 'suspended'),
    (select count(*) from public.pets),
    (select count(*) from public.occurrences),
    (select count(*) from public.occurrences where status = 'active'),
    (select count(*) from public.occurrences where type = 'lost'),
    (select count(*) from public.occurrences where type = 'found'),
    (select count(*) from public.occurrences where status in ('located', 'reunited', 'closed')),
    (select count(*) from public.occurrences where status = 'reunited'),
    (select count(*) from public.sightings),
    (select count(*) from public.sightings where status = 'pending');
end;
$$;

create function public.admin_dashboard_metrics()
returns table(
  total_accounts bigint,
  active_accounts bigint,
  suspended_accounts bigint,
  total_pets bigint,
  total_occurrences bigint,
  active_occurrences bigint,
  lost_occurrences bigint,
  found_occurrences bigint,
  resolved_occurrences bigint,
  reunited_occurrences bigint,
  total_sightings bigint,
  pending_sightings bigint
)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_dashboard_metrics();
$$;

revoke all on function buscapet_private.admin_dashboard_metrics() from public, anon, authenticated;
grant execute on function buscapet_private.admin_dashboard_metrics() to authenticated;
revoke all on function public.admin_dashboard_metrics() from public, anon, authenticated;
grant execute on function public.admin_dashboard_metrics() to authenticated;

commit;
