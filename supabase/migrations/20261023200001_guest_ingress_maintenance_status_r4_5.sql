begin;

-- Read-only preflight for the signed guest ingress. This is intentionally
-- callable only with a server-side service key; it does not expose the state
-- table, its reason, or operator metadata through the Data API.
create function public.guest_ingress_writes_open()
returns boolean
language sql volatile security definer set search_path = ''
as $$
  select buscapet_private.maintenance_writes_open();
$$;
revoke all on function public.guest_ingress_writes_open()
  from public, anon, authenticated, service_role;
grant execute on function public.guest_ingress_writes_open()
  to service_role;

commit;
