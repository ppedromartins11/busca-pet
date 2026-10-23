begin;

-- Read-only aggregation for the unified moderation workspace. Decisions remain
-- routed through the existing, separately audited RPCs.
create function buscapet_private.admin_moderation_queue(
  p_kind text default 'all',
  p_status text default 'pending',
  p_query text default null,
  p_order text default 'priority',
  p_created_from date default null,
  p_created_to date default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table(
  item_type text,
  item_id uuid,
  occurrence_id uuid,
  category text,
  item_status text,
  created_at timestamptz,
  updated_at timestamptz,
  occurrence_type text,
  occurrence_status text,
  occurrence_visibility text,
  city text,
  region text,
  public_reference text,
  pet_name text,
  pet_species text,
  description text,
  active_report_count bigint,
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
  if p_kind is null or p_kind not in ('all', 'report', 'occurrence')
     or p_status is null or p_status not in ('pending', 'all', 'open', 'in_review', 'under_review', 'resolved', 'dismissed')
     or p_order is null or p_order not in ('priority', 'newest', 'oldest')
     or char_length(v_query) > 120
     or (p_created_from is not null and p_created_to is not null and p_created_from > p_created_to)
     or p_page is null or p_page < 1 or p_page > 100000
     or p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'invalid moderation queue filters or pagination' using errcode = '22023';
  end if;

  v_pattern := '%' || replace(replace(replace(lower(v_query), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  v_offset := (p_page - 1) * p_page_size;
  return query
  with combined as (
    select
      'report'::text as item_type,
      report.id as item_id,
      occurrence.id as occurrence_id,
      report.category,
      report.status as item_status,
      report.created_at,
      report.updated_at,
      occurrence.type::text as occurrence_type,
      occurrence.status::text as occurrence_status,
      occurrence.visibility::text as occurrence_visibility,
      occurrence.city,
      occurrence.region,
      occurrence.public_reference,
      pet.name as pet_name,
      pet.species::text as pet_species,
      report.description,
      (select count(*)::bigint
       from buscapet_private.occurrence_reports active_report
       where active_report.occurrence_id = occurrence.id
         and active_report.status in ('open', 'in_review')) as active_report_count
    from buscapet_private.occurrence_reports report
    join public.occurrences occurrence on occurrence.id = report.occurrence_id
      and occurrence.visibility in ('public'::public.occurrence_visibility,
        'under_review'::public.occurrence_visibility)
    left join public.pets pet on pet.id = occurrence.pet_id
    where report.reporter_id is distinct from auth.uid()
      and p_kind in ('all', 'report')
      and (p_status <> 'pending' or report.status in ('open', 'in_review'))
      and (p_status in ('pending', 'all') or p_status = report.status)
      and (p_created_from is null or report.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or report.created_at < (p_created_to + 1)::timestamptz)
      and (v_query = '' or report.id::text = v_query or occurrence.id::text = v_query
        or lower(report.category) like v_pattern escape chr(92)
        or lower(report.description) like v_pattern escape chr(92)
        or lower(coalesce(pet.name, '')) like v_pattern escape chr(92)
        or lower(coalesce(occurrence.city, '')) like v_pattern escape chr(92)
        or lower(coalesce(occurrence.region, '')) like v_pattern escape chr(92)
        or lower(coalesce(occurrence.public_reference, '')) like v_pattern escape chr(92))

    union all

    select
      'occurrence'::text as item_type,
      occurrence.id as item_id,
      occurrence.id as occurrence_id,
      null::text as category,
      'under_review'::text as item_status,
      occurrence.created_at,
      occurrence.updated_at,
      occurrence.type::text as occurrence_type,
      occurrence.status::text as occurrence_status,
      occurrence.visibility::text as occurrence_visibility,
      occurrence.city,
      occurrence.region,
      occurrence.public_reference,
      pet.name as pet_name,
      pet.species::text as pet_species,
      occurrence.description,
      (select count(*)::bigint
       from buscapet_private.occurrence_reports active_report
       where active_report.occurrence_id = occurrence.id
         and active_report.status in ('open', 'in_review')) as active_report_count
    from public.occurrences occurrence
    left join public.pets pet on pet.id = occurrence.pet_id
    where occurrence.visibility = 'under_review'::public.occurrence_visibility
      and occurrence.reporter_id <> auth.uid()
      and p_kind in ('all', 'occurrence')
      and p_status in ('pending', 'all', 'under_review')
      and (p_created_from is null or occurrence.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or occurrence.created_at < (p_created_to + 1)::timestamptz)
      and (v_query = '' or occurrence.id::text = v_query
        or lower(coalesce(pet.name, '')) like v_pattern escape chr(92)
        or lower(occurrence.city) like v_pattern escape chr(92)
        or lower(occurrence.region) like v_pattern escape chr(92)
        or lower(coalesce(occurrence.public_reference, '')) like v_pattern escape chr(92)
        or lower(occurrence.description) like v_pattern escape chr(92))
  ), numbered as (
    select combined.*, count(*) over() as total_count
    from combined
  )
  select numbered.item_type, numbered.item_id, numbered.occurrence_id,
    numbered.category, numbered.item_status, numbered.created_at,
    numbered.updated_at, numbered.occurrence_type, numbered.occurrence_status,
    numbered.occurrence_visibility, numbered.city, numbered.region,
    numbered.public_reference, numbered.pet_name, numbered.pet_species,
    numbered.description, numbered.active_report_count, numbered.total_count
  from numbered
  order by
    case when p_order = 'priority' then numbered.active_report_count else 0 end desc,
    case when p_order = 'priority' then case numbered.item_type when 'occurrence' then 0 else 1 end else 0 end,
    case when p_order = 'oldest' then numbered.created_at end asc,
    case when p_order <> 'oldest' then numbered.created_at end desc,
    numbered.item_type asc, numbered.item_id asc
  limit p_page_size offset v_offset;
end;
$$;

create function buscapet_private.admin_moderation_metrics()
returns table(
  open_reports bigint,
  in_review_reports bigint,
  hidden_occurrences bigint,
  resolved_reports bigint,
  dismissed_reports bigint,
  decisions_last_30_days bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not buscapet_private.can_manage_occurrence_reports(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
  select
    (select count(*) from buscapet_private.occurrence_reports where status = 'open'),
    (select count(*) from buscapet_private.occurrence_reports where status = 'in_review'),
    (select count(*) from public.occurrences where visibility = 'under_review'::public.occurrence_visibility),
    (select count(*) from buscapet_private.occurrence_reports where status = 'resolved'),
    (select count(*) from buscapet_private.occurrence_reports where status = 'dismissed'),
    (select count(*) from buscapet_private.occurrence_report_history
     where action in ('resolved', 'dismissed') and created_at >= pg_catalog.now() - interval '30 days')
      + (select count(*) from buscapet_private.admin_audit
         where action in ('occurrence_hidden', 'occurrence_restored', 'visibility:under_review', 'visibility:public')
           and created_at >= pg_catalog.now() - interval '30 days');
end;
$$;

create function public.admin_moderation_queue(
  p_kind text default 'all', p_status text default 'pending', p_query text default null,
  p_order text default 'priority', p_created_from date default null, p_created_to date default null,
  p_page integer default 1, p_page_size integer default 20
)
returns table(
  item_type text, item_id uuid, occurrence_id uuid, category text, item_status text,
  created_at timestamptz, updated_at timestamptz, occurrence_type text,
  occurrence_status text, occurrence_visibility text, city text, region text,
  public_reference text, pet_name text, pet_species text, description text,
  active_report_count bigint, total_count bigint
)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_moderation_queue(
    p_kind, p_status, p_query, p_order, p_created_from, p_created_to, p_page, p_page_size
  );
$$;

create function public.admin_moderation_metrics()
returns table(
  open_reports bigint, in_review_reports bigint, hidden_occurrences bigint,
  resolved_reports bigint, dismissed_reports bigint, decisions_last_30_days bigint
)
language sql stable security invoker set search_path = '' as $$
  select * from buscapet_private.admin_moderation_metrics();
$$;

revoke all on function buscapet_private.admin_moderation_queue(text, text, text, text, date, date, integer, integer),
  buscapet_private.admin_moderation_metrics() from public, anon, authenticated;
grant execute on function buscapet_private.admin_moderation_queue(text, text, text, text, date, date, integer, integer),
  buscapet_private.admin_moderation_metrics() to authenticated;

revoke all on function public.admin_moderation_queue(text, text, text, text, date, date, integer, integer),
  public.admin_moderation_metrics() from public, anon, authenticated;
grant execute on function public.admin_moderation_queue(text, text, text, text, date, date, integer, integer),
  public.admin_moderation_metrics() to authenticated;

commit;
