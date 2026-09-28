-- SPEC 14 — Autenticación: perfiles de usuario.
--
-- `profiles` es 1:1 con `auth.users` y sólo guarda el username público. El
-- email vive en `auth.users` y nunca se expone. Username siempre en minúsculas
-- (la UI lo pinta en mayúsculas), así el índice único no necesita `lower()`.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,16}$'),
  created_at timestamptz not null default now()
);
comment on table public.profiles is
  'Perfil público 1:1 con auth.users. Lo crea el trigger on_auth_user_created.';

create unique index profiles_username_key on public.profiles (username);

-- Lectura pública; sin políticas de insert/update/delete: sólo escribe el
-- trigger, que corre como propietario (`security definer`).
alter table public.profiles enable row level security;
create policy "perfiles son públicos" on public.profiles
  for select to anon, authenticated using (true);

-- Crea el perfil al dar de alta un usuario, venga del registro por email o de
-- OAuth. Nunca lanza por choque de username: si el candidato existe prueba
-- `<base><n>` hasta encontrar uno libre. Un error aquí abortaría el alta.
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
  -- Normaliza a [a-z0-9_]: minúsculas, sin tildes, espacios y guiones a `_`.
  base := translate(lower(candidato), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc');
  base := regexp_replace(base, '[\s\-\.]+', '_', 'g');
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
  base := left(base, 16);
  -- `rpad` también recorta, así que sólo se aplica a los cortos.
  if length(base) < 3 then
    base := rpad(base, 3, '_');
  end if;
  intento := base;
  loop
    if not exists (select 1 from public.profiles p where p.username = intento) then
      -- Dos altas simultáneas pueden pasar el `exists` a la vez: el índice
      -- único para a la segunda y aquí se reintenta con el siguiente sufijo.
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

-- La función sólo la invoca el trigger: nadie debe poder llamarla por RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
