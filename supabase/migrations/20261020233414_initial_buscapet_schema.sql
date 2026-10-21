begin;

create schema if not exists buscapet_private;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

create type public.app_role as enum (
  'tutor',
  'colaborador',
  'parceiro',
  'moderador',
  'administrador'
);

create type public.account_status as enum ('active', 'suspended');
create type public.occurrence_type as enum ('lost', 'found');
create type public.occurrence_status as enum ('active', 'located', 'reunited', 'closed');
create type public.occurrence_visibility as enum ('public', 'private', 'under_review');
create type public.participant_status as enum ('requested', 'accepted', 'removed');
create type public.sighting_status as enum ('pending', 'reviewed', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 80),
  active_role public.app_role not null default 'tutor',
  status public.account_status not null default 'active',
  accepted_terms_at timestamptz,
  accepted_privacy_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.partner_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_type text not null check (char_length(trim(organization_type)) between 2 and 80),
  public_name text not null check (char_length(trim(public_name)) between 2 and 100),
  city text not null check (char_length(trim(city)) between 2 and 80),
  region text,
  responsible_name text not null check (char_length(trim(responsible_name)) between 2 and 80),
  cnpj text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  species text not null check (species in ('dog', 'cat', 'other')),
  breed text,
  sex text check (sex in ('female', 'male', 'unknown')),
  size text check (size in ('small', 'medium', 'large', 'unknown')),
  coat_description text,
  distinctive_features text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pets_id_owner_id_idx on public.pets(id, owner_id);

create table public.occurrences (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid references public.pets(id) on delete set null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  type public.occurrence_type not null,
  status public.occurrence_status not null default 'active',
  visibility public.occurrence_visibility not null default 'public',
  city text not null check (char_length(trim(city)) between 2 and 80),
  region text not null check (char_length(trim(region)) between 2 and 100),
  public_reference text,
  last_seen_at timestamptz not null,
  description text not null check (char_length(trim(description)) between 10 and 2000),
  reward_cents integer not null default 0 check (reward_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.occurrence_participants (
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.participant_status not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (occurrence_id, user_id)
);

create table public.sightings (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  -- NULL is reserved for the verified guest endpoint; anon has no table INSERT.
  reporter_id uuid references public.profiles(id) on delete set null,
  observed_at timestamptz not null,
  area_description text not null check (char_length(trim(area_description)) between 2 and 200),
  direction text,
  behavior text,
  description text not null check (char_length(trim(description)) between 5 and 2000),
  status public.sighting_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exact coordinates never appear in the Data API's public schema.
create table buscapet_private.sighting_locations (
  sighting_id uuid primary key references public.sightings(id) on delete cascade,
  exact_location extensions.geography(point, 4326) not null
);

create table buscapet_private.guest_sighting_limits (
  source_hash text not null,
  window_start timestamptz not null,
  submissions integer not null check (submissions between 1 and 5),
  primary key (source_hash, window_start)
);

-- A signed ingress request can be consumed only once, even across Edge isolates.
create table buscapet_private.guest_sighting_nonces (
  nonce uuid primary key,
  created_at timestamptz not null default now()
);

create table buscapet_private.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_id uuid,
  occurrence_id uuid,
  action text not null,
  created_at timestamptz not null default now()
);

create table public.occurrence_photos (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid references public.occurrences(id) on delete cascade,
  sighting_id uuid references public.sightings(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  created_at timestamptz not null default now(),
  check (
    (occurrence_id is not null and sighting_id is null)
    or (occurrence_id is null and sighting_id is not null)
  )
);

create index pets_owner_id_idx on public.pets(owner_id);
create index occurrences_reporter_id_idx on public.occurrences(reporter_id);
create index occurrences_public_feed_idx on public.occurrences(status, visibility, created_at desc);
create index occurrence_participants_user_id_idx on public.occurrence_participants(user_id);
create index sightings_occurrence_observed_at_idx on public.sightings(occurrence_id, observed_at desc);
create index occurrence_photos_occurrence_id_idx on public.occurrence_photos(occurrence_id);
create index occurrence_photos_sighting_id_idx on public.occurrence_photos(sighting_id);
create index sightings_exact_location_idx on buscapet_private.sighting_locations using gist(exact_location);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger partner_profiles_set_updated_at before update on public.partner_profiles
for each row execute function public.set_updated_at();
create trigger pets_set_updated_at before update on public.pets
for each row execute function public.set_updated_at();
create trigger occurrences_set_updated_at before update on public.occurrences
for each row execute function public.set_updated_at();
create trigger occurrence_participants_set_updated_at before update on public.occurrence_participants
for each row execute function public.set_updated_at();
create trigger sightings_set_updated_at before update on public.sightings
for each row execute function public.set_updated_at();

-- Trigger controlado pelo banco: metadados servem somente para nome exibido,
-- nunca para decidir papéis ou permissões.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Pessoa usuária'))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'tutor')
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.partner_profiles enable row level security;
alter table public.pets enable row level security;
alter table public.occurrences enable row level security;
alter table public.occurrence_participants enable row level security;
alter table public.sightings enable row level security;
alter table public.occurrence_photos enable row level security;

grant usage on schema public to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pet-media',
  'pet-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter function public.handle_new_user() set schema buscapet_private;
revoke all on function buscapet_private.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

create function buscapet_private.is_active(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = p_user and status = 'active');
$$;

create function buscapet_private.has_role(p_user uuid, p_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select buscapet_private.is_active(p_user) and exists (
    select 1 from public.user_roles where user_id = p_user and role = p_role
  );
$$;

create function buscapet_private.can_read_occurrence(p_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.occurrences o where o.id = p_id and (
    o.visibility = 'public'
    or (buscapet_private.is_active(p_user) and (
      o.reporter_id = p_user or exists (
        select 1 from public.occurrence_participants p
        where p.occurrence_id = o.id and p.user_id = p_user and p.status = 'accepted'
      )
    ))
  ));
$$;

create function buscapet_private.can_read_sighting(p_id uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select buscapet_private.is_active(p_user) and exists (
    select 1 from public.sightings s join public.occurrences o on o.id = s.occurrence_id
    where s.id = p_id and (s.reporter_id = p_user or o.reporter_id = p_user
      or exists (select 1 from public.occurrence_participants p
                 where p.occurrence_id = o.id and p.user_id = p_user
                   and p.status = 'accepted'))
  );
$$;

create function buscapet_private.can_attach_photo(p_occurrence uuid, p_sighting uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select buscapet_private.is_active(p_user) and (
    (p_occurrence is not null and exists (
      select 1 from public.occurrences o where o.id = p_occurrence and o.reporter_id = p_user
    )) or (p_sighting is not null and exists (
      select 1 from public.sightings s join public.occurrences o on o.id = s.occurrence_id
      where s.id = p_sighting and (s.reporter_id = p_user or o.reporter_id = p_user)
    ))
  );
$$;

create function buscapet_private.matches_owned_file(
  p_path text, p_user uuid, p_mime text, p_size integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from storage.objects obj where obj.bucket_id = 'pet-media'
    and obj.name = p_path and obj.owner_id = p_user::text
    and obj.metadata ->> 'mimetype' = p_mime
    and (obj.metadata ->> 'size')::bigint = p_size);
$$;

-- A simple FK keeps ON DELETE SET NULL; this lock and ownership check prevent
-- attaching another tutor's pet, including during concurrent pet updates.
create function buscapet_private.check_occurrence_pet()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.pet_id is not null and not exists (
    select 1 from public.pets where id = new.pet_id and owner_id = new.reporter_id
    for key share
  ) then
    raise exception 'pet must belong to occurrence reporter' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger occurrences_check_pet before insert or update of pet_id, reporter_id
on public.occurrences for each row execute function buscapet_private.check_occurrence_pet();

-- SQL privileges are the column-level boundary; RLS is the row-level boundary.
revoke all on public.profiles, public.user_roles, public.partner_profiles,
  public.pets, public.occurrences, public.occurrence_participants,
  public.sightings, public.occurrence_photos from anon, authenticated;
grant select on public.occurrences, public.occurrence_photos to anon;
grant select on public.profiles, public.user_roles, public.partner_profiles,
  public.pets, public.occurrences, public.occurrence_participants,
  public.sightings, public.occurrence_photos to authenticated;
grant update (full_name, accepted_terms_at, accepted_privacy_at) on public.profiles to authenticated;
grant insert (user_id, role) on public.user_roles to authenticated;
grant insert (user_id, organization_type, public_name, city, region,
  responsible_name, cnpj) on public.partner_profiles to authenticated;
grant update (organization_type, public_name, city, region, responsible_name, cnpj)
  on public.partner_profiles to authenticated;
grant insert (owner_id, name, species, breed, sex, size, coat_description,
  distinctive_features) on public.pets to authenticated;
grant update (name, species, breed, sex, size, coat_description,
  distinctive_features) on public.pets to authenticated;
grant delete on public.pets to authenticated;
grant insert (pet_id, reporter_id, type, city, region, public_reference,
  last_seen_at, description, reward_cents, visibility) on public.occurrences to authenticated;
grant update (pet_id, city, region, public_reference, last_seen_at,
  description, reward_cents) on public.occurrences to authenticated;
grant delete on public.occurrences to authenticated;
grant insert (occurrence_id, user_id) on public.occurrence_participants to authenticated;
grant update (status) on public.occurrence_participants to authenticated;
grant insert (occurrence_id, reporter_id, observed_at, area_description,
  direction, behavior, description) on public.sightings to authenticated;
grant insert (occurrence_id, sighting_id, uploaded_by, storage_path,
  mime_type, byte_size) on public.occurrence_photos to authenticated;
grant delete on public.occurrence_photos to authenticated;

create policy "users read own profile" on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy "users read own roles" on public.user_roles
for select to authenticated using (user_id = (select auth.uid()));
create policy "active users update own profile" on public.profiles
for update to authenticated using (id = (select auth.uid()) and buscapet_private.is_active(id))
with check (id = (select auth.uid()) and buscapet_private.is_active(id));
create policy "request collaborator role" on public.user_roles
for insert to authenticated with check (
  user_id = (select auth.uid()) and role = 'colaborador'
  and buscapet_private.is_active(user_id)
);
create policy "owners and staff read partner applications" on public.partner_profiles
for select to authenticated using (
  user_id = (select auth.uid()) or
  buscapet_private.has_role((select auth.uid()), 'moderador') or
  buscapet_private.has_role((select auth.uid()), 'administrador')
);
create policy "submit partner application" on public.partner_profiles
for insert to authenticated with check (
  user_id = (select auth.uid()) and status = 'pending'
  and buscapet_private.is_active(user_id)
);
create policy "edit pending partner application" on public.partner_profiles
for update to authenticated using (
  user_id = (select auth.uid()) and status = 'pending'
  and buscapet_private.is_active(user_id)
) with check (user_id = (select auth.uid()) and status = 'pending');
create policy "own pets" on public.pets for select to authenticated
using (owner_id = (select auth.uid()) and buscapet_private.is_active(owner_id));
create policy "create own pets" on public.pets for insert to authenticated
with check (owner_id = (select auth.uid()) and buscapet_private.is_active(owner_id));
create policy "update own pets" on public.pets for update to authenticated
using (owner_id = (select auth.uid()) and buscapet_private.is_active(owner_id))
with check (owner_id = (select auth.uid()) and buscapet_private.is_active(owner_id));
create policy "delete own pets" on public.pets for delete to authenticated
using (owner_id = (select auth.uid()) and buscapet_private.is_active(owner_id));
create policy "anonymous published occurrences" on public.occurrences for select to anon
using (visibility = 'public');
create policy "authenticated occurrence access" on public.occurrences for select to authenticated
using (visibility = 'public'
  or (reporter_id = (select auth.uid()) and buscapet_private.is_active(reporter_id))
  or buscapet_private.can_read_occurrence(id, (select auth.uid()))
  or buscapet_private.has_role((select auth.uid()), 'moderador')
  or buscapet_private.has_role((select auth.uid()), 'administrador'));
create policy "create own occurrence" on public.occurrences for insert to authenticated
with check (reporter_id = (select auth.uid()) and status = 'active'
  and visibility in ('public', 'private') and buscapet_private.is_active(reporter_id));
create policy "edit own occurrence" on public.occurrences for update to authenticated
using (reporter_id = (select auth.uid()) and buscapet_private.is_active(reporter_id))
with check (reporter_id = (select auth.uid()) and buscapet_private.is_active(reporter_id));
create policy "delete own occurrence" on public.occurrences for delete to authenticated
using (reporter_id = (select auth.uid()) and buscapet_private.is_active(reporter_id));
create policy "members read participants" on public.occurrence_participants
for select to authenticated using (
  buscapet_private.is_active((select auth.uid())) and
  (user_id = (select auth.uid()) or exists (
    select 1 from public.occurrences o where o.id = occurrence_id
      and o.reporter_id = (select auth.uid())
  ))
);
create policy "request participation" on public.occurrence_participants
for insert to authenticated with check (user_id = (select auth.uid())
  and status = 'requested' and buscapet_private.is_active(user_id)
  and exists (select 1 from public.occurrences o where o.id = occurrence_id
    and o.visibility = 'public' and o.status = 'active'));
create policy "reporter updates participation" on public.occurrence_participants
for update to authenticated using (exists (
  select 1 from public.occurrences o where o.id = occurrence_id
  and o.reporter_id = (select auth.uid()) and buscapet_private.is_active(o.reporter_id)
)) with check (exists (
  select 1 from public.occurrences o where o.id = occurrence_id
  and o.reporter_id = (select auth.uid()) and buscapet_private.is_active(o.reporter_id)
));
create policy "authorized sightings" on public.sightings for select to authenticated
using ((reporter_id = (select auth.uid()) and buscapet_private.is_active(reporter_id))
  or buscapet_private.can_read_sighting(id, (select auth.uid())));
create policy "report sightings" on public.sightings for insert to authenticated
with check (reporter_id = (select auth.uid()) and status = 'pending'
  and buscapet_private.is_active(reporter_id) and exists (
    select 1 from public.occurrences o where o.id = occurrence_id and o.status = 'active'
    and (o.visibility = 'public' or o.reporter_id = sightings.reporter_id or exists (
      select 1 from public.occurrence_participants p where p.occurrence_id = o.id
        and p.user_id = sightings.reporter_id and p.status = 'accepted'
    ))
  ));
create policy "anonymous published photo metadata" on public.occurrence_photos
for select to anon using (occurrence_id is not null and exists (
  select 1 from public.occurrences o where o.id = occurrence_id and o.visibility = 'public'
));
create policy "authorized photo metadata" on public.occurrence_photos
for select to authenticated using (
  (occurrence_id is not null and exists (
    select 1 from public.occurrences o where o.id = occurrence_id and o.visibility = 'public'
  )) or (buscapet_private.is_active((select auth.uid())) and
  (uploaded_by = (select auth.uid())
   or (occurrence_id is not null and
       buscapet_private.can_read_occurrence(occurrence_id, (select auth.uid())))
   or (sighting_id is not null and
       buscapet_private.can_read_sighting(sighting_id, (select auth.uid())))))
);
create policy "attach owned file to authorized record" on public.occurrence_photos
for insert to authenticated with check (
  uploaded_by = (select auth.uid())
  and buscapet_private.can_attach_photo(occurrence_id, sighting_id, uploaded_by)
  and storage_path like uploaded_by::text || '/%'
  and buscapet_private.matches_owned_file(storage_path, uploaded_by, mime_type, byte_size)
);
create policy "delete own photo metadata" on public.occurrence_photos
for delete to authenticated using (uploaded_by = (select auth.uid())
  and buscapet_private.is_active(uploaded_by));

create policy "upload to own folder" on storage.objects for insert to authenticated
with check (bucket_id = 'pet-media' and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  and buscapet_private.is_active((select auth.uid())));
create policy "read own files" on storage.objects for select to authenticated
using (bucket_id = 'pet-media' and owner_id = (select auth.uid())::text
  and buscapet_private.is_active((select auth.uid())));
create policy "download published occurrence file" on storage.objects
for select to anon, authenticated using (
  bucket_id = 'pet-media'
  and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info'])
  and exists (select 1 from public.occurrence_photos p
    join public.occurrences o on o.id = p.occurrence_id
    where p.storage_path = name and o.visibility = 'public')
);
create policy "delete own files" on storage.objects for delete to authenticated
using (bucket_id = 'pet-media' and owner_id = (select auth.uid())::text
  and buscapet_private.is_active((select auth.uid())));

-- Only occurrence reporters and the sighting author can request exact coordinates.
create function buscapet_private.sighting_coordinates(p_sighting uuid)
returns table(latitude double precision, longitude double precision)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not buscapet_private.is_active(auth.uid()) or not exists (
    select 1 from public.sightings s join public.occurrences o on o.id = s.occurrence_id
    where s.id = p_sighting and (s.reporter_id = auth.uid() or o.reporter_id = auth.uid())
  ) then raise exception 'not authorized' using errcode = '42501'; end if;
  return query select extensions.st_y(l.exact_location::extensions.geometry),
                      extensions.st_x(l.exact_location::extensions.geometry)
    from buscapet_private.sighting_locations l where l.sighting_id = p_sighting;
end;
$$;
create function public.sighting_coordinates(p_sighting uuid)
returns table(latitude double precision, longitude double precision)
language sql security invoker set search_path = '' as $$
  select * from buscapet_private.sighting_coordinates(p_sighting);
$$;

create function buscapet_private.add_sighting_coordinates(
  p_sighting uuid, p_lat double precision, p_lon double precision)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_lat is null or p_lon is null or p_lat < -90 or p_lat > 90
     or p_lon < -180 or p_lon > 180 or not buscapet_private.is_active(auth.uid())
     or not exists (select 1 from public.sightings
       where id = p_sighting and reporter_id = auth.uid())
  then raise exception 'not authorized' using errcode = '42501'; end if;
  insert into buscapet_private.sighting_locations(sighting_id, exact_location)
    values (p_sighting,
      extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography);
end;
$$;
create function public.add_sighting_coordinates(
  p_sighting uuid, p_lat double precision, p_lon double precision)
returns void language sql security invoker set search_path = '' as $$
  select buscapet_private.add_sighting_coordinates(p_sighting, p_lat, p_lon);
$$;

create function buscapet_private.switch_active_role(p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not buscapet_private.has_role(auth.uid(), p_role)
     or (p_role = 'parceiro' and not exists (
       select 1 from public.partner_profiles where user_id = auth.uid() and status = 'approved'
     )) then raise exception 'role not granted' using errcode = '42501'; end if;
  update public.profiles set active_role = p_role where id = auth.uid();
end;
$$;
create function public.switch_active_role(p_role public.app_role)
returns void language sql security invoker set search_path = '' as $$
  select buscapet_private.switch_active_role(p_role);
$$;

create function buscapet_private.approve_partner(p_user uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user = auth.uid() or not (
    buscapet_private.has_role(auth.uid(), 'moderador') or
    buscapet_private.has_role(auth.uid(), 'administrador')
  ) then raise exception 'not authorized' using errcode = '42501'; end if;
  update public.partner_profiles set status = case when p_approve then 'approved' else 'rejected' end
    where user_id = p_user and status = 'pending';
  if not found then raise exception 'pending application not found'; end if;
  if p_approve then
    insert into public.user_roles (user_id, role) values (p_user, 'parceiro')
      on conflict do nothing;
  end if;
  insert into buscapet_private.admin_audit(actor_id, target_id, action)
    values (auth.uid(), p_user, case when p_approve then 'partner_approved' else 'partner_rejected' end);
end;
$$;
create function public.approve_partner(p_user uuid, p_approve boolean)
returns void language sql security invoker set search_path = '' as $$
  select buscapet_private.approve_partner(p_user, p_approve);
$$;

create function buscapet_private.grant_staff_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not buscapet_private.has_role(auth.uid(), 'administrador')
     or p_user = auth.uid() or p_role not in ('moderador', 'administrador')
     or not buscapet_private.is_active(p_user)
  then raise exception 'not authorized' using errcode = '42501'; end if;
  insert into public.user_roles (user_id, role) values (p_user, p_role)
    on conflict do nothing;
  insert into buscapet_private.admin_audit(actor_id, target_id, action)
    values (auth.uid(), p_user, 'role_granted:' || p_role::text);
end;
$$;
create function public.grant_staff_role(p_user uuid, p_role public.app_role)
returns void language sql security invoker set search_path = '' as $$
  select buscapet_private.grant_staff_role(p_user, p_role);
$$;

create function buscapet_private.set_account_status(p_user uuid, p_status public.account_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user = auth.uid() or not (
    buscapet_private.has_role(auth.uid(), 'administrador') or
    (buscapet_private.has_role(auth.uid(), 'moderador')
      and not buscapet_private.has_role(p_user, 'moderador')
      and not buscapet_private.has_role(p_user, 'administrador'))
  )
  then raise exception 'not authorized' using errcode = '42501'; end if;
  update public.profiles set status = p_status where id = p_user;
  if not found then raise exception 'profile not found'; end if;
  insert into buscapet_private.admin_audit(actor_id, target_id, action)
    values (auth.uid(), p_user, 'account_status:' || p_status::text);
end;
$$;
create function public.set_account_status(p_user uuid, p_status public.account_status)
returns void language sql security invoker set search_path = '' as $$
  select buscapet_private.set_account_status(p_user, p_status);
$$;

create function buscapet_private.moderate_occurrence(
  p_occurrence uuid, p_visibility public.occurrence_visibility)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_visibility not in ('public', 'under_review') or not (
    buscapet_private.has_role(auth.uid(), 'moderador') or
    buscapet_private.has_role(auth.uid(), 'administrador')
  ) then raise exception 'not authorized' using errcode = '42501'; end if;
  update public.occurrences set visibility = p_visibility where id = p_occurrence
    and reporter_id <> auth.uid() and visibility in ('public', 'under_review');
  if not found then raise exception 'occurrence not found or self moderation'; end if;
  insert into buscapet_private.admin_audit(actor_id, occurrence_id, action)
    values (auth.uid(), p_occurrence, 'visibility:' || p_visibility::text);
end;
$$;
create function public.moderate_occurrence(
  p_occurrence uuid, p_visibility public.occurrence_visibility)
returns void language sql security invoker set search_path = '' as $$
  select buscapet_private.moderate_occurrence(p_occurrence, p_visibility);
$$;

create function buscapet_private.review_sighting(p_sighting uuid, p_status public.sighting_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('reviewed', 'rejected') or not buscapet_private.is_active(auth.uid())
  then raise exception 'not authorized' using errcode = '42501'; end if;
  update public.sightings s set status = p_status from public.occurrences o
    where s.id = p_sighting and o.id = s.occurrence_id and o.reporter_id = auth.uid();
  if not found then raise exception 'sighting not found or not owned'; end if;
end;
$$;
create function public.review_sighting(p_sighting uuid, p_status public.sighting_status)
returns void language sql security invoker set search_path = '' as $$
  select buscapet_private.review_sighting(p_sighting, p_status);
$$;

create function buscapet_private.set_occurrence_status(
  p_occurrence uuid, p_status public.occurrence_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not buscapet_private.is_active(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501'; end if;
  update public.occurrences set status = p_status,
    resolved_at = case when p_status = 'active' then null else now() end
    where id = p_occurrence and reporter_id = auth.uid()
      and visibility <> 'under_review'
      and ((status = 'active' and p_status in ('located', 'reunited', 'closed'))
        or (status <> 'active' and p_status = 'active'));
  if not found then raise exception 'invalid occurrence transition'; end if;
end;
$$;
create function public.set_occurrence_status(
  p_occurrence uuid, p_status public.occurrence_status)
returns void language sql security invoker set search_path = '' as $$
  select buscapet_private.set_occurrence_status(p_occurrence, p_status);
$$;

-- Called by the server-side guest endpoint only. Its caller verifies CAPTCHA,
-- derives a secret-salted source hash and never returns private sighting data.
create function public.ingest_guest_sighting(
  p_source_hash text, p_nonce uuid, p_occurrence uuid, p_observed_at timestamptz,
  p_area text, p_description text, p_lat double precision default null,
  p_lon double precision default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if p_source_hash !~ '^[0-9a-f]{64}$' or p_nonce is null or p_observed_at > now()
     or p_observed_at < now() - interval '30 days'
     or char_length(trim(p_area)) not between 2 and 200
     or char_length(trim(p_description)) not between 5 and 2000
     or (p_lat is null) <> (p_lon is null)
     or (p_lat is not null and (p_lat < -90 or p_lat > 90 or p_lon < -180 or p_lon > 180))
  then raise exception 'invalid sighting'; end if;
  if not exists (select 1 from public.occurrences where id = p_occurrence
                 and visibility = 'public' and status = 'active')
  then raise exception 'occurrence unavailable'; end if;
  insert into buscapet_private.guest_sighting_nonces(nonce) values (p_nonce)
    on conflict do nothing;
  if not found then raise exception 'replayed request' using errcode = 'P0001'; end if;
  insert into buscapet_private.guest_sighting_limits(source_hash, window_start, submissions)
    values (p_source_hash, date_trunc('hour', now()), 1)
    on conflict (source_hash, window_start) do update
      set submissions = buscapet_private.guest_sighting_limits.submissions + 1
      where buscapet_private.guest_sighting_limits.submissions < 5;
  if not found then raise exception 'rate limit exceeded' using errcode = 'P0001'; end if;
  insert into public.sightings(occurrence_id, reporter_id, observed_at,
    area_description, description) values (p_occurrence, null, p_observed_at,
    trim(p_area), trim(p_description)) returning id into v_id;
  if p_lat is not null then
    insert into buscapet_private.sighting_locations(sighting_id, exact_location)
      values (v_id, extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography);
  end if;
  return v_id;
end;
$$;

revoke all on schema buscapet_private from public, anon, authenticated;
grant usage on schema buscapet_private to authenticated, service_role;
revoke all on all functions in schema buscapet_private from public, anon, authenticated;
grant execute on function buscapet_private.is_active(uuid),
  buscapet_private.has_role(uuid, public.app_role),
  buscapet_private.can_read_occurrence(uuid, uuid),
  buscapet_private.can_read_sighting(uuid, uuid),
  buscapet_private.can_attach_photo(uuid, uuid, uuid),
  buscapet_private.matches_owned_file(text, uuid, text, integer),
  buscapet_private.sighting_coordinates(uuid),
  buscapet_private.add_sighting_coordinates(uuid, double precision, double precision),
  buscapet_private.switch_active_role(public.app_role),
  buscapet_private.approve_partner(uuid, boolean),
  buscapet_private.grant_staff_role(uuid, public.app_role),
  buscapet_private.set_account_status(uuid, public.account_status),
  buscapet_private.moderate_occurrence(uuid, public.occurrence_visibility),
  buscapet_private.review_sighting(uuid, public.sighting_status),
  buscapet_private.set_occurrence_status(uuid, public.occurrence_status)
to authenticated;
revoke all on function public.sighting_coordinates(uuid),
  public.add_sighting_coordinates(uuid, double precision, double precision),
  public.switch_active_role(public.app_role),
  public.approve_partner(uuid, boolean), public.grant_staff_role(uuid, public.app_role),
  public.set_account_status(uuid, public.account_status),
  public.moderate_occurrence(uuid, public.occurrence_visibility),
  public.review_sighting(uuid, public.sighting_status),
  public.set_occurrence_status(uuid, public.occurrence_status),
  public.ingest_guest_sighting(text, uuid, uuid, timestamptz, text, text, double precision, double precision)
from public, anon, authenticated;
grant execute on function public.sighting_coordinates(uuid),
  public.add_sighting_coordinates(uuid, double precision, double precision),
  public.switch_active_role(public.app_role),
  public.approve_partner(uuid, boolean), public.grant_staff_role(uuid, public.app_role),
  public.set_account_status(uuid, public.account_status),
  public.moderate_occurrence(uuid, public.occurrence_visibility),
  public.review_sighting(uuid, public.sighting_status),
  public.set_occurrence_status(uuid, public.occurrence_status) to authenticated;
grant execute on function public.ingest_guest_sighting(
  text, uuid, uuid, timestamptz, text, text, double precision, double precision) to service_role;
grant select, insert, update on buscapet_private.guest_sighting_limits to service_role;
grant insert on buscapet_private.guest_sighting_nonces to service_role;
grant insert on buscapet_private.sighting_locations to service_role;
grant insert on public.sightings to service_role;
grant select (id) on public.sightings to service_role;
grant select on public.occurrences to service_role;

commit;
