begin;

create table buscapet_private.occurrence_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  occurrence_id uuid not null references public.occurrences(id) on delete restrict,
  reporter_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in (
    'false_misleading', 'suspected_fraud', 'inappropriate_content',
    'duplicate_occurrence', 'misuse_of_information', 'other'
  )),
  description text not null check (char_length(btrim(description)) between 10 and 1000),
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  decision_by uuid references public.profiles(id) on delete set null,
  decision_reason text check (decision_reason is null or char_length(btrim(decision_reason)) between 10 and 500),
  decided_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    (status in ('resolved', 'dismissed') and decision_reason is not null and decided_at is not null)
    or (status in ('open', 'in_review') and decision_reason is null and decided_at is null)
  )
);

create unique index occurrence_reports_one_active_per_reporter_idx
  on buscapet_private.occurrence_reports (occurrence_id, reporter_id)
  where reporter_id is not null and status in ('open', 'in_review');
create index occurrence_reports_queue_idx
  on buscapet_private.occurrence_reports (status, created_at desc, id desc);
create index occurrence_reports_category_created_idx
  on buscapet_private.occurrence_reports (category, created_at desc, id desc);
create index occurrence_reports_reporter_created_idx
  on buscapet_private.occurrence_reports (reporter_id, created_at desc);

create table buscapet_private.occurrence_report_history (
  id bigint generated always as identity primary key,
  report_id uuid not null references buscapet_private.occurrence_reports(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('submitted', 'review_started', 'resolved', 'dismissed')),
  from_status text check (from_status is null or from_status in ('open', 'in_review', 'resolved', 'dismissed')),
  to_status text not null check (to_status in ('open', 'in_review', 'resolved', 'dismissed')),
  reason text check (reason is null or char_length(btrim(reason)) between 10 and 1000),
  created_at timestamptz not null default pg_catalog.now(),
  check (
    (action = 'submitted' and from_status is null and to_status = 'open' and reason is null)
    or (action = 'review_started' and from_status = 'open' and to_status = 'in_review')
    or (action = 'resolved' and from_status = 'in_review' and to_status = 'resolved' and char_length(btrim(reason)) between 10 and 500)
    or (action = 'dismissed' and from_status = 'in_review' and to_status = 'dismissed' and char_length(btrim(reason)) between 10 and 500)
  )
);
create index occurrence_report_history_report_created_idx
  on buscapet_private.occurrence_report_history (report_id, created_at desc, id desc);

alter table buscapet_private.occurrence_reports enable row level security;
alter table buscapet_private.occurrence_report_history enable row level security;
revoke all on table buscapet_private.occurrence_reports,
  buscapet_private.occurrence_report_history from public, anon, authenticated;

create function buscapet_private.can_manage_occurrence_reports(p_user uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and auth.uid() = p_user
    and buscapet_private.is_active(p_user)
    and (buscapet_private.has_role(p_user, 'moderador'::public.app_role)
      or buscapet_private.has_role(p_user, 'administrador'::public.app_role));
$$;

create function buscapet_private.submit_occurrence_report(
  p_occurrence uuid, p_category text, p_description text
)
returns table(report_id uuid, report_status text, already_active boolean, submitted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_visibility public.occurrence_visibility;
  v_report_id uuid;
  v_status text;
  v_created_at timestamptz;
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if v_actor is null or not buscapet_private.is_active(v_actor) then
    raise exception 'active authenticated account required' using errcode = '42501';
  end if;
  if p_occurrence is null or p_category not in (
    'false_misleading', 'suspected_fraud', 'inappropriate_content',
    'duplicate_occurrence', 'misuse_of_information', 'other'
  ) or v_description is null or char_length(v_description) not between 10 and 1000 then
    raise exception 'invalid report data' using errcode = '22023';
  end if;

  -- Serialize per reporter so the rate check and duplicate check remain correct
  -- when multiple tabs submit concurrently. The unique index is a second guard.
  perform pg_catalog.pg_advisory_xact_lock(880042313, pg_catalog.hashtext(v_actor::text));
  select occurrence.reporter_id, occurrence.visibility
  into v_owner, v_visibility
  from public.occurrences occurrence
  where occurrence.id = p_occurrence
  for share;
  if not found or v_visibility <> 'public' or v_owner = v_actor then
    raise exception 'occurrence is unavailable for reporting' using errcode = 'P0002';
  end if;

  select report.id, report.status, report.created_at
  into v_report_id, v_status, v_created_at
  from buscapet_private.occurrence_reports report
  where report.occurrence_id = p_occurrence
    and report.reporter_id = v_actor
    and report.status in ('open', 'in_review')
  order by report.created_at desc
  limit 1;
  if found then
    return query select v_report_id, v_status, true, v_created_at;
    return;
  end if;

  if (select count(*) from buscapet_private.occurrence_reports report
      where report.reporter_id = v_actor
        and report.created_at > pg_catalog.now() - interval '24 hours') >= 5 then
    raise exception 'report rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into buscapet_private.occurrence_reports(occurrence_id, reporter_id, category, description)
  values (p_occurrence, v_actor, p_category, v_description)
  on conflict (occurrence_id, reporter_id)
    where reporter_id is not null and status in ('open', 'in_review')
  do nothing
  returning id, status, created_at into v_report_id, v_status, v_created_at;

  if v_report_id is null then
    select report.id, report.status, report.created_at
    into v_report_id, v_status, v_created_at
    from buscapet_private.occurrence_reports report
    where report.occurrence_id = p_occurrence and report.reporter_id = v_actor
      and report.status in ('open', 'in_review')
    order by report.created_at desc limit 1;
    return query select v_report_id, v_status, true, v_created_at;
    return;
  end if;

  insert into buscapet_private.occurrence_report_history(
    report_id, actor_id, action, from_status, to_status
  ) values (v_report_id, v_actor, 'submitted', null, 'open');
  return query select v_report_id, v_status, false, v_created_at;
end;
$$;

create function buscapet_private.get_my_active_occurrence_report(p_occurrence uuid)
returns table(report_id uuid, report_status text, submitted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not buscapet_private.is_active(auth.uid()) then
    raise exception 'active authenticated account required' using errcode = '42501';
  end if;
  if p_occurrence is null then
    raise exception 'occurrence is required' using errcode = '22023';
  end if;
  return query
  select report.id, report.status, report.created_at
  from buscapet_private.occurrence_reports report
  where report.occurrence_id = p_occurrence and report.reporter_id = auth.uid()
    and report.status in ('open', 'in_review')
  order by report.created_at desc limit 1;
end;
$$;

create function buscapet_private.admin_occurrence_report_counts()
returns table(open_count bigint, in_review_count bigint, resolved_count bigint, dismissed_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not buscapet_private.can_manage_occurrence_reports(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query select
    count(*) filter (where report.status = 'open'),
    count(*) filter (where report.status = 'in_review'),
    count(*) filter (where report.status = 'resolved'),
    count(*) filter (where report.status = 'dismissed')
  from buscapet_private.occurrence_reports report;
end;
$$;

create function buscapet_private.admin_list_occurrence_reports(
  p_query text default null,
  p_status text default null,
  p_category text default null,
  p_created_from date default null,
  p_created_to date default null,
  p_order text default 'newest',
  p_page integer default 1,
  p_page_size integer default 20
)
returns table(
  report_id uuid, occurrence_id uuid, category text, description text,
  report_status text, created_at timestamptz, updated_at timestamptz,
  occurrence_type text, occurrence_status text, occurrence_visibility text,
  city text, region text, public_reference text, pet_name text, pet_species text,
  total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_pattern text;
  v_offset integer;
begin
  if not buscapet_private.can_manage_occurrence_reports(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(v_query) > 120
     or (p_status is not null and p_status not in ('open', 'in_review', 'resolved', 'dismissed'))
     or (p_category is not null and p_category not in (
       'false_misleading', 'suspected_fraud', 'inappropriate_content',
       'duplicate_occurrence', 'misuse_of_information', 'other'
     ))
     or (p_order is not null and p_order not in ('newest', 'oldest'))
     or (p_created_from is not null and p_created_to is not null and p_created_from > p_created_to)
     or p_page is null or p_page < 1 or p_page > 100000
     or p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'invalid report filters or pagination' using errcode = '22023';
  end if;
  v_pattern := '%' || replace(replace(replace(lower(v_query), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  v_offset := (p_page - 1) * p_page_size;
  return query
  with filtered as (
    select report.id, report.occurrence_id, report.category, report.description,
      report.status, report.created_at, report.updated_at,
      occurrence.type::text as occurrence_type,
      occurrence.status::text as occurrence_status,
      occurrence.visibility::text as occurrence_visibility,
      occurrence.city, occurrence.region, occurrence.public_reference,
      pet.name as pet_name, pet.species::text as pet_species
    from buscapet_private.occurrence_reports report
    left join public.occurrences occurrence on occurrence.id = report.occurrence_id
      and occurrence.visibility in ('public'::public.occurrence_visibility,
        'under_review'::public.occurrence_visibility)
    left join public.pets pet on pet.id = occurrence.pet_id
    where report.reporter_id is distinct from auth.uid()
      and (p_status is null or report.status = p_status)
      and (p_category is null or report.category = p_category)
      and (p_created_from is null or report.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or report.created_at < (p_created_to + 1)::timestamptz)
      and (v_query = '' or report.id::text = v_query or report.occurrence_id::text = v_query
        or lower(report.description) like v_pattern escape chr(92)
        or lower(coalesce(pet.name, '')) like v_pattern escape chr(92)
        or lower(coalesce(occurrence.city, '')) like v_pattern escape chr(92))
  ), numbered as (
    select filtered.*, count(*) over() as total_count from filtered
  )
  select numbered.id, numbered.occurrence_id, numbered.category, numbered.description,
    numbered.status, numbered.created_at, numbered.updated_at,
    numbered.occurrence_type, numbered.occurrence_status,
    numbered.occurrence_visibility, numbered.city, numbered.region,
    numbered.public_reference, numbered.pet_name, numbered.pet_species,
    numbered.total_count
  from numbered
  order by case when p_order = 'oldest' then numbered.created_at end asc,
    case when p_order <> 'oldest' then numbered.created_at end desc,
    numbered.id desc
  limit p_page_size offset v_offset;
end;
$$;

create function buscapet_private.admin_get_occurrence_report(p_report uuid)
returns table(
  report_id uuid, occurrence_id uuid, category text, description text,
  report_status text, created_at timestamptz, updated_at timestamptz,
  decision_reason text, decided_at timestamptz,
  occurrence_type text, occurrence_status text, occurrence_visibility text,
  city text, region text, public_reference text, last_seen_at timestamptz,
  occurrence_description text, pet_name text, pet_species text,
  pet_breed text, pet_coat_description text, pet_distinctive_features text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not buscapet_private.can_manage_occurrence_reports(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
  select report.id, report.occurrence_id, report.category, report.description,
    report.status, report.created_at, report.updated_at,
    report.decision_reason, report.decided_at,
    occurrence.type::text, occurrence.status::text, occurrence.visibility::text,
    occurrence.city, occurrence.region, occurrence.public_reference,
    occurrence.last_seen_at, occurrence.description, pet.name, pet.species::text,
    pet.breed, pet.coat_description, pet.distinctive_features
  from buscapet_private.occurrence_reports report
  left join public.occurrences occurrence on occurrence.id = report.occurrence_id
    and occurrence.visibility in ('public'::public.occurrence_visibility,
      'under_review'::public.occurrence_visibility)
  left join public.pets pet on pet.id = occurrence.pet_id
  where report.id = p_report and report.reporter_id is distinct from auth.uid();
  if not found then
    raise exception 'report not found or unavailable' using errcode = 'P0002';
  end if;
end;
$$;

create function buscapet_private.admin_transition_occurrence_report(
  p_report uuid, p_status text, p_reason text default null
)
returns table(report_id uuid, report_status text, action text, changed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_reporter uuid;
  v_previous text;
  v_action text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_changed_at timestamptz;
begin
  if not buscapet_private.can_manage_occurrence_reports(v_actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_report is null or p_status is null or p_status not in ('in_review', 'resolved', 'dismissed') then
    raise exception 'invalid report transition' using errcode = '22023';
  end if;
  if p_status = 'in_review' then
    if v_reason is not null and char_length(v_reason) not between 10 and 500 then
      raise exception 'review note must contain between 10 and 500 characters' using errcode = '22023';
    end if;
  elsif v_reason is null or char_length(v_reason) not between 10 and 500 then
    raise exception 'decision reason must contain between 10 and 500 characters' using errcode = '22023';
  end if;

  select report.reporter_id, report.status into v_reporter, v_previous
  from buscapet_private.occurrence_reports report
  where report.id = p_report
  for update;
  if not found or v_reporter = v_actor then
    raise exception 'report not found or unavailable' using errcode = 'P0002';
  end if;
  if v_previous = 'open' then
    if p_status <> 'in_review' then
      raise exception 'report must enter analysis before a final decision' using errcode = '22023';
    end if;
    v_action := 'review_started';
  elsif v_previous = 'in_review' and p_status in ('resolved', 'dismissed') then
    v_action := p_status;
  else
    raise exception 'report status changed or transition is invalid' using errcode = '40001';
  end if;

  update buscapet_private.occurrence_reports
  set status = p_status, updated_at = pg_catalog.now(),
      decision_by = case when p_status in ('resolved', 'dismissed') then v_actor else null end,
      decision_reason = case when p_status in ('resolved', 'dismissed') then v_reason else null end,
      decided_at = case when p_status in ('resolved', 'dismissed') then pg_catalog.now() else null end
  where id = p_report;
  insert into buscapet_private.occurrence_report_history(
    report_id, actor_id, action, from_status, to_status, reason
  ) values (p_report, v_actor, v_action, v_previous, p_status, v_reason);
  v_changed_at := pg_catalog.now();
  return query select p_report, p_status, v_action, v_changed_at;
end;
$$;

create function buscapet_private.admin_list_occurrence_report_history(
  p_report uuid, p_page integer default 1, p_page_size integer default 20
)
returns table(actor_name text, action text, from_status text, to_status text,
  reason text, created_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_offset integer;
begin
  if not buscapet_private.can_manage_occurrence_reports(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_report is null or p_page is null or p_page < 1 or p_page > 100000
     or p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'invalid report history pagination' using errcode = '22023';
  end if;
  v_offset := (p_page - 1) * p_page_size;
  return query
  with history as (
    select entry.id,
      case when entry.action = 'submitted' then 'Identidade protegida'
        else coalesce(actor.full_name, 'Moderador indisponível') end as actor_name,
      entry.action, entry.from_status, entry.to_status, entry.reason, entry.created_at
    from buscapet_private.occurrence_report_history entry
    join buscapet_private.occurrence_reports report on report.id = entry.report_id
    left join public.profiles actor on actor.id = entry.actor_id
    where entry.report_id = p_report and report.reporter_id is distinct from auth.uid()
  ), numbered as (select history.*, count(*) over() as total_count from history)
  select numbered.actor_name, numbered.action, numbered.from_status,
    numbered.to_status, numbered.reason, numbered.created_at, numbered.total_count
  from numbered order by numbered.created_at desc, numbered.id desc
  limit p_page_size offset v_offset;
end;
$$;

create function public.report_occurrence(p_occurrence uuid, p_category text, p_description text)
returns table(report_id uuid, report_status text, already_active boolean, submitted_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from buscapet_private.submit_occurrence_report(p_occurrence, p_category, p_description);
$$;

create function public.get_my_active_occurrence_report(p_occurrence uuid)
returns table(report_id uuid, report_status text, submitted_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.get_my_active_occurrence_report(p_occurrence);
$$;

create function public.admin_occurrence_report_counts()
returns table(open_count bigint, in_review_count bigint, resolved_count bigint, dismissed_count bigint)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_occurrence_report_counts();
$$;

create function public.admin_list_occurrence_reports(
  p_query text default null, p_status text default null, p_category text default null,
  p_created_from date default null, p_created_to date default null,
  p_order text default 'newest', p_page integer default 1, p_page_size integer default 20
)
returns table(report_id uuid, occurrence_id uuid, category text, description text,
  report_status text, created_at timestamptz, updated_at timestamptz,
  occurrence_type text, occurrence_status text, occurrence_visibility text,
  city text, region text, public_reference text, pet_name text, pet_species text,
  total_count bigint)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_list_occurrence_reports(
    p_query, p_status, p_category, p_created_from, p_created_to,
    p_order, p_page, p_page_size
  );
$$;

create function public.admin_get_occurrence_report(p_report uuid)
returns table(report_id uuid, occurrence_id uuid, category text, description text,
  report_status text, created_at timestamptz, updated_at timestamptz,
  decision_reason text, decided_at timestamptz,
  occurrence_type text, occurrence_status text, occurrence_visibility text,
  city text, region text, public_reference text, last_seen_at timestamptz,
  occurrence_description text, pet_name text, pet_species text,
  pet_breed text, pet_coat_description text, pet_distinctive_features text)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_get_occurrence_report(p_report);
$$;

create function public.admin_transition_occurrence_report(
  p_report uuid, p_status text, p_reason text default null
)
returns table(report_id uuid, report_status text, action text, changed_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from buscapet_private.admin_transition_occurrence_report(p_report, p_status, p_reason);
$$;

create function public.admin_list_occurrence_report_history(
  p_report uuid, p_page integer default 1, p_page_size integer default 20
)
returns table(actor_name text, action text, from_status text, to_status text,
  reason text, created_at timestamptz, total_count bigint)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_list_occurrence_report_history(p_report, p_page, p_page_size);
$$;

revoke all on function buscapet_private.can_manage_occurrence_reports(uuid),
  buscapet_private.submit_occurrence_report(uuid, text, text),
  buscapet_private.get_my_active_occurrence_report(uuid),
  buscapet_private.admin_occurrence_report_counts(),
  buscapet_private.admin_list_occurrence_reports(text, text, text, date, date, text, integer, integer),
  buscapet_private.admin_get_occurrence_report(uuid),
  buscapet_private.admin_transition_occurrence_report(uuid, text, text),
  buscapet_private.admin_list_occurrence_report_history(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function buscapet_private.submit_occurrence_report(uuid, text, text),
  buscapet_private.get_my_active_occurrence_report(uuid),
  buscapet_private.admin_occurrence_report_counts(),
  buscapet_private.admin_list_occurrence_reports(text, text, text, date, date, text, integer, integer),
  buscapet_private.admin_get_occurrence_report(uuid),
  buscapet_private.admin_transition_occurrence_report(uuid, text, text),
  buscapet_private.admin_list_occurrence_report_history(uuid, integer, integer)
  to authenticated;

revoke all on function public.report_occurrence(uuid, text, text),
  public.get_my_active_occurrence_report(uuid),
  public.admin_occurrence_report_counts(),
  public.admin_list_occurrence_reports(text, text, text, date, date, text, integer, integer),
  public.admin_get_occurrence_report(uuid),
  public.admin_transition_occurrence_report(uuid, text, text),
  public.admin_list_occurrence_report_history(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.report_occurrence(uuid, text, text),
  public.get_my_active_occurrence_report(uuid),
  public.admin_occurrence_report_counts(),
  public.admin_list_occurrence_reports(text, text, text, date, date, text, integer, integer),
  public.admin_get_occurrence_report(uuid),
  public.admin_transition_occurrence_report(uuid, text, text),
  public.admin_list_occurrence_report_history(uuid, integer, integer)
  to authenticated;

commit;
