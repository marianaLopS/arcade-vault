-- Usuario de solo lectura para producción (conexión por Session pooler, puerto 5432).
-- Pegar a mano en el SQL Editor de prod. NO es una migración: no aplicar en dev.
-- Sustituir CAMBIA_ESTA_CLAVE_LARGA por una clave real antes de ejecutar; no commitear la clave.
--
-- Conexión:
--   postgresql://claude_ro.<PROJECT_REF>:<CLAVE>@aws-0-<region>.pooler.supabase.com:5432/postgres
--
-- Revocar:
--   drop policy solo_lectura_select on public.games;
--   drop policy solo_lectura_select on public.scores;
--   drop policy solo_lectura_select on public.profiles;
--   drop owned by claude_ro; drop user claude_ro;
--   drop owned by solo_lectura; drop role solo_lectura;

-- Rol con los permisos, sin login
create role solo_lectura nologin;
grant usage on schema public to solo_lectura;
grant select on all tables in schema public to solo_lectura;
grant select on all sequences in schema public to solo_lectura;
alter default privileges for role postgres in schema public
  grant select on tables to solo_lectura;
-- EXECUTE en funciones llega por PUBLIC, no por solo_lectura: revocarlo de PUBLIC (actuales y futuras).
-- anon/authenticated/service_role conservan sus grants directos (default privileges de Supabase).
revoke execute on all functions in schema public from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- Usuario que se conecta, con su propia contraseña.
-- Sin bypassrls: las políticas select son sólo "to anon, authenticated", así que se añade una
-- política select explícita para solo_lectura en cada tabla (aplica también a sus miembros).
-- Tabla nueva (ensure_rls le activa RLS) = añadir aquí su política o claude_ro verá 0 filas.
-- Los "set" no se heredan del rol: van en el usuario.
create user claude_ro with password 'CAMBIA_ESTA_CLAVE_LARGA' nobypassrls inherit
  nocreatedb nocreaterole;
grant solo_lectura to claude_ro;
create policy solo_lectura_select on public.games for select to solo_lectura using (true);
create policy solo_lectura_select on public.scores for select to solo_lectura using (true);
create policy solo_lectura_select on public.profiles for select to solo_lectura using (true);
-- Ojo: default_transaction_read_only NO es una barrera (el usuario puede hacer "set transaction read write").
-- La barrera real son los privilegios: sólo select en tablas y sin create en el esquema. Se deja como red.
alter role claude_ro set default_transaction_read_only = on;
-- create en public llega por PUBLIC en Postgres < 15; revocarlo explícitamente (no-op si ya no lo tiene).
revoke create on schema public from public;
alter role claude_ro set statement_timeout = '15s';
alter role claude_ro set idle_in_transaction_session_timeout = '60s';
alter role claude_ro connection limit 3;

-- Verificación (todas deben devolver 0 filas / false):
--   select table_name, privilege_type from information_schema.role_table_grants
--     where grantee in ('claude_ro', 'solo_lectura', 'PUBLIC') and table_schema = 'public'
--       and privilege_type <> 'SELECT';
--   select has_schema_privilege('claude_ro', 'public', 'create');
--   select rolbypassrls from pg_roles where rolname = 'claude_ro';
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and has_function_privilege('claude_ro', p.oid, 'execute');
