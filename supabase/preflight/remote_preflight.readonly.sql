-- Executar SOMENTE no SQL Editor do projeto jpnvizdhyrvliqgvyxzx.
-- Inventário de leitura antes da primeira migration; não altera dados.
select current_database() as database_name, current_setting('server_version') as postgres_version;

select n.nspname as schema_name, c.relname as object_name,
       case c.relkind when 'r' then 'table' when 'p' then 'partitioned table'
         when 'v' then 'view' when 'm' then 'materialized view' end as object_type
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'buscapet_private')
  and c.relkind in ('r', 'p', 'v', 'm')
order by 1, 2;

select n.nspname as schema_name, p.proname as function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'buscapet_private')
order by 1, 2, 3;

select n.nspname as schema_name, t.typname as type_name
from pg_catalog.pg_type t
join pg_catalog.pg_namespace n on n.oid = t.typnamespace
where n.nspname in ('public', 'buscapet_private')
  and t.typtype = 'e'
order by 1, 2;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'pet-media';

select count(*) as auth_users from auth.users;
select count(*) as pet_media_objects from storage.objects where bucket_id = 'pet-media';

select n.nspname as schema_name, c.relname as table_name,
       c.reltuples::bigint as estimated_rows
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'buscapet_private') and c.relkind in ('r', 'p')
order by 1, 2;

select version, name from supabase_migrations.schema_migrations order by version;
