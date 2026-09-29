-- Arcade Vault — arranque de la base de datos de PRODUCCIÓN.
--
-- Script único que deja un proyecto Supabase recién creado en el mismo estado
-- que dev tras las 8 migraciones de `supabase/migrations/` (hasta SPEC 15):
-- esquema, RLS, políticas, trigger de perfiles y catálogo `games`. NO copia
-- puntuaciones ni usuarios (son de prueba).
--
-- Uso: dashboard de prod > SQL Editor > pegar todo > Run. Es una transacción:
-- si algo falla no queda nada a medias. Se niega a correr dos veces.
-- Configuración del dashboard (Auth, OAuth, SMTP…): ver README.md de esta carpeta.

begin;

-- 0. Pre-chequeo: sólo sobre un proyecto vacío.
do $$
begin
  if to_regclass('public.games') is not null then
    raise exception 'public.games ya existe: este script sólo es para un proyecto vacío';
  end if;
end;
$$;

-- 1. RLS automática (SPEC 15). En dev la generó Supabase al crear el proyecto;
-- en prod puede no existir. Activa RLS en cada tabla nueva de `public`. Se crea
-- primero para que cubra también las tablas de este script.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
     if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog','information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
     else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     end if;
  end loop;
end;
$function$;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      execute function public.rls_auto_enable();
  end if;
-- Si el rol no puede crear event triggers, no se aborta: las tablas de este
-- script activan RLS explícitamente. Revisar el aviso (README, paso A).
exception when insufficient_privilege then
  raise warning 'No se pudo crear el event trigger ensure_rls: %', sqlerrm;
end;
$$;

-- SECURITY DEFINER: nadie de la API debe poder llamarla por /rest/v1/rpc.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 2. Juegos y puntuaciones (SPEC 06, + user_id de SPEC 15).
create table public.games (
  id text primary key,
  title text not null,
  created_at timestamptz not null default now()
);
comment on table public.games is
  'Juegos jugables. El id es el slug: segmento de URL y clave de GAME_ENGINES.';

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  player text not null check (player ~ '^[A-Z]{1,3}$'),
  score integer not null check (score >= 0 and score <= 1000000),
  created_at timestamptz not null default now(),
  user_id uuid null references auth.users (id) on delete set null
);
comment on table public.scores is
  'Puntuaciones anónimas. Insertables por cualquiera; no editables ni borrables.';
comment on column public.scores.user_id is
  'Cuenta que guardó la puntuación; null = invitado. Sólo se puede insertar la propia.';

create index scores_game_score_idx on public.scores (game_id, score desc, created_at);

create view public.game_stats with (security_invoker = true) as
  select game_id,
         max(score)::integer as best,
         count(*)::integer as plays
  from public.scores
  group by game_id;

alter table public.games enable row level security;
alter table public.scores enable row level security;

create policy "games son públicos" on public.games
  for select to anon, authenticated using (true);
create policy "scores son públicas" on public.scores
  for select to anon, authenticated using (true);
-- Sin políticas de update ni delete: nadie edita ni borra.
create policy "invitados o la propia cuenta guardan puntuación" on public.scores
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- 3. Perfiles (SPEC 14).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,16}$'),
  created_at timestamptz not null default now()
);
comment on table public.profiles is
  'Perfil público 1:1 con auth.users. Lo crea el trigger on_auth_user_created.';

create unique index profiles_username_key on public.profiles (username);

alter table public.profiles enable row level security;
create policy "perfiles son públicos" on public.profiles
  for select to anon, authenticated using (true);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidato text;
  base text;
  intento text;
  n integer := 0;
begin
  candidato := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(new.raw_user_meta_data ->> 'user_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );
  base := translate(lower(candidato), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc');
  base := regexp_replace(base, '[\s\-\.]+', '_', 'g');
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
  base := left(base, 16);
  if length(base) < 3 then
    base := rpad(base, 3, '_');
  end if;
  intento := base;
  loop
    if not exists (select 1 from public.profiles p where p.username = intento) then
      begin
        insert into public.profiles (id, username) values (new.id, intento);
        return new;
      exception when unique_violation then
        null;
      end;
    end if;
    n := n + 1;
    intento := left(base, 16 - length(n::text)) || n::text;
  end loop;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Catálogo de juegos jugables (SPEC 06–10 y game-jam ranaria).
insert into public.games (id, title) values
  ('asteroids', 'ASTEROIDS'),
  ('caida', 'TETRIS'),
  ('arkanoid', 'ARKANOID'),
  ('snake', 'SNAKE'),
  ('frogger', 'FROGGER');

commit;

-- 5. Verificación (ejecutar aparte, después del commit). Resultado esperado:
-- games: 5 filas · rls: 3 filas con true · políticas: 4 · trigger: 1 ·
-- funciones: sin anon/authenticated en el ACL · evento: ensure_rls.
--
-- select id, title from public.games order by created_at;
-- select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r';
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public';
-- select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created';
-- select proname, proacl from pg_proc where pronamespace = 'public'::regnamespace;
-- select evtname from pg_event_trigger where evtname = 'ensure_rls';
