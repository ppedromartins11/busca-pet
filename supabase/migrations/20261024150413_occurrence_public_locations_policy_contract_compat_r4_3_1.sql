begin;

-- The R4.1 column grants intentionally hide occurrences.reporter_id from the
-- Data API. Keep location ownership checks behind the existing safe boolean
-- contract instead of requiring direct SELECT on that private column.
drop policy "read own or public occurrence locations"
  on public.occurrence_public_locations;
create policy "read own or public occurrence locations"
  on public.occurrence_public_locations
  for select to authenticated using (exists (
    select 1
    from public.occurrences as occurrence
    where occurrence.id = occurrence_id
      and (
        (occurrence.type = 'lost'::public.occurrence_type
          and occurrence.visibility = 'public'::public.occurrence_visibility)
        or public.occurrence_is_owner(occurrence.id)
      )
  ));

drop policy "owner inserts occurrence location"
  on public.occurrence_public_locations;
create policy "owner inserts occurrence location"
  on public.occurrence_public_locations
  for insert to authenticated with check (exists (
    select 1
    from public.occurrences as occurrence
    where occurrence.id = occurrence_id
      and occurrence.type = 'lost'::public.occurrence_type
      and public.occurrence_is_owner(occurrence.id)
  ));

drop policy "owner edits occurrence location"
  on public.occurrence_public_locations;
create policy "owner edits occurrence location"
  on public.occurrence_public_locations
  for update to authenticated
  using (exists (
    select 1
    from public.occurrences as occurrence
    where occurrence.id = occurrence_id
      and occurrence.type = 'lost'::public.occurrence_type
      and public.occurrence_is_owner(occurrence.id)
  ))
  with check (exists (
    select 1
    from public.occurrences as occurrence
    where occurrence.id = occurrence_id
      and occurrence.type = 'lost'::public.occurrence_type
      and public.occurrence_is_owner(occurrence.id)
  ));

drop policy "owner removes occurrence location"
  on public.occurrence_public_locations;
create policy "owner removes occurrence location"
  on public.occurrence_public_locations
  for delete to authenticated using (exists (
    select 1
    from public.occurrences as occurrence
    where occurrence.id = occurrence_id
      and public.occurrence_is_owner(occurrence.id)
  ));

commit;
