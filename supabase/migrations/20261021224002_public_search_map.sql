begin;

-- A public point is chosen independently from any device/private coordinate.
-- The center is snapped to 0.01 degrees and always shown as a broad area.
create table public.occurrence_public_locations (
  occurrence_id uuid primary key references public.occurrences(id) on delete cascade,
  approx_location extensions.geography(point, 4326) not null,
  radius_m integer not null default 900 check (radius_m between 800 and 10000),
  public_description text check (char_length(public_description) <= 200),
  consented_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint occurrence_location_is_approximate check (
    extensions.st_y(approx_location::extensions.geometry)::numeric =
      round(extensions.st_y(approx_location::extensions.geometry)::numeric, 2)
    and extensions.st_x(approx_location::extensions.geometry)::numeric =
      round(extensions.st_x(approx_location::extensions.geometry)::numeric, 2)
  )
);
create index occurrence_public_locations_geo_idx
  on public.occurrence_public_locations using gist (approx_location);
create trigger occurrence_public_locations_updated before update on public.occurrence_public_locations
  for each row execute function public.set_updated_at();
alter table public.occurrence_public_locations enable row level security;
revoke all on public.occurrence_public_locations from public, anon, authenticated;
grant select on public.occurrence_public_locations to anon, authenticated;
grant insert (occurrence_id, approx_location, radius_m, public_description, consented_at)
  on public.occurrence_public_locations to authenticated;
grant update (approx_location, radius_m, public_description, consented_at)
  on public.occurrence_public_locations to authenticated;
grant delete on public.occurrence_public_locations to authenticated;

create policy "public occurrence locations" on public.occurrence_public_locations
  for select to anon using (exists (
    select 1 from public.occurrences o where o.id = occurrence_id
      and o.type = 'lost' and o.visibility = 'public'
  ));
create policy "read own or public occurrence locations" on public.occurrence_public_locations
  for select to authenticated using (exists (
    select 1 from public.occurrences o where o.id = occurrence_id
      and ((o.type = 'lost' and o.visibility = 'public')
        or (o.reporter_id = (select auth.uid()) and buscapet_private.is_active(o.reporter_id)))
  ));
create policy "owner inserts occurrence location" on public.occurrence_public_locations
  for insert to authenticated with check (exists (
    select 1 from public.occurrences o where o.id = occurrence_id
      and o.type = 'lost' and o.reporter_id = (select auth.uid())
      and buscapet_private.is_active(o.reporter_id)
  ));
create policy "owner edits occurrence location" on public.occurrence_public_locations
  for update to authenticated using (exists (
    select 1 from public.occurrences o where o.id = occurrence_id
      and o.type = 'lost' and o.reporter_id = (select auth.uid())
      and buscapet_private.is_active(o.reporter_id)
  )) with check (exists (
    select 1 from public.occurrences o where o.id = occurrence_id
      and o.type = 'lost' and o.reporter_id = (select auth.uid())
      and buscapet_private.is_active(o.reporter_id)
  ));
create policy "owner removes occurrence location" on public.occurrence_public_locations
  for delete to authenticated using (exists (
    select 1 from public.occurrences o where o.id = occurrence_id
      and o.reporter_id = (select auth.uid()) and buscapet_private.is_active(o.reporter_id)
  ));

-- SECURITY INVOKER retains the table's public/owner RLS while returning a
-- small JSON-friendly representation for the edit form.
create function public.get_occurrence_public_location(p_occurrence uuid)
returns table (occurrence_id uuid, latitude double precision, longitude double precision,
  radius_m integer, public_description text)
language sql stable security invoker set search_path = '' as $$
  select l.occurrence_id,
    extensions.st_y(l.approx_location::extensions.geometry),
    extensions.st_x(l.approx_location::extensions.geometry),
    l.radius_m, l.public_description
  from public.occurrence_public_locations l where l.occurrence_id = p_occurrence;
$$;
revoke all on function public.get_occurrence_public_location(uuid) from public, anon, authenticated;
grant execute on function public.get_occurrence_public_location(uuid) to anon, authenticated;

-- Consent comes from the sighting author. The tutor separately approves display.
-- No value is copied from buscapet_private.sighting_locations.
create table public.sighting_public_locations (
  sighting_id uuid primary key references public.sightings(id) on delete cascade,
  approx_location extensions.geography(point, 4326) not null,
  radius_m integer not null default 900 check (radius_m between 800 and 10000),
  public_description text not null check (char_length(trim(public_description)) between 2 and 200),
  consented_at timestamptz not null,
  approved_by_tutor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sighting_location_is_approximate check (
    extensions.st_y(approx_location::extensions.geometry)::numeric =
      round(extensions.st_y(approx_location::extensions.geometry)::numeric, 2)
    and extensions.st_x(approx_location::extensions.geometry)::numeric =
      round(extensions.st_x(approx_location::extensions.geometry)::numeric, 2)
  )
);
create index sighting_public_locations_geo_idx
  on public.sighting_public_locations using gist (approx_location);
create trigger sighting_public_locations_updated before update on public.sighting_public_locations
  for each row execute function public.set_updated_at();
alter table public.sighting_public_locations enable row level security;
revoke all on public.sighting_public_locations from public, anon, authenticated;
grant select on public.sighting_public_locations to authenticated;
grant insert (sighting_id, approx_location, radius_m, public_description, consented_at)
  on public.sighting_public_locations to authenticated;
grant update (approved_by_tutor) on public.sighting_public_locations to authenticated;
grant delete on public.sighting_public_locations to authenticated;
create policy "sighting author and tutor read proposed location" on public.sighting_public_locations
  for select to authenticated using (exists (
    select 1 from public.sightings s join public.occurrences o on o.id = s.occurrence_id
    where s.id = sighting_id and buscapet_private.is_active((select auth.uid()))
      and (s.reporter_id = (select auth.uid()) or o.reporter_id = (select auth.uid()))
  ));
create policy "sighting author proposes approximate location" on public.sighting_public_locations
  for insert to authenticated with check (not approved_by_tutor and exists (
    select 1 from public.sightings s where s.id = sighting_id
      and s.reporter_id = (select auth.uid()) and s.status = 'pending'
      and buscapet_private.is_active(s.reporter_id)
  ));
create policy "tutor approves reviewed location" on public.sighting_public_locations
  for update to authenticated using (exists (
    select 1 from public.sightings s join public.occurrences o on o.id = s.occurrence_id
    where s.id = sighting_id and s.status = 'reviewed'
      and o.reporter_id = (select auth.uid()) and buscapet_private.is_active(o.reporter_id)
  )) with check (exists (
    select 1 from public.sightings s join public.occurrences o on o.id = s.occurrence_id
    where s.id = sighting_id and s.status = 'reviewed'
      and o.reporter_id = (select auth.uid()) and buscapet_private.is_active(o.reporter_id)
  ));
create policy "sighting author revokes proposed location" on public.sighting_public_locations
  for delete to authenticated using (exists (
    select 1 from public.sightings s where s.id = sighting_id
      and s.reporter_id = (select auth.uid()) and buscapet_private.is_active(s.reporter_id)
  ));

-- Commercial locations have their own consent and require an approved partner.
create table public.partner_public_locations (
  partner_id uuid primary key references public.partner_profiles(user_id) on delete cascade,
  commercial_location extensions.geography(point, 4326) not null,
  service_category text not null check (service_category in
    ('clinic', 'pet_shop', 'rescue_organization', 'other')),
  public_description text check (char_length(public_description) <= 200),
  consented_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partner_public_locations_geo_idx
  on public.partner_public_locations using gist (commercial_location);
create trigger partner_public_locations_updated before update on public.partner_public_locations
  for each row execute function public.set_updated_at();
alter table public.partner_public_locations enable row level security;
revoke all on public.partner_public_locations from public, anon, authenticated;
grant select on public.partner_public_locations to authenticated;
grant insert (partner_id, commercial_location, service_category, public_description, consented_at)
  on public.partner_public_locations to authenticated;
grant update (commercial_location, service_category, public_description, consented_at)
  on public.partner_public_locations to authenticated;
grant delete on public.partner_public_locations to authenticated;
create policy "own or approved commercial locations" on public.partner_public_locations
  for select to authenticated using (exists (
    select 1 from public.partner_profiles p where p.user_id = partner_id
      and (p.status = 'approved' or (p.user_id = (select auth.uid())
        and buscapet_private.is_active(p.user_id)))
  ));
create policy "approved partner writes commercial location" on public.partner_public_locations
  for insert to authenticated with check (partner_id = (select auth.uid())
    and buscapet_private.is_active(partner_id) and exists (
      select 1 from public.partner_profiles p where p.user_id = partner_id and p.status = 'approved'
    ));
create policy "approved partner edits commercial location" on public.partner_public_locations
  for update to authenticated using (partner_id = (select auth.uid())
    and buscapet_private.is_active(partner_id) and exists (
      select 1 from public.partner_profiles p where p.user_id = partner_id and p.status = 'approved'
    )) with check (partner_id = (select auth.uid())
    and buscapet_private.is_active(partner_id) and exists (
      select 1 from public.partner_profiles p where p.user_id = partner_id and p.status = 'approved'
    ));
create policy "partner removes commercial location" on public.partner_public_locations
  for delete to authenticated using (partner_id = (select auth.uid())
    and buscapet_private.is_active(partner_id));

-- SECURITY DEFINER is confined to a read-only, fixed-column public projection.
-- It is required because the existing sightings RLS intentionally never exposes
-- raw reports to visitors. Every join below checks visibility, review, consent,
-- tutor approval, and occurrence type before any coordinate leaves the database.
create function public.search_public_map_points(
  p_occurrence uuid default null, p_center_lat double precision default null,
  p_center_lon double precision default null, p_radius_m integer default null,
  p_city text default null, p_region text default null,
  p_status public.occurrence_status default null, p_since timestamptz default null,
  p_limit integer default 100)
returns table (
  id text, category text, occurrence_id uuid, latitude double precision,
  longitude double precision, radius_m integer, title text, city text,
  region text, description text, event_at timestamptz, occurrence_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit not between 1 and 200
     or (p_center_lat is null) <> (p_center_lon is null)
     or (p_center_lat is not null and (p_center_lat < -90 or p_center_lat > 90
       or p_center_lon < -180 or p_center_lon > 180
       or p_radius_m is null or p_radius_m not between 1000 and 500000))
     or (p_center_lat is null and p_radius_m is not null)
     or (p_city is not null and char_length(p_city) > 80)
     or (p_region is not null and char_length(p_region) > 100)
  then raise exception 'invalid map search' using errcode = '22023'; end if;

  return query
  with visible as (
    select ('occurrence:' || o.id::text) as marker_id, 'last-known'::text as marker_category,
      o.id as marker_occurrence, l.approx_location as marker_location,
      l.radius_m as marker_radius, 'Última região conhecida'::text as marker_title,
      o.city as marker_city, o.region as marker_region,
      l.public_description as marker_description,
      o.last_seen_at as marker_time, o.status::text as marker_status
    from public.occurrence_public_locations l
    join public.occurrences o on o.id = l.occurrence_id
    where o.type = 'lost' and o.visibility = 'public' and l.consented_at is not null
      and (p_occurrence is null or o.id = p_occurrence)
      and (p_city is null or o.city ilike p_city)
      and (p_region is null or o.region ilike '%' || p_region || '%')
      and (p_status is null or o.status = p_status)
      and (p_since is null or o.last_seen_at >= p_since)
      and (p_center_lat is null or extensions.st_dwithin(l.approx_location,
        extensions.st_setsrid(extensions.st_makepoint(p_center_lon, p_center_lat), 4326)::extensions.geography,
        p_radius_m + l.radius_m))
    union all
    select ('sighting:' || s.id::text), 'sighting'::text, o.id,
      l.approx_location, l.radius_m, 'Avistamento revisado'::text,
      o.city, o.region, l.public_description, s.observed_at, o.status::text
    from public.sighting_public_locations l
    join public.sightings s on s.id = l.sighting_id
    join public.occurrences o on o.id = s.occurrence_id
    where o.type = 'lost' and o.visibility = 'public'
      and s.status = 'reviewed' and l.approved_by_tutor and l.consented_at is not null
      and (p_occurrence is null or o.id = p_occurrence)
      and (p_city is null or o.city ilike p_city)
      and (p_region is null or o.region ilike '%' || p_region || '%')
      and (p_status is null or o.status = p_status)
      and (p_since is null or s.observed_at >= p_since)
      and (p_center_lat is null or extensions.st_dwithin(l.approx_location,
        extensions.st_setsrid(extensions.st_makepoint(p_center_lon, p_center_lat), 4326)::extensions.geography,
        p_radius_m + l.radius_m))
    union all
    select ('partner:' || p.user_id::text), 'partner'::text, null::uuid,
      l.commercial_location, 0, p.public_name, p.city,
      coalesce(p.region, p.city), l.public_description, p.updated_at, 'approved'::text
    from public.partner_public_locations l
    join public.partner_profiles p on p.user_id = l.partner_id
    where p.status = 'approved' and l.consented_at is not null
      and p_occurrence is null and p_status is null and p_since is null
      and (p_city is null or p.city ilike p_city)
      and (p_region is null or p.region ilike '%' || p_region || '%')
      and (p_center_lat is null or extensions.st_dwithin(l.commercial_location,
        extensions.st_setsrid(extensions.st_makepoint(p_center_lon, p_center_lat), 4326)::extensions.geography,
        p_radius_m))
  )
  select v.marker_id, v.marker_category, v.marker_occurrence,
    extensions.st_y(v.marker_location::extensions.geometry),
    extensions.st_x(v.marker_location::extensions.geometry),
    v.marker_radius, v.marker_title, v.marker_city, v.marker_region,
    v.marker_description, v.marker_time, v.marker_status
  from visible v order by v.marker_time desc, v.marker_id limit p_limit;
end;
$$;
revoke all on function public.search_public_map_points(uuid, double precision, double precision,
  integer, text, text, public.occurrence_status, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.search_public_map_points(uuid, double precision, double precision,
  integer, text, text, public.occurrence_status, timestamptz, integer)
  to anon, authenticated;

commit;
