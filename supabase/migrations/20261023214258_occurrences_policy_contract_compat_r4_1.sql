begin;

-- Keep the existing sighting authorization semantics without requiring the
-- caller to hold SELECT on the private occurrences columns used by the rule.
create function buscapet_private.can_report_sighting(
  p_occurrence uuid,
  p_reporter uuid
)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_reporter = auth.uid()
    and buscapet_private.is_active(p_reporter)
    and exists (
      select 1
      from public.occurrences as occurrence
      where occurrence.id = p_occurrence
        and occurrence.status = 'active'::public.occurrence_status
        and (
          occurrence.visibility = 'public'::public.occurrence_visibility
          or occurrence.reporter_id = p_reporter
          or exists (
            select 1
            from public.occurrence_participants as participant
            where participant.occurrence_id = occurrence.id
              and participant.user_id = p_reporter
              and participant.status = 'accepted'::public.participant_status
          )
        )
    );
$$;

revoke all on function buscapet_private.can_report_sighting(uuid, uuid)
  from public, anon, authenticated;
grant execute on function buscapet_private.can_report_sighting(uuid, uuid)
  to authenticated;

drop policy "members read participants" on public.occurrence_participants;
create policy "members read participants" on public.occurrence_participants
for select to authenticated using (
  buscapet_private.is_active((select auth.uid()))
  and (user_id = (select auth.uid())
    or public.occurrence_is_owner(occurrence_id))
);

drop policy "request participation" on public.occurrence_participants;
create policy "request participation" on public.occurrence_participants
for insert to authenticated with check (
  user_id = (select auth.uid())
  and status = 'requested'::public.participant_status
  and buscapet_private.is_active(user_id)
  and exists (
    select 1
    from public.public_occurrences as occurrence
    where occurrence.id = occurrence_id
      and occurrence.status = 'active'::public.occurrence_status
  )
);

drop policy "reporter updates participation" on public.occurrence_participants;
create policy "reporter updates participation" on public.occurrence_participants
for update to authenticated
using (public.occurrence_is_owner(occurrence_id))
with check (public.occurrence_is_owner(occurrence_id));

drop policy "report sightings" on public.sightings;
create policy "report sightings" on public.sightings
for insert to authenticated with check (
  status = 'pending'::public.sighting_status
  and buscapet_private.can_report_sighting(occurrence_id, reporter_id)
);

drop policy "anonymous published photo metadata" on public.occurrence_photos;
create policy "anonymous published photo metadata" on public.occurrence_photos
for select to anon using (
  occurrence_id is not null
  and exists (
    select 1 from public.public_occurrences as occurrence
    where occurrence.id = occurrence_id
  )
);

drop policy "authorized photo metadata" on public.occurrence_photos;
create policy "authorized photo metadata" on public.occurrence_photos
for select to authenticated using (
  (occurrence_id is not null and exists (
    select 1 from public.public_occurrences as occurrence
    where occurrence.id = occurrence_id
  ))
  or (buscapet_private.is_active((select auth.uid())) and (
    uploaded_by = (select auth.uid())
    or (occurrence_id is not null
      and buscapet_private.can_read_occurrence(occurrence_id, (select auth.uid())))
    or (sighting_id is not null
      and buscapet_private.can_read_sighting(sighting_id, (select auth.uid())))
  ))
);

drop policy "download published occurrence file" on storage.objects;
create policy "download published occurrence file" on storage.objects
for select to anon, authenticated using (
  bucket_id = 'pet-media'
  and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info'])
  and exists (
    select 1
    from public.occurrence_photos as photo
    join public.public_occurrences as occurrence
      on occurrence.id = photo.occurrence_id
    where photo.storage_path = name
  )
);

drop policy "sighting author and tutor read proposed location"
  on public.sighting_public_locations;
create policy "sighting author and tutor read proposed location"
  on public.sighting_public_locations for select to authenticated using (
    buscapet_private.is_active((select auth.uid()))
    and exists (
      select 1
      from public.sightings as sighting
      where sighting.id = sighting_id
        and (sighting.reporter_id = (select auth.uid())
          or public.occurrence_is_owner(sighting.occurrence_id))
    )
  );

drop policy "tutor approves reviewed location" on public.sighting_public_locations;
create policy "tutor approves reviewed location"
  on public.sighting_public_locations for update to authenticated
using (exists (
  select 1
  from public.sightings as sighting
  where sighting.id = sighting_id
    and sighting.status = 'reviewed'::public.sighting_status
    and public.occurrence_is_owner(sighting.occurrence_id)
))
with check (exists (
  select 1
  from public.sightings as sighting
  where sighting.id = sighting_id
    and sighting.status = 'reviewed'::public.sighting_status
    and public.occurrence_is_owner(sighting.occurrence_id)
));

commit;
