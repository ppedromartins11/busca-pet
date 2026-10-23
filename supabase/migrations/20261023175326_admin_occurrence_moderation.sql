begin;

-- The legacy moderation RPC allowed a visibility transition without a reason
-- and did not reject suspended staff. Keep it only as an inert compatibility
-- object; all moderation now goes through the audited endpoints below.
revoke all on function public.moderate_occurrence(uuid, public.occurrence_visibility)
  from public, anon, authenticated;
revoke all on function buscapet_private.moderate_occurrence(uuid, public.occurrence_visibility)
  from public, anon, authenticated;

create index if not exists admin_audit_occurrence_created_at_idx
  on buscapet_private.admin_audit (occurrence_id, created_at desc, id desc)
  where occurrence_id is not null;

create function buscapet_private.can_moderate_occurrence_file(p_path text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and (buscapet_private.has_role(auth.uid(), 'moderador'::public.app_role)
      or buscapet_private.has_role(auth.uid(), 'administrador'::public.app_role))
    and exists (
      select 1
      from public.occurrence_photos photo
      join public.occurrences occurrence on occurrence.id = photo.occurrence_id
      where photo.storage_path = p_path
        and occurrence.visibility in ('public'::public.occurrence_visibility,
          'under_review'::public.occurrence_visibility)
        and occurrence.reporter_id <> auth.uid()
    );
$$;

revoke all on function buscapet_private.can_moderate_occurrence_file(text)
  from public, anon, authenticated;
grant execute on function buscapet_private.can_moderate_occurrence_file(text)
  to authenticated;

create policy "active moderators read linked occurrence photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'pet-media'
  and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info'])
  and buscapet_private.can_moderate_occurrence_file(name)
);

create function buscapet_private.admin_list_occurrences(
  p_query text default null,
  p_type text default null,
  p_status text default null,
  p_visibility text default null,
  p_created_from date default null,
  p_created_to date default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table(
  occurrence_id uuid,
  occurrence_type text,
  occurrence_status text,
  visibility text,
  city text,
  region text,
  public_reference text,
  last_seen_at timestamptz,
  description text,
  created_at timestamptz,
  pet_name text,
  pet_species text,
  cover_photo_path text,
  total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_type text := lower(btrim(coalesce(p_type, '')));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_visibility text := lower(btrim(coalesce(p_visibility, '')));
  v_pattern text;
  v_offset integer;
begin
  if auth.uid() is null or not buscapet_private.is_active(auth.uid()) or not (
    buscapet_private.has_role(auth.uid(), 'moderador'::public.app_role)
    or buscapet_private.has_role(auth.uid(), 'administrador'::public.app_role)
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(v_query) > 120 then
    raise exception 'search query is too long' using errcode = '22023';
  end if;
  if v_type not in ('', 'all', 'lost', 'found')
     or v_status not in ('', 'all', 'active', 'located', 'reunited', 'closed')
     or v_visibility not in ('', 'all', 'public', 'under_review') then
    raise exception 'invalid occurrence filter' using errcode = '22023';
  end if;
  if p_created_from is not null and p_created_to is not null
     and p_created_from > p_created_to then
    raise exception 'invalid occurrence date range' using errcode = '22023';
  end if;
  if p_page is null or p_page < 1 or p_page > 100000
     or p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'invalid pagination' using errcode = '22023';
  end if;

  v_pattern := '%' || replace(replace(replace(lower(v_query), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  v_offset := (p_page - 1) * p_page_size;
  return query
  with filtered as (
    select
      occurrence.id,
      occurrence.type::text,
      occurrence.status::text,
      occurrence.visibility::text,
      occurrence.city,
      occurrence.region,
      occurrence.public_reference,
      occurrence.last_seen_at,
      occurrence.description,
      occurrence.created_at,
      pet.name,
      pet.species::text,
      (select photo.storage_path
       from public.occurrence_photos photo
       where photo.occurrence_id = occurrence.id
       order by photo.created_at, photo.id
       limit 1) as cover_photo_path
    from public.occurrences occurrence
    left join public.pets pet on pet.id = occurrence.pet_id
    where occurrence.visibility in ('public'::public.occurrence_visibility,
      'under_review'::public.occurrence_visibility)
      and occurrence.reporter_id <> auth.uid()
      and (v_type in ('', 'all') or occurrence.type::text = v_type)
      and (v_status in ('', 'all') or occurrence.status::text = v_status)
      and (v_visibility in ('', 'all') or occurrence.visibility::text = v_visibility)
      and (p_created_from is null or occurrence.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or occurrence.created_at < (p_created_to + 1)::timestamptz)
      and (v_query = '' or occurrence.id::text = v_query
        or lower(coalesce(pet.name, '')) like v_pattern escape chr(92)
        or lower(occurrence.city) like v_pattern escape chr(92)
        or lower(occurrence.region) like v_pattern escape chr(92)
        or lower(coalesce(occurrence.public_reference, '')) like v_pattern escape chr(92)
        or lower(occurrence.description) like v_pattern escape chr(92))
  ), numbered as (
    select filtered.*, count(*) over() as total_count
    from filtered
  )
  select numbered.id, numbered.type, numbered.status, numbered.visibility,
    numbered.city, numbered.region, numbered.public_reference,
    numbered.last_seen_at, numbered.description, numbered.created_at,
    numbered.name, numbered.species, numbered.cover_photo_path, numbered.total_count
  from numbered
  order by numbered.created_at desc, numbered.id asc
  limit p_page_size offset v_offset;
end;
$$;

create function buscapet_private.admin_get_occurrence(p_occurrence uuid)
returns table(
  occurrence_id uuid,
  occurrence_type text,
  occurrence_status text,
  visibility text,
  city text,
  region text,
  public_reference text,
  last_seen_at timestamptz,
  description text,
  created_at timestamptz,
  updated_at timestamptz,
  pet_name text,
  pet_species text,
  pet_breed text,
  pet_coat_description text,
  pet_distinctive_features text,
  photos jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not buscapet_private.is_active(auth.uid()) or not (
    buscapet_private.has_role(auth.uid(), 'moderador'::public.app_role)
    or buscapet_private.has_role(auth.uid(), 'administrador'::public.app_role)
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
  select occurrence.id, occurrence.type::text, occurrence.status::text,
    occurrence.visibility::text, occurrence.city, occurrence.region,
    occurrence.public_reference, occurrence.last_seen_at, occurrence.description,
    occurrence.created_at, occurrence.updated_at, pet.name, pet.species::text,
    pet.breed, pet.coat_description, pet.distinctive_features,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', photo.id, 'storage_path', photo.storage_path,
      'mime_type', photo.mime_type, 'byte_size', photo.byte_size,
      'created_at', photo.created_at
    ) order by photo.created_at, photo.id)
      from public.occurrence_photos photo
      where photo.occurrence_id = occurrence.id), '[]'::jsonb)
  from public.occurrences occurrence
  left join public.pets pet on pet.id = occurrence.pet_id
  where occurrence.id = p_occurrence
    and occurrence.visibility in ('public'::public.occurrence_visibility,
      'under_review'::public.occurrence_visibility)
    and occurrence.reporter_id <> auth.uid();
  if not found then
    raise exception 'occurrence not found or unavailable' using errcode = 'P0002';
  end if;
end;
$$;

create function buscapet_private.admin_moderate_occurrence(
  p_occurrence uuid,
  p_action text,
  p_reason text
)
returns table(occurrence_id uuid, visibility text, action text, changed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_reporter uuid;
  v_visibility public.occurrence_visibility;
  v_next public.occurrence_visibility;
  v_action text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_changed_at timestamptz;
begin
  if v_actor is null or not buscapet_private.is_active(v_actor) or not (
    buscapet_private.has_role(v_actor, 'moderador'::public.app_role)
    or buscapet_private.has_role(v_actor, 'administrador'::public.app_role)
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_occurrence is null or p_action not in ('hide', 'restore')
     or v_reason is null or char_length(v_reason) not between 10 and 500 then
    raise exception 'invalid moderation action or reason' using errcode = '22023';
  end if;

  select occurrence.reporter_id, occurrence.visibility
  into v_reporter, v_visibility
  from public.occurrences occurrence
  where occurrence.id = p_occurrence
  for update;
  if not found or v_visibility not in ('public', 'under_review')
     or v_reporter = v_actor then
    raise exception 'occurrence not found or unavailable' using errcode = 'P0002';
  end if;

  if p_action = 'hide' and v_visibility = 'public' then
    v_next := 'under_review';
    v_action := 'occurrence_hidden';
  elsif p_action = 'restore' and v_visibility = 'under_review' then
    v_next := 'public';
    v_action := 'occurrence_restored';
  else
    raise exception 'invalid visibility transition' using errcode = '22023';
  end if;

  update public.occurrences set visibility = v_next
  where id = p_occurrence;
  insert into buscapet_private.admin_audit(actor_id, occurrence_id, action, reason)
  values (v_actor, p_occurrence, v_action, v_reason)
  returning created_at into v_changed_at;
  return query select p_occurrence, v_next::text, v_action, v_changed_at;
end;
$$;

create function buscapet_private.admin_list_occurrence_audit(
  p_occurrence uuid,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table(actor_name text, action text, reason text, created_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_offset integer;
begin
  if auth.uid() is null or not buscapet_private.is_active(auth.uid()) or not (
    buscapet_private.has_role(auth.uid(), 'moderador'::public.app_role)
    or buscapet_private.has_role(auth.uid(), 'administrador'::public.app_role)
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_occurrence is null or p_page is null or p_page < 1 or p_page > 100000
     or p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'invalid moderation history pagination' using errcode = '22023';
  end if;
  v_offset := (p_page - 1) * p_page_size;
  return query
  with history as (
    select audit.id,
      coalesce(actor.full_name, 'Moderador indisponível') as actor_name,
      case audit.action
        when 'visibility:under_review' then 'occurrence_hidden'
        when 'visibility:public' then 'occurrence_restored'
        else audit.action
      end as action,
      audit.reason, audit.created_at
    from buscapet_private.admin_audit audit
    join public.occurrences occurrence on occurrence.id = audit.occurrence_id
    left join public.profiles actor on actor.id = audit.actor_id
    where audit.occurrence_id = p_occurrence
      and audit.action in ('occurrence_hidden', 'occurrence_restored',
        'visibility:under_review', 'visibility:public')
      and occurrence.visibility in ('public'::public.occurrence_visibility,
        'under_review'::public.occurrence_visibility)
      and occurrence.reporter_id <> auth.uid()
  ), numbered as (
    select history.*, count(*) over() as total_count from history
  )
  select numbered.actor_name, numbered.action, numbered.reason,
    numbered.created_at, numbered.total_count
  from numbered
  order by numbered.created_at desc, numbered.id desc
  limit p_page_size offset v_offset;
end;
$$;

create function public.admin_list_occurrences(
  p_query text default null,
  p_type text default null,
  p_status text default null,
  p_visibility text default null,
  p_created_from date default null,
  p_created_to date default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table(
  occurrence_id uuid, occurrence_type text, occurrence_status text,
  visibility text, city text, region text, public_reference text,
  last_seen_at timestamptz, description text, created_at timestamptz,
  pet_name text, pet_species text, cover_photo_path text, total_count bigint
)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_list_occurrences(
    p_query, p_type, p_status, p_visibility, p_created_from, p_created_to,
    p_page, p_page_size
  );
$$;

create function public.admin_get_occurrence(p_occurrence uuid)
returns table(
  occurrence_id uuid, occurrence_type text, occurrence_status text,
  visibility text, city text, region text, public_reference text,
  last_seen_at timestamptz, description text, created_at timestamptz,
  updated_at timestamptz, pet_name text, pet_species text, pet_breed text,
  pet_coat_description text, pet_distinctive_features text, photos jsonb
)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_get_occurrence(p_occurrence);
$$;

create function public.admin_moderate_occurrence(p_occurrence uuid, p_action text, p_reason text)
returns table(occurrence_id uuid, visibility text, action text, changed_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from buscapet_private.admin_moderate_occurrence(p_occurrence, p_action, p_reason);
$$;

create function public.admin_list_occurrence_audit(
  p_occurrence uuid, p_page integer default 1, p_page_size integer default 20
)
returns table(actor_name text, action text, reason text, created_at timestamptz, total_count bigint)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_list_occurrence_audit(p_occurrence, p_page, p_page_size);
$$;

revoke all on function buscapet_private.admin_list_occurrences(text, text, text, text, date, date, integer, integer),
  buscapet_private.admin_get_occurrence(uuid),
  buscapet_private.admin_moderate_occurrence(uuid, text, text),
  buscapet_private.admin_list_occurrence_audit(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function buscapet_private.admin_list_occurrences(text, text, text, text, date, date, integer, integer),
  buscapet_private.admin_get_occurrence(uuid),
  buscapet_private.admin_moderate_occurrence(uuid, text, text),
  buscapet_private.admin_list_occurrence_audit(uuid, integer, integer)
  to authenticated;

revoke all on function public.admin_list_occurrences(text, text, text, text, date, date, integer, integer),
  public.admin_get_occurrence(uuid),
  public.admin_moderate_occurrence(uuid, text, text),
  public.admin_list_occurrence_audit(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_list_occurrences(text, text, text, text, date, date, integer, integer),
  public.admin_get_occurrence(uuid),
  public.admin_moderate_occurrence(uuid, text, text),
  public.admin_list_occurrence_audit(uuid, integer, integer)
  to authenticated;

commit;
