-- Usuario de solo lectura para producción (conexión por Session pooler, puerto 5432).
-- Pegar a mano en el SQL Editor de prod. NO es una migración: no aplicar en dev.
-- Sustituir CAMBIA_ESTA_CLAVE_LARGA por una clave real antes de ejecutar; no commitear la clave.
--
-- Conexión:
--   postgresql://claude_ro.<PROJECT_REF>:<CLAVE>@aws-0-<region>.pooler.supabase.com:5432/postgres
--
-- Revocar:
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
-- bypassrls: las políticas select son sólo "to anon, authenticated"; sin él vería 0 filas.
-- bypassrls y los "set" no se heredan del rol: van en el usuario.
create user claude_ro with password 'CAMBIA_ESTA_CLAVE_LARGA' bypassrls inherit
  nocreatedb nocreaterole;
grant solo_lectura to claude_ro;
alter role claude_ro set default_transaction_read_only = on;
alter role claude_ro set statement_timeout = '15s';
alter role claude_ro set idle_in_transaction_session_timeout = '60s';
alter role claude_ro connection limit 3;
