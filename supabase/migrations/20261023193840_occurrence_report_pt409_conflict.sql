-- PostgREST 14 retries SQLSTATE 40001 as a transient serialization failure.
-- Stale moderation is a final HTTP conflict, not a retryable transaction error.
create or replace function buscapet_private.admin_transition_occurrence_report(
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
    raise sqlstate 'PT409' using message = 'report status changed or transition is invalid';
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
