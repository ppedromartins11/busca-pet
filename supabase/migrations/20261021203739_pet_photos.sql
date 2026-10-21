begin;

-- Fotos do cadastro privado do animal. Elas não são expostas pela política de
-- fotografias de ocorrências e permanecem acessíveis somente ao tutor.
create table public.pet_photos (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create index pet_photos_pet_created_idx on public.pet_photos(pet_id, created_at);
create unique index pet_photos_single_cover_idx on public.pet_photos(pet_id) where is_cover;

alter table public.pet_photos enable row level security;
grant select, insert, delete on public.pet_photos to authenticated;
grant update (is_cover) on public.pet_photos to authenticated;

create policy "owners read pet photos" on public.pet_photos for select to authenticated
using (exists (select 1 from public.pets p where p.id = pet_id
  and p.owner_id = (select auth.uid()) and buscapet_private.is_active(p.owner_id)));

create policy "owners attach pet photos" on public.pet_photos for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and storage_path like uploaded_by::text || '/%'
  and exists (select 1 from public.pets p where p.id = pet_id
    and p.owner_id = (select auth.uid()) and buscapet_private.is_active(p.owner_id))
  and buscapet_private.matches_owned_file(storage_path, uploaded_by, mime_type, byte_size)
);

create policy "owners set pet cover" on public.pet_photos for update to authenticated
using (uploaded_by = (select auth.uid()) and exists (select 1 from public.pets p
  where p.id = pet_id and p.owner_id = (select auth.uid()) and buscapet_private.is_active(p.owner_id)))
with check (uploaded_by = (select auth.uid()) and exists (select 1 from public.pets p
  where p.id = pet_id and p.owner_id = (select auth.uid()) and buscapet_private.is_active(p.owner_id)));

create policy "owners delete pet photos" on public.pet_photos for delete to authenticated
using (uploaded_by = (select auth.uid()) and exists (select 1 from public.pets p
  where p.id = pet_id and p.owner_id = (select auth.uid()) and buscapet_private.is_active(p.owner_id)));

create function buscapet_private.limit_pet_photos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.pet_id::text, 0));
  if (select count(*) from public.pet_photos where pet_id = new.pet_id) >= 5 then
    raise exception 'a pet may have at most five photos' using errcode = '23514';
  end if;
  if not exists (select 1 from public.pet_photos where pet_id = new.pet_id) then
    new.is_cover := true;
  end if;
  return new;
end;
$$;

create trigger pet_photos_limit_and_cover
before insert on public.pet_photos
for each row execute function buscapet_private.limit_pet_photos();

-- O relógio do navegador é conferido novamente no banco. A pequena margem
-- absorve o intervalo entre o envio e a execução sem aceitar datas futuras.
alter table public.sightings
  add constraint sightings_observed_not_future check (observed_at <= created_at + interval '5 minutes') not valid;
alter table public.sightings validate constraint sightings_observed_not_future;

revoke all on function buscapet_private.limit_pet_photos() from public, anon, authenticated;

commit;
